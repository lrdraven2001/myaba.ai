// ── Roles & purposes ──────────────────────────────────────────────────────────

// The five canonical roles. Internal constant strings are kept stable so existing
// member records / claims keep working; the user-facing names are in ROLE_LABELS.
//   ORG_SUPER_ADMIN  → Practice Administrator (super admin, org creator, signs BAA)
//   CLINICAL_DIRECTOR→ Clinical Director (clinical + full central library + delete)
//   SUPERVISING_BCBA → Clinical Supervisor (clinical; library-add is toggle-able)
//   RBT              → Behavior Technician (projects + chat; no clients/library)
//   GENERAL_STAFF    → General Staff (restricted / non-HIPAA guest)
export type UserRole =
  | 'ORG_SUPER_ADMIN'
  | 'CLINICAL_DIRECTOR'
  | 'SUPERVISING_BCBA'
  | 'RBT'
  | 'GENERAL_STAFF';

/** Canonical display names for the five roles. Single source of truth — UI should use this. */
export const ROLE_LABELS: Record<UserRole, string> = {
  ORG_SUPER_ADMIN:   'Practice Administrator',
  CLINICAL_DIRECTOR: 'Clinical Director',
  SUPERVISING_BCBA:  'Clinical Supervisor',
  RBT:               'Behavior Technician',
  GENERAL_STAFF:     'General Staff',
};

/**
 * Display labels for ANY role string that may appear in member/claims data,
 * including legacy / extended roles beyond the 5 canonical {@link UserRole} values.
 * Use this (not a locally-redeclared map) when rendering a badge from an arbitrary
 * role string. Falls through to the raw string for unknown roles at the call site.
 */
export const ALL_ROLE_LABELS: Record<string, string> = {
  ...ROLE_LABELS,
  ORG_ADMIN:        'Practice Administrator',
  TREATING_BCBA:    'Treating BCBA',
  BCBA_STUDENT:     'BCBA Student',
  SCHEDULING_ADMIN: 'Scheduling Admin',
  BILLING_ADMIN:    'Billing Admin',
};

/** The four core roles that can be renamed but never deleted. (Clinical Director is optional/addable.) */
export const CORE_ROLES: UserRole[] = ['ORG_SUPER_ADMIN', 'SUPERVISING_BCBA', 'RBT', 'GENERAL_STAFF'];

/** Roles available to assign when inviting a member (Practice Administrator is the creator only). */
export const ASSIGNABLE_ROLES: UserRole[] = ['CLINICAL_DIRECTOR', 'SUPERVISING_BCBA', 'RBT', 'GENERAL_STAFF'];

export type UserPurpose = 'treatment' | 'assessment' | 'scheduling' | 'payment' | 'oversight';

export type ACLXDecision = 'ALLOW' | 'REDACT' | 'BLOCK' | 'ESCALATE';

// ── User ──────────────────────────────────────────────────────────────────────

export interface AppUser {
  uid: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  purpose: UserPurpose;
  orgId: string;
  supervisorId?: string; // populated for RBT / BCBA_STUDENT via Firebase custom claims
  /**
   * Explicit PHI-access capability from Firebase custom claims.
   * Set when a user is assigned a role — true for clinical staff, false for non-clinical.
   * This is the authoritative gate for custom org-defined roles; the role string alone
   * cannot be trusted for PHI decisions when agencies define their own role names.
   * Falls back to role-name inference when the claim is absent (legacy tokens).
   */
  phiAccess?: boolean;
}

/** Roles with clinical / PHI access (can be involved in client work). */
export function isClinicalRole(role: UserRole): boolean {
  return ['CLINICAL_DIRECTOR', 'SUPERVISING_BCBA', 'RBT', 'ORG_SUPER_ADMIN'].includes(role);
}

/** Org administration (members, invites, settings, role config) — Practice Administrator. */
export function isAdminRole(role: UserRole): boolean {
  return ['ORG_SUPER_ADMIN', 'CLINICAL_DIRECTOR'].includes(role);
}

