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
  legalName: string;
  preferredName: string;
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
  | 'hipaa'
  | 'billing';

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

export interface ChatMessage {
  id: string;
  chatId?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;    // frontend-only convenience alias for createdAt
  createdAt?: string;
  aclxDecision?: ACLXDecision;
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

export type ReviewStatus  = 'PENDING' | 'APPROVED' | 'DENIED';
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
  status: ReviewStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewerNotes?: string;
  createdAt: string;
}

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
