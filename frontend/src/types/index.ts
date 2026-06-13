// ── Roles & purposes ──────────────────────────────────────────────────────────

export type UserRole =
  | 'TREATING_BCBA'
  | 'SUPERVISING_BCBA'
  | 'BCBA_STUDENT'
  | 'RBT'
  | 'SCHEDULING_ADMIN'
  | 'BILLING_ADMIN'
  | 'ORG_ADMIN'
  | 'ORG_SUPER_ADMIN';

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
}

export function isClinicalRole(role: UserRole): boolean {
  return ['TREATING_BCBA', 'SUPERVISING_BCBA', 'BCBA_STUDENT', 'RBT'].includes(role);
}

export function isBcbaRole(role: UserRole): boolean {
  return ['TREATING_BCBA', 'SUPERVISING_BCBA', 'BCBA_STUDENT'].includes(role);
}

export function isAdminRole(role: UserRole): boolean {
  return ['ORG_ADMIN', 'ORG_SUPER_ADMIN'].includes(role);
}

export function canInitiateChat(role: UserRole): boolean {
  return isClinicalRole(role);
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
  settings?: {
    sessionTimeoutMinutes: number;
    mfaRequired: boolean;
    /** When false, ACLX escalations are logged but do not block content delivery. Defaults true. */
    reviewRequired?: boolean;
    aclxEnabled?: boolean;
    hipaaMode?: boolean;
    aiAudit?: boolean;
  };
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
  /** Custom system prompt injected into every Claude call made within this project. */
  instructions?: string;
  orgId: string;
  ownerId: string;
  clientIds: string[];
  isShared: boolean;
  members: Record<string, ProjectMemberRole>; // { userId: 'editor' | 'viewer' }
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
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
    value: 'RESEARCH',
    label: 'Research Authorization',
    description: '45 CFR 164.508 — written authorization for research use of identified PHI',
  },
  {
    value: 'PART_2_CONSENT',
    label: '42 CFR Part 2 Consent',
    description: 'Written patient consent for SUD records — required even for treating providers (42 CFR Part 2 §2.31)',
  },
  {
    value: 'PART_2_COURT_ORDER',
    label: '42 CFR Part 2 Court Order',
    description: 'Court order authorizing disclosure of SUD records without patient consent (42 CFR Part 2 §2.61)',
  },
  {
    value: 'PSYCHOTHERAPY_AUTHORIZATION',
    label: 'Psychotherapy Notes Authorization',
    description: 'Written authorization required for disclosure of psychotherapy notes (45 CFR 164.508(a)(2))',
  },
  {
    value: 'HIV_STATE_CONSENT',
    label: 'HIV Status Consent',
    description: 'State-law consent form for HIV status disclosure — requirements vary by state',
  },
  {
    value: 'HIPAA_AUTHORIZATION',
    label: 'HIPAA Authorization',
    description: 'General written authorization for uses/disclosures outside TPO (45 CFR 164.508)',
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
