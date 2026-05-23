export type UserRole =
  | 'TREATING_BCBA'
  | 'SUPERVISING_BCBA'
  | 'RBT'
  | 'SCHEDULING_ADMIN'
  | 'BILLING_ADMIN';

export type UserPurpose = 'treatment' | 'assessment' | 'scheduling' | 'payment' | 'oversight';

export type ACLXDecision = 'ALLOW' | 'REDACT' | 'BLOCK' | 'ESCALATE';

export interface AppUser {
  uid: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  purpose: UserPurpose;
  orgId: string;
}

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
  organizationId: string;
  createdAt: string;
}

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

export interface Template {
  id: string;
  title: string;
  category: string;
  source: 'uploaded' | 'system';
  uploadedAt: string;
  lastAiReviewedAt?: string;
}

export interface PolicyDocument {
  id: string;
  title: string;
  category: 'policy_manual' | 'sop' | 'handbook';
  source: 'uploaded' | 'ehr';
  uploadedAt: string;
  lastAiReviewedAt?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  aclxDecision?: ACLXDecision;
}

export interface GeneratedDocument {
  documentId: string;
  content: string;
  decision: ACLXDecision;
  contentId: string;
}
