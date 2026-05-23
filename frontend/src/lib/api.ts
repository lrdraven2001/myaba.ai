import { auth } from './firebase';
import type { ChatMessage } from '../types';

const API_BASE = '/api';
const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === 'true';

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

  return res.json();
}

export const api = {
  // Chat — pass full history for multi-turn context
  chat: (message: string, history: ChatMessage[] = [], clientId?: string) =>
    request<{ reply: string; decision: string }>('/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        clientId,
        history: history.map((m) => ({ role: m.role, content: m.content })),
      }),
    }),

  // Clients
  getClients: () => request<{ clients: unknown[] }>('/clients'),
  getClient: (clientId: string) => request<{ client: unknown }>(`/clients/${clientId}`),
  createClient: (data: unknown) =>
    request<{ clientId: string }>('/clients', { method: 'POST', body: JSON.stringify(data) }),
  updateClient: (clientId: string, data: unknown) =>
    request(`/clients/${clientId}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Documents
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

  // AI Generation
  generateDocument: (clientId: string, documentType: string, additionalContext?: string) =>
    request<{ content: string; documentId: string; decision: string }>(
      '/generate-document',
      {
        method: 'POST',
        body: JSON.stringify({ clientId, documentType, additionalContext }),
      }
    ),

  // Policies
  getPolicies: (category: string) =>
    request<{ documents: unknown[] }>(`/policies?category=${category}`),

  // Templates
  getTemplates: () => request<{ templates: unknown[] }>('/templates'),

  // Review queue
  getReviewQueue: () => request<{ items: unknown[] }>('/review-queue'),
  submitReview: (contentId: string, verdict: string, notes?: string) =>
    request('/review-queue/submit', {
      method: 'POST',
      body: JSON.stringify({ contentId, verdict, notes }),
    }),
};
