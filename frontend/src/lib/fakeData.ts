import type { ChatMessage } from '../types';

// ── Structural types used by FileAttachModal ──────────────────────────────────

export interface AttachedFile {
  id: string;
  name: string;
  source: 'template' | 'client_file' | 'upload';
  clientId?: string; // set when source = 'client_file'
}

export interface FakeTemplate {
  id: string;
  title: string;
  category: string;
}

export interface FakeClientFile {
  id: string;
  clientId: string;
  title: string;
  category: string;
  uploadedAt: string;
}

// ── Fallback templates (used by FileAttachModal when API is unreachable) ──────

export const FAKE_TEMPLATES: FakeTemplate[] = [
  { id: 't-001', title: 'BIP — Standard Format',             category: 'bip'             },
  { id: 't-002', title: 'FBA — Indirect + Direct Methods',   category: 'fba'             },
  { id: 't-003', title: 'Progress Note — Session Summary',   category: 'progress_note'   },
  { id: 't-004', title: 'Skill Acquisition Program',         category: 'skill_acquisition'},
  { id: 't-005', title: 'Parent Training Outline',           category: 'parent_training' },
];

export const FAKE_CLIENT_FILES: FakeClientFile[] = [];

// Re-export ChatMessage so existing imports keep compiling
export type { ChatMessage };
