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

export const FAKE_TEMPLATES: FakeTemplate[] = [];
export const FAKE_CLIENT_FILES: FakeClientFile[] = [];

// Re-export ChatMessage so existing imports keep compiling
export type { ChatMessage };
