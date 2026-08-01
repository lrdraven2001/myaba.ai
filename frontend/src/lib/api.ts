import { auth } from './firebase';
import type {
  Chat,
  ChatMessage,
  Client,
  DriveConnection,
  DriveVerifyResult,
  EhrClientRecord,
  EhrConnectionStatus,
  FederationConfig,
  Org,
  OrgAclxPolicy,
  OrgPlan,
  OrgPolicyRule,
  OrgPolicyRuleType,
  OfficePuzzleImportResult,
  PolicyDocument,
  Project,
  ProjectKnowledgeDoc,
  AgreementStatus,
  ReviewQueueItem,
  ReviewVerdict,
  RoleConfig,
  SearchResponse,
  SubjectAuthorization,
  Template,
  UsageSummary,
  UsageHistoryEntry,
} from '../types';

const API_BASE = '/api';
// Long-running AI calls (chat, document generation) can take >60s, which exceeds
// the Firebase Hosting proxy timeout (→ HTTP 502 even though Cloud Run finishes).
// Point those at Cloud Run DIRECTLY (300s limit) via VITE_DIRECT_API_URL. Unset in
// local dev → falls back to the same /api proxy, so dev is unaffected. The service
// is public and CORS allows the app origins, so direct calls authenticate normally.
const LONG_API_BASE = import.meta.env.VITE_DIRECT_API_URL
  ? `${import.meta.env.VITE_DIRECT_API_URL}/api`
  : API_BASE;
const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === 'true';

// ── Auth headers ──────────────────────────────────────────────────────────────

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (DEV_AUTH) {
    return { 'Content-Type': 'application/json' };
  }
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const token = await user.getIdToken();
  // Custom header (not Authorization): the Firebase Hosting → Cloud Run edge
  // rejects a Bearer token in the Authorization header (Cloud Run IAM eats it),
  // so the token must ride in a header the edge leaves untouched.
  return {
    'Content-Type': 'application/json',
    'X-Firebase-Token': token,
  };
}

