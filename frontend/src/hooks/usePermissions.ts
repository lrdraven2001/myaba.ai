import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { isAdminRole, hasPhiAccess, canUseGeneralChat } from '../types';
import type { AppUser } from '../types';

/** Capability names — must match ai.myaba.security.Capability on the backend. */
export type Capability =
  | 'CLIENT_MANAGE' | 'CLIENT_VIEW_ALL'
  | 'PROJECT_CREATE' | 'PROJECT_MANAGE' | 'PROJECT_VIEW_ALL' | 'PROJECT_RESTORE'
  | 'DOCUMENT_GENERATE' | 'DOCUMENT_APPROVE'
  | 'RESOURCE_VIEW' | 'RESOURCE_LIBRARY_ADD' | 'ORG_CONTENT_WRITE'
  | 'TEAM_MANAGE'
  | 'AI_CLINICAL_CHAT' | 'AI_GENERAL_CHAT'
  | 'ADMIN_MANAGE' | 'ADMIN_SUPER';

interface Perms {
  capabilities: string[];
  phiAccess: boolean;
  levels: Record<string, string>;
}

// Module-level cache: resolve once per signed-in user, shared across all components.
let cacheUid: string | null = null;
let cache: Perms | null = null;
let inflight: Promise<Perms> | null = null;

/**
 * The current user's resolved permissions, gating the UI on the same capabilities the
 * backend enforces (matrix + custom roles). Until the fetch resolves — or if it fails —
 * `can()` falls back to the legacy built-in-role behavior, so built-in roles gate exactly
 * as before (no flicker, no regression) and custom roles / matrix overrides refine on load.
 * The backend remains the authority; this only shows/hides controls.
 */
export function usePermissions() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid ?? null;
  const [perms, setPerms] = useState<Perms | null>(cacheUid === uid ? cache : null);

  useEffect(() => {
    if (!currentUser?.orgId || !uid) return;
    if (cacheUid === uid && cache) { setPerms(cache); return; }
    // New user (or first load): reset the cache and fetch once.
    if (cacheUid !== uid) { cacheUid = uid; cache = null; inflight = null; }
    inflight = inflight ?? api.getMyPermissions();
    inflight
      .then((p) => { cache = p; cacheUid = uid; setPerms(p); })
      .catch(() => {})
      .finally(() => { inflight = null; });
  }, [uid, currentUser?.orgId]);

  const user = currentUser ?? undefined;
  const role = currentUser?.role ?? '';

  const can = (cap: Capability): boolean =>
    perms ? perms.capabilities.includes(cap) : fallbackCan(cap, role, user);

  const phiAccess = perms ? perms.phiAccess : (user ? hasPhiAccess(user) : false);

  return { can, phiAccess, ready: !!perms };
}

/** Legacy built-in-role equivalents — used until the server response arrives (or on error). */
function fallbackCan(cap: Capability, role: string, user: AppUser | undefined): boolean {
  switch (cap) {
    case 'ADMIN_SUPER':
    case 'PROJECT_RESTORE':
      return role === 'ORG_SUPER_ADMIN';
    case 'ADMIN_MANAGE':
    case 'TEAM_MANAGE':
    case 'CLIENT_VIEW_ALL':
    case 'PROJECT_VIEW_ALL':
    case 'ORG_CONTENT_WRITE':
      return isAdminRole(role);
    case 'AI_GENERAL_CHAT':
      return canUseGeneralChat(role);
    case 'AI_CLINICAL_CHAT':
    case 'DOCUMENT_GENERATE':
      return user ? hasPhiAccess(user) : false;
    default:
      // Category-specific capabilities (create/manage/approve/library) — no legacy
      // equivalent; default hidden until the server response arrives.
      return false;
  }
}