/** Roles that can create/manage clients (not Behavior Technician). */
export function canManageClients(role: UserRole): boolean {
  return ['ORG_SUPER_ADMIN', 'CLINICAL_DIRECTOR', 'SUPERVISING_BCBA'].includes(role);
}

/**
 * Roles that can act as a clinical supervisor on a case (oversee RBTs, sign off).
 * The Practice Administrator is a BCBA / primary supervisor in this model, so they
 * are eligible alongside Clinical Directors and Supervising BCBAs.
 */
export function canSupervise(role: UserRole | string): boolean {
  return ['ORG_SUPER_ADMIN', 'CLINICAL_DIRECTOR', 'SUPERVISING_BCBA'].includes(role);
}

/**
 * True when the user is allowed to view/process PHI.
 * Checks the explicit `phiAccess` claim first (works for custom org roles),
 * then falls back to the predefined role list for legacy tokens.
 */
export function hasPhiAccess(user: AppUser): boolean {
  if (user.phiAccess !== undefined) return user.phiAccess;
  // Legacy fallback: infer from known role names
  return isClinicalRole(user.role) || isAdminRole(user.role);
}

export function canInitiateChat(role: UserRole): boolean {
  return isClinicalRole(role);
}

export function canUseGeneralChat(role: UserRole): boolean {
  return role === 'GENERAL_STAFF';
}

// ── Clients ───────────────────────────────────────────────────────────────────

export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  /** Optional preferred / goes-by name (de-identified display in chats). */
  preferredName?: string;
  /** Computed full name — firstName + ' ' + lastName. Returned by API for search/legacy compat. */
  legalName?: string;
  dateOfBirth: string;
  gender: string;
  diagnosis: string;
  primaryInsurance: string;
  ehrProvider?: string;
  ehrCaseId?: string;
  orgId: string;
  treatingBcbaId?: string;
  supervisorIds?: string[];
  supervisingBcbaId?: string;
  rbtIds?: string[];
  viewerIds?: string[];
  memberIds?: string[];
  createdAt: string;
  updatedAt?: string;
}

// ── Documents ─────────────────────────────────────────────────────────────────

export interface Document {
  id: string;
  title: string;
  clientId: string;
  category: 'intake' | 'assessment' | 'session_notes' | 'bip' | 'fba' | 'progress_note' | 'other';
  source: 'uploaded' | 'ehr' | 'ai_generated';
  uploadedAt: string;
  lastAiReviewedAt?: string;
  aclxDecision?: ACLXDecision;
  content?: string;
}

// ── Templates ─────────────────────────────────────────────────────────────────

export type TemplateCategory =
  | 'bip'
  | 'fba'
  | 'progress_note'
  | 'schedule'
  | 'skill_acquisition'
  | 'parent_training'
  | 'other';

