import { auth } from './firebase';

const API_BASE = '/api';
const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === 'true';

async function getHeaders(): Promise<Record<string, string>> {
  if (DEV_AUTH) return { 'Content-Type': 'application/json' };
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const token = await user.getIdToken();
  // Custom header (not Authorization): the Firebase Hosting → Cloud Run edge
  // strips/consumes a Bearer token in the Authorization header, so the token
  // must ride in a header the edge leaves untouched (same as the main app).
  return { 'Content-Type': 'application/json', 'X-Firebase-Token': token };
}

/** API error that preserves the HTTP status — used to detect 403 (not a platform admin). */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await getHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string>) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(err.error || `HTTP ${res.status}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Tenant types ──────────────────────────────────────────────────────────────

/** Payment/subscription status from Stripe (null = no subscription on file). */
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | null;

export interface Tenant {
  id: string;
  name: string;
  plan: 'solo' | 'team' | 'enterprise' | 'free';
  status: 'active' | 'trial' | 'suspended';
  createdAt: string;
  memberCount: number;
  adminEmail: string;
  baaAccepted?: boolean;
  // Current-month usage
  aiCalls?: number;
  documentCount?: number;
  chatCount?: number;
  // Lifetime usage + most recent active month ("YYYY-MM" or "")
  lifetimeAiCalls?: number;
  lifetimeDocuments?: number;
  lifetimeChats?: number;
  lastActive?: string;
  // Billing
  subscriptionStatus?: SubscriptionStatus;
  paying?: boolean;
  seats?: number;
  fullSeats?: number;
  liteSeats?: number;
  currentPeriodEnd?: number | null;  // Stripe epoch seconds
  mrrCents?: number;                 // -1 = custom (enterprise)
  mrrIsEstimate?: boolean;           // true = seat estimate; false = actual Stripe amount
}

export interface UsageSummary {
  month: string;
  isCurrentMonth?: boolean;
  totalAiCalls: number;
  totalDocuments: number;
  totalChats: number;
  lifetimeAiCalls: number;
  lifetimeDocuments: number;
  lifetimeChats: number;
  totalMrrCents: number;
  payingOrgCount: number;
  orgCount: number;
  rows: UsageRow[];
}

export interface UsageRow {
  orgId: string;
  orgName: string;
  plan: string;
  status: string;
  aiCalls: number;
  documentCount: number;
  chatCount: number;
  memberCount: number;
  lifetimeAiCalls?: number;
  lifetimeDocuments?: number;
  lifetimeChats?: number;
  lastActive?: string;
  subscriptionStatus?: SubscriptionStatus;
  paying?: boolean;
  mrrCents?: number;
  mrrIsEstimate?: boolean;
}

/** Per-org drill-in detail (GET /platform/tenants/{id}). */
export interface TenantDetail extends Tenant {
  usageHistory?: { period: string; aiCalls: number; documentCount: number; chatCount: number }[];
  members?: { uid: string; email: string; displayName: string; role: string; aiTier: string }[];
  billing?: {
    stripeConfigured: boolean;
    hasSubscription: boolean;
    subscriptionStatus?: SubscriptionStatus;
    plan?: string;
    currentPeriodEnd?: number | null;
    invoices?: {
      id: string; number?: string; status?: string; amountDue?: number; amountPaid?: number;
      currency?: string; created?: number; hostedInvoiceUrl?: string; pdf?: string;
    }[];
  };
}

/** Platform config document — all fields optional (empty until first save). */
export interface PlatformConfig {
  geminiModelFast?: string;
  geminiModelReasoning?: string;
  aclxEnabled?: boolean;
  aclxGatewayUrl?: string;
  dlpEnabled?: boolean;
  dlpGcpProjectId?: string;
  dlpLocation?: string;
  dlpLikelihood?: string;
  dlpInfoTypes?: string[];
}

export interface HealthReport {
  api:      ServiceHealth;
  aclx:     ServiceHealth;
  dlp:      ServiceHealth;
  firebase: ServiceHealth;
  checkedAt: string;
}

export interface ServiceHealth {
  name: string;
  up: boolean;
  message: string;
  latencyMs: number;
}

/** One Pathfinder allowlist entry (doc id = the email). */
export interface ApprovedCreator {
  email: string;
  approvedBy?: string;
  approvedAt?: string;
  note?: string;
  used?: boolean;
  usedByUid?: string;
  usedAt?: string;
  orgId?: string;
}

// ── API surface ───────────────────────────────────────────────────────────────

export const api = {

  // ── Tenants ─────────────────────────────────────────────────────────────

  getTenants: () => request<Tenant[]>('/platform/tenants'),

  getTenant: (orgId: string) => request<TenantDetail>(`/platform/tenants/${orgId}`),

  setTenantStatus: (orgId: string, status: 'active' | 'suspended') =>
    request<{ orgId: string; status: string }>(`/platform/tenants/${orgId}/status`, {
      method: 'PUT',
      body:   JSON.stringify({ status }),
    }),

  // ── Pathfinder approved creators ─────────────────────────────────────────

  getApprovedCreators: () =>
    request<{ creators: ApprovedCreator[] }>('/platform/approved-creators'),

  /** Add or re-approve an email (re-adding a used entry resets it). */
  addApprovedCreator: (email: string, note?: string) =>
    request<{ success: boolean }>('/platform/approved-creators', {
      method: 'POST',
      body:   JSON.stringify({ email, note }),
    }),

  revokeApprovedCreator: (email: string) =>
    request<{ success: boolean }>(`/platform/approved-creators/${encodeURIComponent(email)}`, {
      method: 'DELETE',
    }),

  // ── Platform config ──────────────────────────────────────────────────────

  getPlatformConfig: () => request<PlatformConfig>('/platform/config'),

  updatePlatformConfig: (updates: Partial<PlatformConfig>) =>
    request<{ updated: string[] }>('/platform/config', {
      method: 'PUT',
      body:   JSON.stringify(updates),
    }),

  // ── Usage ────────────────────────────────────────────────────────────────

  getUsage: (month?: string) =>
    request<UsageSummary>(`/platform/usage${month ? `?month=${encodeURIComponent(month)}` : ''}`),

  // ── Health ───────────────────────────────────────────────────────────────

  getHealth: () => request<HealthReport>('/platform/health'),

  // ── Passthrough: quick connectivity test ─────────────────────────────────
  ping: () => request<{ status: string }>('/health'),
};
