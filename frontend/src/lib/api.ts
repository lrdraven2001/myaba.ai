import { auth } from './firebase';
import type {
  Chat,
  ChatMessage,
  Client,
  DriveConnection,
  DriveVerifyResult,
  FederationConfig,
  Org,
  OrgAclxPolicy,
  OrgPlan,
  OrgPolicyRule,
  OrgPolicyRuleType,
  PolicyDocument,
  Project,
  ProjectKnowledgeDoc,
  ReviewQueueItem,
  ReviewVerdict,
  SearchResponse,
  Template,
} from '../types';

const API_BASE = '/api';
const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === 'true';

// ── Auth headers ──────────────────────────────────────────────────────────────

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (DEV_AUTH) {
    return { 'Content-Type': 'application/json' };
  }
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string>) },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  // 204 No Content — return undefined cast as T
  if (res.status === 204) return undefined as T;

  return res.json();
}

// ── API surface ───────────────────────────────────────────────────────────────

export const api = {

  // ── Chats ─────────────────────────────────────────────────────────────────

  /** List all chats accessible to the current user, most-recent-first. */
  getChats: () => request<Chat[]>('/chats'),

  /** Get chat metadata. */
  getChat: (chatId: string) => request<Chat>(`/chats/${chatId}`),

  /** Get message history for a chat (oldest-first). */
  getChatMessages: (chatId: string) => request<ChatMessage[]>(`/chats/${chatId}/messages`),

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

  /** Delete a chat and all its messages. */
  deleteChat: (chatId: string) =>
    request<void>(`/chats/${chatId}`, { method: 'DELETE' }),

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
  ) =>
    request<{ reply: string; decision: string; chatId?: string }>('/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        chatId,
        clientId,
        clientIds: clientIds && clientIds.length > 1 ? clientIds : undefined,
        history: history.map((m) => ({ role: m.role, content: m.content })),
      }),
    }),

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

  updateClientAuthorizations: (
    clientId: string,
    data: {
      treatingBcbaId?: string;
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

  // ── Templates ─────────────────────────────────────────────────────────────

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

  createPolicy: (data: {
    title: string;
    category: string;
    textContent?: string;
    isActive?: boolean;
  }) =>
    request<{ policyId: string }>('/policies', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updatePolicy: (
    policyId: string,
    data: {
      title?: string;
      category?: string;
      textContent?: string;
      isActive?: boolean;
    },
  ) =>
    request<void>(`/policies/${policyId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deletePolicy: (policyId: string) =>
    request<void>(`/policies/${policyId}`, { method: 'DELETE' }),

  // ── Organizations ─────────────────────────────────────────────────────────

  /** Create a new organization (called during onboarding). Returns { orgId }. */
  createOrg: (data: { name: string; plan: OrgPlan; adminDisplayName?: string }) =>
    request<{ orgId: string }>('/orgs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Get org metadata. */
  getOrg: (orgId: string) => request<Org>(`/orgs/${orgId}`),

  /** Update org settings (ORG_ADMIN only). */
  updateOrgSettings: (orgId: string, settings: Record<string, unknown>) =>
    request<void>(`/orgs/${orgId}/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  /** Generate an invite link for a given role. Returns { inviteUrl }. */
  generateInvite: (orgId: string, role: string) =>
    request<{ inviteUrl: string }>(`/orgs/${orgId}/invite`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),

  /** Preview an invite link (doesn't consume it). Returns { orgId, orgName, role }. */
  resolveInvite: (token: string) =>
    request<{ orgId: string; orgName: string; role: string }>(`/invite/${token}`),

  /** Claim an invite token and apply role/org claims to the current user. */
  claimInvite: (token: string) =>
    request<{ message: string }>(`/invite/${token}/claim`, { method: 'POST' }),

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
    request<{ documents: unknown[] }>(`/clients/${clientId}/documents`),

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
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    return res.json();
  },

  // ── AI Generation ─────────────────────────────────────────────────────────

  generateDocument: (clientId: string, documentType: string, additionalContext?: string) =>
    request<{ content: string; documentId: string; decision: string }>('/generate-document', {
      method: 'POST',
      body: JSON.stringify({ clientId, documentType, additionalContext }),
    }),

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
};