/**
 * Structured API error that preserves the full error body from the backend.
 *
 * The `code` field maps to backend-defined error codes such as
 * `CROSS_CLIENT_PHI_INPUT` so callers can handle specific conditions
 * without string-matching on the human-readable message.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string | undefined,
    public readonly details: Record<string, unknown>,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}, base: string = API_BASE): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string>) },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    // Server-enforced session cap reached — tell the app to sign the user out.
    if (res.status === 401 && body.code === 'SESSION_EXPIRED') {
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
    }
    throw new ApiError(
      body.error || `HTTP ${res.status}`,
      body.code as string | undefined,
      body as Record<string, unknown>,
      res.status,
    );
  }

  // 204 No Content — return undefined cast as T
  if (res.status === 204) return undefined as T;

  return res.json();
}

/** POST { title, content } to a document-export endpoint and trigger a file download. */
async function downloadDoc(format: 'docx' | 'xlsx', title: string, content: string) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/documents/export/${format}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title, content }),
  });
  if (!res.ok) throw new Error(`Failed to export ${format.toUpperCase()} (HTTP ${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(title || 'document').replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'document'}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── API surface ───────────────────────────────────────────────────────────────

/** Fields accepted when creating/updating a resource (Library / Policies / Grounding / Templates). */
export interface ResourceInput {
  title?: string;
  category?: string;
  textContent?: string;
  isActive?: boolean;
  /** Bucket: LIBRARY | GROUNDING | POLICY */
  bucket?: string;
  resourceType?: string;
  purposes?: string[];
  /** For GENERATION_TEMPLATE resources — the client document type it customizes. */
  documentType?: string;
  customized?: boolean;
  clientId?: string;
  /** Archive-first: HIPAA-marked resources can only be deleted 7 days after archiving. */
  hipaaMarked?: boolean;
  description?: string;
  /** Topical category pill (Billing | Clinical | Supervision | …). */
  topicCategory?: string;
  /** File format: PDF | DOCX | PPTX | XLSX | LINK | TEXT. */
  fileType?: string;
  /** Origin: DRIVE | ONEDRIVE | WEB | UPLOAD | MANUAL. */
  source?: string;
  url?: string;
  folder?: string;
  shared?: boolean;
  archived?: boolean;
  linkedIds?: string[];
}

export const api = {

  // ── Chats ─────────────────────────────────────────────────────────────────

  /** List all chats accessible to the current user, most-recent-first. */
  getChats: () => request<Chat[]>('/chats'),

  /** Reviewer/oversight: ALL org chats (Chat Review tab). Admin-gated server-side. */
  getAllOrgChats: () => request<Chat[]>('/chats/all'),

  /** Get chat metadata. */
  getChat: (chatId: string) => request<Chat>(`/chats/${chatId}`),

  /** Get message history for a chat (oldest-first). */
  getChatMessages: (chatId: string) => request<ChatMessage[]>(`/chats/${chatId}/messages`),

  // ── Chat working documents (persist to a chat, not a library) ──────────────

  /** List a chat's working documents (id, name, content) — re-hydrated on chat open. */
  getChatAttachments: (chatId: string) =>
    request<{ id: string; name: string; content?: string }[]>(`/chats/${chatId}/attachments`),

  /** Persist an uploaded document to this chat (content = already-extracted text). */
  addChatAttachment: (chatId: string, name: string, content: string, sourceFilename?: string) =>
    request<{ id: string; name: string }>(`/chats/${chatId}/attachments`, {
      method: 'POST',
      body: JSON.stringify({ name, content, sourceFilename }),
    }),

  /** Remove one working document from a chat. */
  deleteChatAttachment: (chatId: string, attachmentId: string) =>
    request<void>(`/chats/${chatId}/attachments/${attachmentId}`, { method: 'DELETE' }),

  /** Reviewer/oversight: messages for any org chat (Chat Review tab). Admin-gated. */
  getChatReviewMessages: (chatId: string) => request<ChatMessage[]>(`/chats/${chatId}/review-messages`),

  // ── Communication-style learning (Phase 2) ─────────────────────────────────
  /** Record a PHI-free style signal (regeneration adjustment or thumbs). */
  recordStyleSignal: (signal: string, surface = 'chat', note?: string) =>
    request<{ recorded: boolean }>('/style-signals', {
      method: 'POST',
      body: JSON.stringify(note ? { signal, surface, note } : { signal, surface }),
    }),
  /** Distilled style suggestions for the org (admin). */
  getStyleCandidates: (orgId: string) =>
    request<Array<{ key: string; label: string; description: string; field: string; value: string }>>(
      `/orgs/${orgId}/style-candidates`),
  applyStyleCandidate: (orgId: string, key: string) =>
    request(`/orgs/${orgId}/style-candidates/apply`, { method: 'POST', body: JSON.stringify({ key }) }),
  dismissStyleCandidate: (orgId: string, key: string) =>
    request(`/orgs/${orgId}/style-candidates/dismiss`, { method: 'POST', body: JSON.stringify({ key }) }),

  /** Create a new chat. Returns { chatId }. */
  createChat: (data: {
    title: string;
    clientId?: string;
    projectId?: string;
    projectLabel?: string;
    policyIds?: string[];
  }) =>
    request<{ chatId: string }>('/chats', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Rename a chat (owner or admin). */
  updateChatTitle: (chatId: string, title: string) =>
    request<void>(`/chats/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),

  /** Attach (clientId) or detach ('') a client on an existing chat. */
  setChatClient: (chatId: string, clientId: string) =>
    request<void>(`/chats/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify({ clientId }),
    }),

  /** Delete a chat and all its messages. */
  deleteChat: (chatId: string) =>
    request<void>(`/chats/${chatId}`, { method: 'DELETE' }),

  // ── EHR Integrations ──────────────────────────────────────────────────────

  /** List connection status for all supported EHR systems. */
  getEhrConnections: () =>
    request<EhrConnectionStatus[]>('/ehr/connections'),

  /**
   * Connect an EHR by supplying credentials.
   * CentralReach: { apiToken, subdomain }
   * Rethink:      { apiKey, accountId }
   */
  connectEhr: (type: string, credentials: Record<string, string>) =>
    request<EhrConnectionStatus>(`/ehr/connections/${type}`, {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),

  /** Remove an EHR integration and wipe stored credentials. */
  disconnectEhr: (type: string) =>
    request<{ message: string }>(`/ehr/connections/${type}`, { method: 'DELETE' }),

  /** Search clients by name in the connected EHR. */
  searchEhrClients: (type: string, query: string) =>
    request<{ results: EhrClientRecord[]; count: number }>(
      `/ehr/connections/${type}/clients?q=${encodeURIComponent(query)}`
    ),

  /**
   * Link an EHR client to a myABA client and pull their record.
   * Updates the myABA client document with EHR demographics.
   */
  syncEhrClient: (type: string, ehrClientId: string, myabaClientId: string) =>
    request<{ record: EhrClientRecord; message: string }>(
      `/ehr/connections/${type}/sync`,
      { method: 'POST', body: JSON.stringify({ ehrClientId, myabaClientId }) }
    ),

  // ── Usage ─────────────────────────────────────────────────────────────────

  /** Get the current-period AI usage summary for the caller's org. */
  getUsage: () =>
    request<UsageSummary>('/usage'),

  /** Get monthly usage history (oldest→newest) for agency reporting. */
  getUsageHistory: (months = 12) =>
    request<{ history: UsageHistoryEntry[] }>(`/usage/history?months=${months}`),

  // ── Billing (Stripe) ────────────────────────────────────────────────────────

  /** Billing snapshot: plan, subscription status, period end, recent invoices. */
  getBillingSummary: () =>
    request<BillingSummary>('/billing/summary'),

  /** Start a hosted Checkout Session for a plan; returns the URL to redirect to. */
  startCheckout: (plan: string) =>
    request<{ url: string }>('/billing/checkout', { method: 'POST', body: JSON.stringify({ plan }) }),

  /** Open the Stripe Billing Portal (manage plan / payment method / invoices). */
  openBillingPortal: () =>
    request<{ url: string }>('/billing/portal', { method: 'POST' }),

  /**
   * Set (or clear) a custom monthly request cap for an enterprise org.
   * Admin only. Pass null to remove the cap (revert to unlimited).
   */
  setUsageLimit: (limit: number | null) =>
    request<{ limit: number | null; message: string }>('/usage/limit', {
      method: 'PUT',
      body: JSON.stringify({ limit }),
    }),

  // ── AI chat (inference + optional persistence) ────────────────────────────

  /**
   * Send a message to the AI.
   * Pass chatId to persist the conversation to Firestore.
   * Pass multiple clientIds for cross-client queries (ACLX governs the output).
   */
  chat: (
    message: string,
    history: ChatMessage[] = [],
    clientId?: string,
    clientIds?: string[],
    chatId?: string,
    contextDocs?: { name: string; content: string }[],
    signal?: AbortSignal,
  ) =>
    request<{ reply: string; decision: string; chatId?: string }>('/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        chatId,
        clientId,
        clientIds: clientIds && clientIds.length > 1 ? clientIds : undefined,
        history: history.map((m) => ({ role: m.role, content: m.content })),
        contextDocs: contextDocs && contextDocs.length > 0 ? contextDocs : undefined,
      }),
      // Lets the caller cancel an in-flight generation (the chat "Stop" button).
      signal,
    }, LONG_API_BASE),

  // ── Clients ───────────────────────────────────────────────────────────────

  getClients: () => request<Client[]>('/clients'),

  getClient: (clientId: string) => request<Client>(`/clients/${clientId}`),  // returns plain Client object

  createClient: (data: Partial<Client>) =>
    request<{ clientId: string }>('/clients', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateClient: (clientId: string, data: Partial<Client>) =>
    request<void>(`/clients/${clientId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  /** Archive or unarchive a client (hides it from the default Active list). */
  archiveClient: (clientId: string, archived: boolean) =>
    request<void>(`/clients/${clientId}/archive`, {
      method: 'PUT',
      body: JSON.stringify({ archived }),
    }),

  /** Download a client's full record (demographics, team, chats, documents) as a single JSON archive. */
  exportClient: async (clientId: string, clientName?: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/clients/${clientId}/export`, { headers });
    if (!res.ok) throw new Error(`Failed to export client (HTTP ${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safe = (clientName || clientId).replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || clientId;
    a.download = `${safe}-archive.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  updateClientAuthorizations: (
    clientId: string,
    data: {
      treatingBcbaId?: string;
      supervisorIds?: string[];
      supervisingBcbaId?: string;
      rbtIds?: string[];
      viewerIds?: string[];
    },
  ) =>
    request<void>(`/clients/${clientId}/authorizations`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // ── Projects ──────────────────────────────────────────────────────────────

  getProjects: () => request<Project[]>('/projects'),

  getProject: (projectId: string) => request<Project>(`/projects/${projectId}`),

  createProject: (data: {
    title: string;
    description?: string;
    instructions?: string;
    clientIds?: string[];
    isShared?: boolean;
    containsPhi?: boolean;
    members?: Record<string, string>;
  }) =>
    request<{ projectId: string }>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateProject: (
    projectId: string,
    data: {
      title?: string;
      description?: string;
      instructions?: string;
      clientIds?: string[];
      isShared?: boolean;
      containsPhi?: boolean;
    },
  ) =>
    request<void>(`/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // ── Project knowledge docs ────────────────────────────────────────────────

  /** List all knowledge documents attached to a project. */
  getProjectKnowledge: (projectId: string) =>
    request<ProjectKnowledgeDoc[]>(`/projects/${projectId}/knowledge`),

  /** Add a knowledge document to a project. Returns { docId }. */
  addProjectKnowledge: (projectId: string, title: string, textContent: string) =>
    request<{ docId: string }>(`/projects/${projectId}/knowledge`, {
      method: 'POST',
      body: JSON.stringify({ title, textContent }),
    }),

  /** Remove a knowledge document from a project. */
  deleteProjectKnowledge: (projectId: string, docId: string) =>
    request<void>(`/projects/${projectId}/knowledge/${docId}`, { method: 'DELETE' }),

  /** Upload a file (PDF/DOC(X)/Excel/image/text) as project knowledge. Original is
   *  stored in GCS; extraction runs async server-side. Requires the project to be
   *  PHI-flagged (throws with the server's message otherwise). */
  uploadProjectKnowledgeFile: async (projectId: string, file: File, title?: string):
      Promise<{ docId: string; title: string; status?: string }> => {
    const headers = await getAuthHeaders();
    const h: Record<string, string> = {};
    if (headers['X-Firebase-Token']) h['X-Firebase-Token'] = headers['X-Firebase-Token'];
    const form = new FormData();
    form.append('file', file);
    if (title) form.append('title', title);
    const res = await fetch(`${API_BASE}/projects/${projectId}/knowledge/upload`, {
      method: 'POST', headers: h, body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || `Failed to upload document (HTTP ${res.status})`);
    }
    return res.json();
  },

  /** Signed URL to download a project knowledge doc's original file, then opens it. */
  openProjectKnowledgeOriginal: async (projectId: string, docId: string): Promise<void> => {
    const { url } = await request<{ url: string }>(`/projects/${projectId}/knowledge/${docId}/original`);
    if (url) window.open(url, '_blank', 'noopener');
  },

  /**
   * Change an existing member's role (built-in or custom). Admin-only. Re-mints the member's
   * claims server-side; the affected user picks up the new role on their next token refresh.
   * This is the sanctioned role-change path — invites only onboard new users.
   */
  changeMemberRole: (orgId: string, uid: string, role: string) =>
    request<{ uid: string; role: string; phiAccess?: boolean }>(
      `/orgs/${orgId}/members/${uid}/role`,
      { method: 'PUT', body: JSON.stringify({ role }) },
    ),

  /**
   * Set a member's AI seat tier ("full" | "lite"). Admin-only. A lite seat is Flash-only and
   * can't generate documents — orthogonal to the clinical role. See docs/ai-tiers.md.
   */
  changeMemberAiTier: (orgId: string, uid: string, tier: 'full' | 'lite') =>
    request<{ uid: string; aiTier: string }>(
      `/orgs/${orgId}/members/${uid}/ai-tier`,
      { method: 'PUT', body: JSON.stringify({ tier }) },
    ),

  /** List a project's members (owner + explicit members) with roles. */
  getProjectMembers: (projectId: string) =>
    request<{ id: string; role: string; name?: string; email?: string }[]>(`/projects/${projectId}/members`),

  /** Share a project with a user (role: 'editor' | 'viewer'). */
  shareProject: (projectId: string, userId: string, role: 'editor' | 'viewer') =>
    request<void>(`/projects/${projectId}/members/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),

  /** Remove a member from a project. */
  removeProjectMember: (projectId: string, userId: string) =>
    request<void>(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' }),

  deleteProject: (projectId: string) =>
    request<void>(`/projects/${projectId}`, { method: 'DELETE' }),

  /** Soft-deleted projects still within the 48h restore window (super admin only). */
  getTrashedProjects: () => request<Project[]>('/projects/trash'),

  /** Restore a soft-deleted project (super admin only, within 48h). */
  restoreProject: (projectId: string) =>
    request<{ success: boolean }>(`/projects/${projectId}/restore`, { method: 'POST' }),

  // ── Templates ─────────────────────────────────────────────────────────────

  /**
   * Strip PHI from AI-generated text so it can be saved as a reusable template.
   * The backend looks up the client record and replaces name / DOB with
   * {{clientName}} / {{dateOfBirth}} placeholders.
   *
   * Returns the sanitized content and a list of field categories that were
   * found and replaced (e.g. ["full name", "date of birth"]).
   */
  deidentifyForTemplate: (clientId: string, content: string) =>
    request<{ deidentifiedContent: string; redactedFields: string[] }>('/templates/deidentify', {
      method: 'POST',
      body: JSON.stringify({ clientId, content }),
    }),

  getTemplates: () => request<Template[]>('/templates'),

  getTemplate: (templateId: string) => request<Template>(`/templates/${templateId}`),

  createTemplate: (data: {
    title: string;
    category: string;
    content?: string;
    visibleToRoles?: string[];
  }) =>
    request<{ templateId: string }>('/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateTemplate: (
    templateId: string,
    data: {
      title?: string;
      category?: string;
      content?: string;
      visibleToRoles?: string[];
    },
  ) =>
    request<void>(`/templates/${templateId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteTemplate: (templateId: string) =>
    request<void>(`/templates/${templateId}`, { method: 'DELETE' }),

  // ── Policies ──────────────────────────────────────────────────────────────

  getPolicies: () => request<PolicyDocument[]>('/policies'),

  getPolicy: (policyId: string) => request<PolicyDocument>(`/policies/${policyId}`),

  createPolicy: (data: ResourceInput & { title: string; category: string }) =>
    request<{ policyId: string }>('/policies', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updatePolicy: (policyId: string, data: ResourceInput) =>
    request<void>(`/policies/${policyId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deletePolicy: (policyId: string) =>
    request<void>(`/policies/${policyId}`, { method: 'DELETE' }),

  /** Archive / unarchive a resource (soft — keeps it for restore). */
  setResourceArchived: (policyId: string, archived: boolean) =>
    request<void>(`/policies/${policyId}`, {
      method: 'PUT',
      body: JSON.stringify({ archived }),
    }),

  getResources: (purpose?: string, clientId?: string) => {
    const params = new URLSearchParams();
    if (purpose) params.append('purpose', purpose);
    if (clientId) params.append('clientId', clientId);
    const qs = params.toString();
    return request<unknown>('/policies/resources' + (qs ? '?' + qs : ''));
  },

  // ── Organizations ─────────────────────────────────────────────────────────

  /** Create a new organization (called during onboarding). Returns { orgId }. */
  createOrg: (data: {
    name: string;
    plan: OrgPlan;
    adminDisplayName?: string;
    /** "clinical_director" (default) or "it_setup" */
    setupMode?: 'clinical_director' | 'it_setup';
  }) =>
    request<{ orgId: string }>('/orgs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Whether the signed-in user is approved (Pathfinder allowlist) to create an org. */
  getOrgEligibility: () =>
    request<{ allowed: boolean; email: string }>('/orgs/eligibility'),

  /** Get org metadata. */
  getOrg: (orgId: string) => request<Org>(`/orgs/${orgId}`),

  /** The current user's resolved capabilities (matrix + custom roles) for UI gating. */
  getMyPermissions: () =>
    request<{ capabilities: string[]; phiAccess: boolean; levels: Record<string, string> }>(`/me/permissions`),

  /** Per-org role configuration: permission-matrix overrides, custom roles, IdP role mappings. */
  getRoleConfig: (orgId: string) =>
    request<RoleConfig>(`/orgs/${orgId}/role-config`),
  saveRoleConfig: (orgId: string, config: RoleConfig) =>
    request<RoleConfig>(`/orgs/${orgId}/role-config`, {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  /** Update the org's display name and optional home locality (ORG_ADMIN only). */
  updateOrgName: (orgId: string, name: string, city?: string, state?: string) =>
    request<{ name: string }>(`/orgs/${orgId}/name`, {
      method: 'PUT',
      body: JSON.stringify(
        city !== undefined || state !== undefined ? { name, city, state } : { name },
      ),
    }),

  /** Get the org's insurance company list (all members). */
  getInsuranceCompanies: (orgId: string) =>
    request<{ companies: string[] }>(`/orgs/${orgId}/insurance-companies`),

  /** Replace the org's insurance company list (ORG_ADMIN only). */
  setInsuranceCompanies: (orgId: string, companies: string[]) =>
    request<{ companies: string[] }>(`/orgs/${orgId}/insurance-companies`, {
      method: 'PUT',
      body: JSON.stringify({ companies }),
    }),

  /** Update one or more org settings keys (ORG_ADMIN only). */
  updateOrgSettings: (orgId: string, settings: Record<string, unknown>) =>
    request<void>(`/orgs/${orgId}/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  /** Get the BAA acceptance status for the org. Returns { accepted: false } if not yet signed. */
  getBaaStatus: (orgId: string) =>
    request<AgreementStatus>(`/orgs/${orgId}/baa`),

  /** Download the executed BAA as a PDF. */
  downloadBaa: async (orgId: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/orgs/${orgId}/baa/document`, { headers });
    if (!res.ok) throw new Error(`Failed to download BAA (HTTP ${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BAA-${orgId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  /** Record BAA acceptance (ORG_ADMIN only). */
  acceptBaa: (orgId: string, data: { signerName: string; signerTitle: string }) =>
    request<AgreementStatus>(`/orgs/${orgId}/baa`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Update the signed-in user's own profile (display name; email synced after verification). */
  updateMyProfile: (data: { displayName?: string; email?: string }) =>
    request<{ success: boolean }>('/me/profile', { method: 'PUT', body: JSON.stringify(data) }),

  // ── Notifications ───────────────────────────────────────────────────────────

  getNotifications: () =>
    request<{ items: Array<{
      id: string; title: string; body?: string; level?: string; type?: string;
      link?: string; read?: boolean; createdAt?: string;
    }>; unread: number }>('/notifications'),

  markNotificationRead: (id: string) =>
    request<{ success: boolean }>(`/notifications/${id}/read`, { method: 'POST' }),

  markAllNotificationsRead: () =>
    request<{ success: boolean }>('/notifications/read-all', { method: 'POST' }),

  /** Admin: send a system message to the whole team. */
  broadcastNotification: (orgId: string, data: { title: string; body?: string; level?: string }) =>
    request<{ sent: number }>(`/orgs/${orgId}/notifications/broadcast`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Service Contract acceptance status. */
  getServiceContractStatus: (orgId: string) =>
    request<AgreementStatus>(`/orgs/${orgId}/service-contract`),

  /** Record Service Contract acceptance (admin only). */
  acceptServiceContract: (orgId: string, data: { signerName: string; signerTitle: string }) =>
    request<AgreementStatus>(`/orgs/${orgId}/service-contract`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Download the executed Service Contract as a PDF. */
  downloadServiceContract: async (orgId: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/orgs/${orgId}/service-contract/document`, { headers });
    if (!res.ok) throw new Error(`Failed to download Service Contract (HTTP ${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ServiceContract-${orgId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  /** Assign or clear the supervisor for a member. Pass empty string to clear. Admin only. */
  setMemberSupervisor: (orgId: string, uid: string, supervisorId: string) =>
    request<void>(`/orgs/${orgId}/members/${uid}/supervisor`, {
      method: 'PUT',
      body: JSON.stringify({ supervisorId }),
    }),

  /** Returns the list of members for the org. Admin only. */
  getOrgMembers: (orgId: string) =>
    request<Array<{ id: string; displayName: string; email: string; role: string; active: boolean }>>(
      `/orgs/${orgId}/members`,
    ),

  /**
   * Generate an invite link. When {@code email} is given the backend also emails the link
   * (server-side) and reports emailSent / emailError. Returns { inviteUrl, emailSent?, emailError? }.
   */
  generateInvite: (orgId: string, role: string, email?: string, roleLabel?: string) =>
    request<{ inviteUrl: string; emailSent?: boolean; emailError?: string }>(`/orgs/${orgId}/invite`, {
      method: 'POST',
      body: JSON.stringify({ role, email, roleLabel }),
    }),

  /** List pending (unclaimed, unexpired) invite links. Admin only. */
  listInvites: (orgId: string) =>
    request<Array<{ id: string; token: string; role: string; createdBy: string; expiresAt: string; inviteUrl: string }>>(
      `/orgs/${orgId}/invites`,
    ),

  /** Revoke a pending invite. Admin only. */
  revokeInvite: (orgId: string, token: string) =>
    request<void>(`/orgs/${orgId}/invites/${token}`, { method: 'DELETE' }),

  /** Recent AI activity for a member (from the audit log). Admin only. */
  getMemberActivity: (orgId: string, uid: string) =>
    request<Array<{ eventType: string; clientId?: string; documentId?: string; decision?: string; timestamp: string }>>(
      `/orgs/${orgId}/members/${uid}/activity`,
    ),

  /** Preview an invite link (doesn't consume it). Returns { orgId, orgName, role, mfaEnforced }. */
  resolveInvite: (token: string) =>
    request<{ orgId: string; orgName: string; role: string; mfaEnforced?: boolean }>(`/invite/${token}`),

  /** Claim an invite token and apply role/org claims to the current user. */
  claimInvite: (token: string) =>
    request<{ message: string }>(`/invite/${token}/claim`, { method: 'POST' }),

  /**
   * Auto-claim a pending invite addressed to the signed-in user's verified email — used when
   * an email-invited user signs in with Google/password without the invite link. Returns
   * { claimed, orgId?, role? }.
   */
  claimInviteByEmail: () =>
    request<{ claimed: boolean; orgId?: string; role?: string }>(`/invite/claim-by-email`, { method: 'POST' }),

  // ── Federation (enterprise SSO) ───────────────────────────────────────────

  /** List federation IdP configs for the org (ORG_SUPER_ADMIN only). */
  getFederationConfigs: (orgId: string) =>
    request<FederationConfig[]>(`/orgs/${orgId}/federation`),

  /** Create a new OIDC or SAML IdP config. Returns { configId }. */
  createFederationConfig: (orgId: string, data: Partial<FederationConfig> & { x509Certificate?: string }) =>
    request<{ configId: string }>(`/orgs/${orgId}/federation`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Update an existing federation config. */
  updateFederationConfig: (orgId: string, configId: string, data: Partial<FederationConfig> & { x509Certificate?: string }) =>
    request<void>(`/orgs/${orgId}/federation/${configId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  /** Delete a federation config. */
  deleteFederationConfig: (orgId: string, configId: string) =>
    request<void>(`/orgs/${orgId}/federation/${configId}`, { method: 'DELETE' }),

  // ── Documents ─────────────────────────────────────────────────────────────

  getClientDocuments: (clientId: string) =>
    request<{ documents: { id: string; documentType?: string; title?: string; createdAt?: string;
                           gcsObject?: string; sourceFilename?: string; contentHash?: string }[] }>(
      `/clients/${clientId}/documents`,
    ),

  /** Fetch a single persisted client document INCLUDING its content (for chat context). */
  getClientDocument: (clientId: string, docId: string) =>
    request<{ id: string; documentType?: string; content?: string; createdAt?: string }>(
      `/clients/${clientId}/documents/${docId}`,
    ),

  uploadDocument: async (clientId: string, formData: FormData) => {
    if (DEV_AUTH) {
      const res = await fetch(`${API_BASE}/clients/${clientId}/documents`, {
        method: 'POST',
        body: formData,
      });
      return res.json();
    }
    const token = await auth.currentUser!.getIdToken();
    const res = await fetch(`${API_BASE}/clients/${clientId}/documents`, {
      method: 'POST',
      headers: { 'X-Firebase-Token': token },
      body: formData,
    });
    return res.json();
  },

  // ── OfficePuzzle import ───────────────────────────────────────────────────

  /**
   * Upload an OfficePuzzle / BehaviorSoft client-roster export and import
   * the clients into myABA. Accepts .xlsx, .xls, or .csv files.
   * Caller must be an ORG_ADMIN.
   */
  importOfficePuzzle: async (file: File): Promise<OfficePuzzleImportResult> => {
    const form = new FormData();
    form.append('file', file);

    // For multipart uploads we cannot use the JSON request() helper because
    // it sets Content-Type: application/json. We must let the browser set
    // the multipart boundary automatically.
    let authHeaders: Record<string, string> = {};
    if (!DEV_AUTH) {
      const token = await auth.currentUser!.getIdToken();
      authHeaders = { 'X-Firebase-Token': token };
    }

    const res = await fetch(`${API_BASE}/import/officepuzzle`, {
      method: 'POST',
      headers: authHeaders,
      body: form,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(
        body.error || `HTTP ${res.status}`,
        body.code as string | undefined,
        body as Record<string, unknown>,
        res.status,
      );
    }
    return res.json() as Promise<OfficePuzzleImportResult>;
  },

  // ── AI Generation ─────────────────────────────────────────────────────────

  generateDocument: (clientId: string, documentType: string, additionalContext?: string) =>
    request<{
      content: string;
      documentId: string;
      decision: string;
      contentId: string;
      contentLabel?: unknown;
      redactedTokenCount?: number;
      groundednessScore?: number;
      groundednessWarning?: boolean;
      detectorFindings?: Array<{ detector: string; matched: boolean; confidence: string; category: string }>;
      redactionMetadata?: Array<{ category: string; detector: string; position: number }>;
    }>('/generate-document', {
      method: 'POST',
      body: JSON.stringify({ clientId, documentType, additionalContext }),
    }, LONG_API_BASE),

  /** Download generated text as a Word (.docx) file. */
  exportDocx: (title: string, content: string) => downloadDoc('docx', title, content),

  /** Download generated text (Markdown tables become a grid) as an Excel (.xlsx) file. */
  exportXlsx: (title: string, content: string) => downloadDoc('xlsx', title, content),

  /** Extract plain text from an uploaded Word (.docx) template. */
  extractTemplateDocx: async (file: File): Promise<string> => {
    const headers = await getAuthHeaders();
    // Drop the JSON Content-Type so the browser sets the multipart boundary.
    const h: Record<string, string> = {};
    if (headers['X-Firebase-Token']) h['X-Firebase-Token'] = headers['X-Firebase-Token'];
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE}/documents/template/extract`, { method: 'POST', headers: h, body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || `Failed to read Word document (HTTP ${res.status})`);
    }
    const data = await res.json();
    return (data.text as string) ?? '';
  },

  /**
   * Upload a document directly to a client's record (Word/PDF/Excel/text).
   * Text is extracted server-side and stored with the client's documents.
   */
  /** Upload a client document. Extraction runs async server-side; the doc appears
   *  in the Documents tab as "Processing" and flips to ready when extraction finishes. */
  uploadClientDocument: async (clientId: string, file: File, title?: string):
      Promise<{ docId: string; title: string; status?: string }> => {
    const headers = await getAuthHeaders();
    const h: Record<string, string> = {};
    if (headers['X-Firebase-Token']) h['X-Firebase-Token'] = headers['X-Firebase-Token'];
    const form = new FormData();
    form.append('file', file);
    if (title) form.append('title', title);
    const res = await fetch(`${API_BASE}/clients/${clientId}/documents/upload`, {
      method: 'POST', headers: h, body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || `Failed to upload document (HTTP ${res.status})`);
    }
    return res.json();
  },

  /** Delete a stored client document (Firestore record + GCS original). Backs the chat "Undo". */
  deleteClientDocument: (clientId: string, docId: string) =>
    request<{ success: boolean }>(`/clients/${clientId}/documents/${docId}`, { method: 'DELETE' }),

  /** Signed URL to download a client document's original file, then opens it. */
  openClientDocumentOriginal: async (clientId: string, docId: string): Promise<void> => {
    const { url } = await request<{ url: string }>(`/clients/${clientId}/documents/${docId}/original`);
    if (url) window.open(url, '_blank', 'noopener');
  },

  /**
   * Upload a document (Word/PDF/Excel/text/image) and get its extracted text.
   * Extraction runs asynchronously server-side (scanned OCR, figure/chart vision,
   * large files can take a while) so the upload never times the gateway out; this
   * submits the job and polls until it's ready. Same return shape as before, so
   * callers are unchanged.
   */
  extractAttachment: async (file: File): Promise<{ name: string; text: string; chars: number }> => {
    const headers = await getAuthHeaders();
    const h: Record<string, string> = {};
    if (headers['X-Firebase-Token']) h['X-Firebase-Token'] = headers['X-Firebase-Token'];
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE}/documents/attachment/extract-async`, { method: 'POST', headers: h, body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || `Failed to read file (HTTP ${res.status})`);
    }
    const { jobId } = await res.json() as { jobId: string };

    // Poll the job. Extraction of large/scanned documents can take a while;
    // each poll is a cheap request, so the upload itself never times out.
    const deadlineMs = Date.now() + 4 * 60 * 1000; // 4 minutes
    while (Date.now() < deadlineMs) {
      await new Promise((r) => setTimeout(r, 1500));
      const job = await request<{ status: string; name: string; text?: string; chars?: number; error?: string }>(
        `/documents/extraction/${jobId}`);
      if (job.status === 'READY') return { name: job.name, text: job.text ?? '', chars: job.chars ?? 0 };
      if (job.status === 'FAILED') throw new Error(job.error || 'Could not read the file.');
    }
    throw new Error('Reading this file is taking longer than expected. Please try again.');
  },

  // ── Compliance dashboard ──────────────────────────────────────────────────

  /** ACLX governance summary for the admin compliance dashboard. Admin only. */
  getComplianceSummary: (days = 30) =>
    request<{
      periodDays: number;
      totalEvents: number;
      decisionCounts: Record<string, number>;
      eventTypeCounts: Record<string, number>;
      topDetectors: Record<string, number>;
      synthesisEvents: number;
      totalRedactions: number;
      latestPolicyVersion: string | null;
      recentEscalations: Array<{
        eventType: string;
        timestamp: string;
        sensitivity: string | null;
        contentId: string;
        synthesis: boolean;
      }>;
    }>(`/compliance/summary?days=${days}`),

  /** Recent ACLX audit events (metadata only). Admin only. */
  getComplianceEvents: (days = 7, limit = 50) =>
    request<{
      events: Array<{
        id: string;
        eventType: string;
        timestamp: string;
        decision: string;
        sensitivity: string | null;
        contentId: string;
        policyVersion: string;
        redacted: number;
        synthesis: boolean;
        detectors: Array<{ detector: string; matched: boolean }>;
      }>;
      total: number;
    }>(`/compliance/events?days=${days}&limit=${limit}`),

  // ── Review queue ──────────────────────────────────────────────────────────

  /** List all review queue items for the org (admin only). */
  getReviewQueue: () => request<ReviewQueueItem[]>('/review-queue'),

  /** Count of PENDING items — used for the sidebar badge (admin only). */
  getReviewPendingCount: () => request<{ count: number }>('/review-queue/pending-count'),

  /** Submit APPROVED or DENIED verdict for a review item (admin only). */
  submitReview: (itemId: string, verdict: ReviewVerdict, notes?: string) =>
    request<ReviewQueueItem>(`/review-queue/${itemId}/review`, {
      method: 'POST',
      body: JSON.stringify({ verdict, notes: notes ?? '' }),
    }),

  // ── Drive connections ──────────────────────────────────────────────────

  getDriveConnections: () => request<DriveConnection[]>('/drive/connections'),

  connectDriveItem: (data: {
    driveSource: string; driveItemId: string; driveItemName: string;
    driveItemUrl: string; driveItemType: string;
    hipaaVerified: boolean; hipaaLabelName?: string; hipaaAcknowledged: boolean;
    permissionType: string; allowedRoles?: string[]; allowedUserIds?: string[];
    clientId?: string; inheritClientPermissions?: boolean; notes?: string;
  }) => request<{ id: string }>('/drive/connections', { method: 'POST', body: JSON.stringify(data) }),

  deleteDriveConnection: (id: string) =>
    request<void>(`/drive/connections/${id}`, { method: 'DELETE' }),

  verifyHipaaLabels: (driveSource: string, url: string) =>
    request<DriveVerifyResult>('/drive/verify', {
      method: 'POST',
      body: JSON.stringify({ driveSource, url }),
    }),

  // ── Subject Authorizations ────────────────────────────────────────────────

  /**
   * List all authorization records for a client (any status — includes expired
   * and revoked so admins can see the full history).
   */
  getClientAuthorizations: (clientId: string) =>
    request<SubjectAuthorization[]>(`/clients/${clientId}/authorizations`),

  /**
   * Add an authorization record for a client (admin only).
   * {@code type} and {@code scope} values are domain-defined strings.
   * For HIPAA: type = RESEARCH | PART_2_CONSENT | HIPAA_AUTHORIZATION;
   * scope = PHI | CLINICAL | SUD | PSYCHOTHERAPY | HIV | GENETIC.
   */
  addClientAuthorization: (
    clientId: string,
    data: {
      type: string;
      scope: string[];
      expiry?: string;
      evidenceRef?: string;
    },
  ) =>
    request<SubjectAuthorization>(`/clients/${clientId}/authorizations`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Revoke an authorization record (admin only). Status set to REVOKED; record is preserved. */
  revokeClientAuthorization: (clientId: string, authId: string) =>
    request<void>(`/clients/${clientId}/authorizations/${authId}/revoke`, { method: 'POST' }),

  // ── ACLX Org Policy ───────────────────────────────────────────────────────

  /** Fetch the full org ACLX policy (allow rules, block rules, sensitivity threshold). */
  getOrgAclxPolicy: (orgId: string) =>
    request<OrgAclxPolicy>(`/orgs/${orgId}/aclx-policy`),

  /**
   * Add or replace a policy rule (ALLOW or BLOCK).
   * If a rule with the same slug already exists it is replaced.
   */
  addOrgPolicyRule: (
    orgId: string,
    data: {
      type: OrgPolicyRuleType;
      slug: string;
      description: string;
      sourceReviewItemId?: string;
    },
  ) =>
    request<OrgPolicyRule>(`/orgs/${orgId}/aclx-policy/rules`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Delete a policy rule by ID. */
  deleteOrgPolicyRule: (orgId: string, ruleId: string) =>
    request<void>(`/orgs/${orgId}/aclx-policy/rules/${ruleId}`, { method: 'DELETE' }),

  /** Update the escalation sensitivity threshold. */
  setOrgPolicySensitivity: (orgId: string, sensitivity: string) =>
    request<void>(`/orgs/${orgId}/aclx-policy/sensitivity`, {
      method: 'PUT',
      body: JSON.stringify({ sensitivity }),
    }),

  // ── Search ─────────────────────────────────────────────────────────────

  /**
   * AI-powered cross-entity search.
   * Results are permission-filtered server-side before the AI summary is built.
   */
  search: (query: string) =>
    request<SearchResponse>('/search', {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),

  // ── Trusted devices ("remember this device") ─────────────────────────────
  // The token is set/sent as an httpOnly __session cookie by the server; the
  // browser handles it transparently on same-origin /api calls.
  trustedDevices: {
    /** Trust the current device. Call ONLY right after a full MFA challenge completed. */
    register: () =>
      request<{ trusted: boolean; reason?: string; deviceId?: string; expiresAt?: number }>(
        '/auth/trusted-devices',
        { method: 'POST' },
      ),
    /** List this user's active trusted devices (the calling one is flagged `current`). */
    list: () =>
      request<Array<{
        deviceId: string; label: string; createdAtEpochMs: number;
        lastSeenAtEpochMs: number; expiresAtEpochMs: number; current: boolean;
      }>>('/auth/trusted-devices'),
    /** Revoke a single trusted device. */
    revoke: (deviceId: string) =>
      request<void>(`/auth/trusted-devices/${deviceId}`, { method: 'DELETE' }),
    /** Revoke all trusted devices (e.g. after disabling MFA). */
    revokeAll: () =>
      request<void>('/auth/trusted-devices', { method: 'DELETE' }),
  },
};