export interface Template {
  id: string;
  title: string;
  category: TemplateCategory;
  content: string;
  visibleToRoles: UserRole[]; // empty = all roles
  orgId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── Policies ──────────────────────────────────────────────────────────────────

export type PolicyCategory =
  | 'policy_manual'
  | 'sop'
  | 'handbook'
  | 'clinical_sop'
  | 'template';

export interface PolicyDocument {
  id: string;
  title: string;
  category: PolicyCategory;
  textContent: string;
  isActive: boolean;
  orgId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── Organization ──────────────────────────────────────────────────────────────

export type OrgPlan = 'solo' | 'team' | 'enterprise';

export interface Org {
  id: string;
  name: string;
  plan: OrgPlan;
  adminUid: string;
  createdAt: string;
  updatedAt?: string;
  /**
   * True once a Clinical Director has signed the BAA.
   * PHI features (clinical chat, client records) are locked until this is true.
   * Absent on orgs created before this field was introduced — treated as true (legacy).
   */
  baaAccepted?: boolean;
  /** "clinical_director" (BAA signed at setup) or "it_setup" (BAA deferred). */
  setupMode?: 'clinical_director' | 'it_setup';
  settings?: OrgSettings;
}

/** Per-org settings stored under the org document's `settings` map. */
export interface OrgSettings {
  sessionTimeoutMinutes: number;
  mfaRequired: boolean;
  /** When false, ACLX escalations are logged but do not block content delivery. Defaults true. */
  reviewRequired?: boolean;
  aclxEnabled?: boolean;
  hipaaMode?: boolean;
  aiAudit?: boolean;
  /** When true, ORG_ADMIN users can use AI chat and generate documents. */
  adminClinicalAccess?: boolean;
  /** When true, all members must enroll a second factor (TOTP) before accessing the app. */
  mfaEnforced?: boolean;
  /** When true, AI output always uses a client's preferred/display name, never their legal name. */
  preferClientDisplayName?: boolean;
}

/** Acceptance status for a signed agreement (BAA, Service Contract). */
export interface AgreementStatus {
  accepted: boolean;
  acceptedAt?: string;
  acceptedBy?: string;
  signerName?: string;
  signerTitle?: string;
  version?: string;
}

// ── Federation (enterprise SSO) ───────────────────────────────────────────────

export type FederationType = 'oidc' | 'saml';

export interface FederationConfig {
  id: string;
  orgId: string;
  type: FederationType;
  displayName: string;
  isEnabled: boolean;
  firebaseProviderId: string;
  // OIDC fields
  clientId?: string;
  issuerUrl?: string;
  // SAML fields
  idpEntityId?: string;
  ssoUrl?: string;
  rpEntityId?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Chats ─────────────────────────────────────────────────────────────────────

export interface Chat {
  id: string;
  title: string;
  orgId: string;
  createdBy: string;
  clientId: string;        // empty string when project/general chat
  projectId: string;       // empty string when client/general chat
  projectLabel: string;    // display label for project-type chats
  policyIds?: string[];    // policy docs attached to this chat (used for system prompt)
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AclxMessageLabel {
  domain?: string;
  category?: string;
  subcategory?: string;
  sensitivity?: 'HIGH' | 'MEDIUM' | 'LOW' | string;
}

export interface ChatMessage {
  id: string;
  chatId?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;    // frontend-only convenience alias for createdAt
  createdAt?: string;
  aclxDecision?: ACLXDecision;
  /** ACLX governance label stored on every AI response. Present on assistant messages only. */
  aclxLabel?: AclxMessageLabel;
  /** ACLX content_id for this response — links to the review queue / audit log entry. */
  aclxContentId?: string;
}

// ── Projects ──────────────────────────────────────────────────────────────────

export type ProjectMemberRole = 'editor' | 'viewer';

export interface Project {
  id: string;
  title: string;
  description: string;
  /** Custom system prompt injected into every model call made within this project. */
  instructions?: string;
  orgId: string;
  ownerId: string;
  clientIds: string[];
  isShared: boolean;
  /** When true, project contains PHI — only clinical/admin roles may be added as members. */
  containsPhi: boolean;
  members: Record<string, ProjectMemberRole>; // { userId: 'editor' | 'viewer' }
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
  /** Set when soft-deleted; restorable by a super admin for 48h. */
  deletedAt?: string;
  deletedBy?: string;
}

export interface ProjectKnowledgeDoc {
  id: string;
  title: string;
  textContent: string;
  createdAt: string;
  createdBy: string;
}

// ── AI Generation ─────────────────────────────────────────────────────────────

export interface GeneratedDocument {
  documentId: string;
  content: string;
  decision: ACLXDecision;
  contentId: string;
}

// ── Drive connections ─────────────────────────────────────────────────────────

export type DriveSource = 'google' | 'microsoft';
export type DriveItemType = 'file' | 'folder';
export type DrivePermissionType = 'org_roles' | 'individual' | 'client_inherited';

export interface DriveConnection {
  id: string;
  orgId: string;
  driveSource: DriveSource;
  driveItemId: string;
  driveItemName: string;
  driveItemUrl: string;
  driveItemType: DriveItemType;
  hipaaVerified: boolean;
  hipaaLabelName?: string;
  hipaaAcknowledged: boolean;
  permissionType: DrivePermissionType;
  allowedRoles: UserRole[];
  allowedUserIds: string[];
  clientId?: string;
  inheritClientPermissions: boolean;
  linkedBy: string;
  linkedAt: string;
  notes?: string;
}

export interface DriveVerifyResult {
  verified: boolean;
  itemId: string;
  labelName: string;
  message: string;
}

// ── Review queue ─────────────────────────────────────────────────────────────

/** PENDING = blocking (admin must approve before content was seen by user)
 *  LOGGED  = non-blocking audit entry (content was already delivered; recorded for oversight)
 *  APPROVED / DENIED = reviewed decision on a formerly-PENDING item
 */
export type ReviewStatus  = 'PENDING' | 'APPROVED' | 'DENIED' | 'LOGGED';
export type ReviewVerdict = 'APPROVED' | 'DENIED';

export type ReviewEventType =
  | 'CHAT_RESPONSE'
  | 'DOCUMENT_GENERATED'
  | 'SEARCH_SUMMARY';

export interface ReviewQueueItem {
  id: string;
  orgId: string;
  contentId: string;
  eventType: ReviewEventType;
  requestingUserId: string;
  clientId?: string;
  /** The raw AI output that was escalated — visible to reviewers only. */
  rawContent: string;
  aclxReason?: string;
  aclxSensitivity?: string;
  aclxCategory?: string;
  /**
   * Why the ACLX authorization check failed, when one was performed.
   * Values: NOT_PROVIDED | REVOKED | EXPIRED
   * Populated from aclx.audit.authorization_audit.deny_reason in the ACLX response.
   * Surface to reviewers so they can take corrective action (e.g. add an authorization).
   */
  authDenyReason?: string;
  status: ReviewStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewerNotes?: string;
  createdAt: string;
}

// ── Subject Authorizations ────────────────────────────────────────────────────

/**
 * Domain-defined authorization type strings.
 * HIPAA:  RESEARCH | PART_2_CONSENT | HIPAA_AUTHORIZATION
 * FERPA:  PARENTAL_CONSENT | STUDENT_CONSENT | LEGITIMATE_INTEREST
 * GDPR:   EXPLICIT_CONSENT | LEGITIMATE_INTEREST | CONTRACT
 * CUI:    CLEARANCE_GRANT | NEED_TO_KNOW | EXPORT_LICENSE
 * This is typed as string so new domain types don't require a frontend release.
 */
export type AuthorizationType = string;

/**
 * Domain-defined data category scope strings.
 * HIPAA: PHI | CLINICAL | SUD | PSYCHOTHERAPY | HIV | GENETIC
 * FERPA: EDUCATION_RECORDS | DIRECTORY_INFO | FINANCIAL
 * GDPR:  PERSONAL_DATA | SPECIAL_CATEGORY | BIOMETRIC
 * CUI:   CUI_BASIC | CUI_SPECIFIED | EXPORT_CONTROLLED
 */
export type AuthScope = string;

export type AuthorizationStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export interface SubjectAuthorization {
  authId: string;
  /** Domain-defined authorization type. */
  type: AuthorizationType;
  /** Data categories this authorization covers. */
  scope: AuthScope[];
  status: AuthorizationStatus;
  /** ISO-8601 expiry date, or empty string / null if no expiry. */
  expiry: string | null;
  issuedAt: string;
  /** Reference to the source consent/waiver document, if any. */
  evidenceRef?: string;
  addedBy: string;
  orgId: string;
  clientId: string;
  revokedAt?: string;
  revokedBy?: string;
}

/** Well-known HIPAA authorization types (for UI dropdowns). */
export const HIPAA_AUTH_TYPES: { value: string; label: string; description: string }[] = [
  {
    value: 'ABA_TREATMENT_AUTHORIZATION',
    label: 'ABA Treatment Authorization',
    description: 'Standard consent for use of this client\'s information to support ABA treatment, care coordination, and AI-assisted documentation. Appropriate for most ABA clients.',
  },
  {
    value: 'RESEARCH',
    label: 'Research Authorization',
    description: 'Written authorization for use of identified client data in a research study (45 CFR 164.508)',
  },
  {
    value: 'PART_2_CONSENT',
    label: '42 CFR Part 2 Consent (SUD)',
    description: 'Written patient consent required for substance use disorder records — required even for treating providers (42 CFR Part 2 §2.31)',
  },
  {
    value: 'PART_2_COURT_ORDER',
    label: '42 CFR Part 2 Court Order (SUD)',
    description: 'Court order authorizing disclosure of SUD records without patient consent (42 CFR Part 2 §2.61)',
  },
  {
    value: 'PSYCHOTHERAPY_AUTHORIZATION',
    label: 'Psychotherapy Notes Authorization',
    description: 'Written authorization required to use or disclose psychotherapy session notes (45 CFR 164.508(a)(2))',
  },
  {
    value: 'HIV_STATE_CONSENT',
    label: 'HIV Status Consent',
    description: 'State-law consent form for HIV status disclosure — requirements vary by state',
  },
  {
    value: 'HIPAA_AUTHORIZATION',
    label: 'HIPAA Authorization (Other)',
    description: 'General written authorization for uses or disclosures not covered by standard treatment, payment, or operations (45 CFR 164.508)',
  },
];

/** Well-known HIPAA scope values (for UI checkboxes). */
export const HIPAA_SCOPES: { value: string; label: string; isSuperPhi: boolean }[] = [
  { value: 'PHI',          label: 'PHI (general)',          isSuperPhi: false },
  { value: 'CLINICAL',     label: 'Clinical records',       isSuperPhi: false },
  { value: 'SUD',          label: 'Substance Use Disorder', isSuperPhi: true  },
  { value: 'PSYCHOTHERAPY',label: 'Psychotherapy notes',    isSuperPhi: true  },
  { value: 'HIV',          label: 'HIV status',             isSuperPhi: true  },
  { value: 'GENETIC',      label: 'Genetic information',    isSuperPhi: true  },
];

// ── ACLX Org Policy ──────────────────────────────────────────────────────────

export type OrgPolicyRuleType = 'ALLOW' | 'BLOCK';

export interface OrgPolicyRule {
  id: string;
  type: OrgPolicyRuleType;
  /** Machine-readable pattern label (no spaces). */
  slug: string;
  description: string;
  addedBy: string;
  addedAt: string;
  /** Review queue item this rule was promoted from, if any. */
  sourceReviewItemId?: string;
}

export interface OrgAclxPolicy {
  allowRules: OrgPolicyRule[];
  blockRules: OrgPolicyRule[];
  /**
   * Minimum sensitivity level that triggers ESCALATE.
   * "HIGH" means MEDIUM content is auto-allowed rather than escalated.
   * null = ACLX default (escalate at MEDIUM+).
   */
  escalateAtSensitivity: string | null;
  updatedAt?: string;
  updatedBy?: string;
}

// ── EHR Integration ───────────────────────────────────────────────────────────

export type EhrType = 'centralreach' | 'rethink';

export interface EhrConnectionStatus {
  ehrType: EhrType;
  displayName: string;
  connected: boolean;
  /** "connected" | "disconnected" | "error" | "pending" */
  status: string;
  errorMessage?: string;
  connectedAt?: string;
  lastSyncAt?: string;
  /** CentralReach only */
  subdomain?: string;
}

export interface EhrClientRecord {
  ehrId: string;
  ehrType: EhrType;
  firstName: string;
  lastName: string;
  preferredName?: string;
  dateOfBirth?: string;
  gender?: string;
  diagnosisCodes?: string[];
  diagnosisDescriptions?: string[];
  primaryInsurance?: string;
  memberId?: string;
  syncedAt: string;
}

// ── Usage ─────────────────────────────────────────────────────────────────────

/** Current-period AI request usage summary returned by GET /api/usage. */
export interface UsageSummary {
  /** Billing period, e.g. "2026-06". */
  period: string;
  /** Org plan: "solo" | "team" | "enterprise" | "dev". */
  plan: string;
  /** Plan-level monthly limit (-1 = unlimited). */
  limit: number;
  /** Effective limit actually enforced — may differ from `limit` when a custom cap is set. */
  effectiveLimit: number;
  /** True when there is no effective ceiling on this period's usage. */
  unlimited: boolean;
  /** Total AI requests this period. */
  requestCount: number;
  /** Requests made via /api/chat. */
  chatCount: number;
  /** Requests made via /api/generate-document. */
  documentCount: number;
  /** ISO-8601 timestamp of the last recorded request, if any. */
  lastUpdated?: string;
  /** Requests remaining before the limit (-1 if unlimited). */
  remaining: number;
  /**
   * Custom spending cap set by an enterprise admin, if any.
   * Only present when a cap has been set.
   */
  customLimit?: number;
  /**
   * Whether this org can set a custom spending cap.
   * True for enterprise plans only.
   */
  canSetCustomLimit: boolean;
}

// ── OfficePuzzle Import ───────────────────────────────────────────────────────

/** Result returned by POST /api/import/officepuzzle. */
export interface OfficePuzzleImportResult {
  /** Number of clients successfully created. */
  imported: number;
  /** Blank or unprocessable rows that were skipped. */
  skipped: number;
  /** Number of rows that failed due to errors. */
  errorCount: number;
  /** Human-readable error message per failed row. */
  errors: string[];
  /** Display names of every successfully created client. */
  importedNames: string[];
  /** Summary sentence, e.g. "12 clients imported, 1 error." */
  message: string;
}

// ── Search ────────────────────────────────────────────────────────────────────

export type SearchHitType = 'client' | 'project' | 'resource' | 'template' | 'chat';

export interface SearchHit {
  type: SearchHitType;
  id: string;
  title: string;
  snippet: string;
}

export interface SearchResponse {
  query: string;
  /** AI-generated summary text (may be empty when ACLX decision is BLOCK or ESCALATE). */
  summary: string;
  /** ACLX governance decision applied to the AI summary. */
  summaryDecision: ACLXDecision | null;
  hits: SearchHit[];
  totalCount: number;
}

// ── Role configuration (Settings → Roles & Permissions) ─────────────────────────

/** Access level for a permission category on a role. */
export type PermissionLevel = 'all' | 'custom' | 'none';

/** Permission categories shown in the role matrix. */
export type PermissionCategory =
  | 'clients' | 'projects' | 'documents' | 'resources'
  | 'team' | 'ai_features' | 'administration';

export interface CustomRole {
  key: string;
  label: string;
  description?: string;
  /** Canonical role key this custom role is based on. */
  baseline?: string;
  permissions: Partial<Record<PermissionCategory, PermissionLevel>>;
}

/** Identity-provider group → myABA role mapping. */
export interface IdpRoleMapping {
  group: string;
  role: string;
}

/** Per-org role configuration persisted via /api/orgs/{orgId}/role-config. */
export interface RoleConfig {
  /** Permission-matrix overrides per canonical role key. */
  roles: Record<string, Partial<Record<PermissionCategory, PermissionLevel>>>;
  customRoles: CustomRole[];
  idpRoleMappings: IdpRoleMapping[];
  updatedAt?: string;
  updatedBy?: string;
}
