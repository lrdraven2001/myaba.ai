import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { MultiFactorResolver } from 'firebase/auth';

const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === 'true';

interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
}

const DEV_USER: AdminUser = {
  uid:         'dev-user-001',
  email:       'chris@myaba.ai',
  displayName: 'Chris Hunt',
};

interface AuthContextValue {
  currentUser: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  /** True when a sign-in is paused awaiting a TOTP second-factor code. */
  mfaPending: boolean;
  /** Complete the paused sign-in with the 6-digit authenticator code. */
  resolveMfa: (code: string) => Promise<void>;
  /** Abandon the pending second-factor challenge. */
  cancelMfa: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Sign-in only. Whether the signed-in user is actually a platform operator is
 * decided SERVER-SIDE (PLATFORM_ADMIN_EMAILS allowlist) — the App shell probes
 * /api/platform/health after login and shows an access-denied screen on 403.
 * No client-side claim check: customer roles don't map to platform access.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(DEV_AUTH ? DEV_USER : null);
  const [loading, setLoading]         = useState(!DEV_AUTH);
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);

  useEffect(() => {
    if (DEV_AUTH) return;
    import('../lib/firebase').then(({ auth }) => {
      import('firebase/auth').then(({ onAuthStateChanged }) => {
        const unsub = onAuthStateChanged(auth, (fbUser) => {
          setCurrentUser(fbUser ? {
            uid:         fbUser.uid,
            email:       fbUser.email ?? '',
            displayName: fbUser.displayName ?? fbUser.email ?? '',
          } : null);
          setLoading(false);
        });
        return unsub;
      });
    });
  }, []);

  // Enrolled-MFA users: pause the sign-in and surface a marker so the UI can
  // prompt for the TOTP code. Re-thrown as code 'mfa-required'.
  const startMfa = async (e: unknown) => {
    const { auth } = await import('../lib/firebase');
    const { getMultiFactorResolver } = await import('firebase/auth');
    setMfaResolver(getMultiFactorResolver(auth, e as Parameters<typeof getMultiFactorResolver>[1]));
    const err = new Error('mfa-required') as Error & { code?: string };
    err.code = 'mfa-required';
    throw err;
  };

  const login = async (email: string, password: string) => {
    if (DEV_AUTH) { setCurrentUser({ ...DEV_USER, email }); return; }
    const { auth }                       = await import('../lib/firebase');
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      if ((e as { code?: string })?.code === 'auth/multi-factor-auth-required') return startMfa(e);
      throw e;
    }
  };

  const loginWithGoogle = async () => {
    if (DEV_AUTH) { setCurrentUser(DEV_USER); return; }
    const { auth }                                = await import('../lib/firebase');
    const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      if ((e as { code?: string })?.code === 'auth/multi-factor-auth-required') return startMfa(e);
      throw e;
    }
  };

  /** Resolve a paused sign-in with a TOTP code from the user's authenticator. */
  const resolveMfa = async (code: string) => {
    if (!mfaResolver) throw new Error('No multi-factor challenge in progress');
    const { TotpMultiFactorGenerator } = await import('firebase/auth');
    const hint = mfaResolver.hints[0]; // single TOTP factor per user
    const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code);
    await mfaResolver.resolveSignIn(assertion); // onAuthStateChanged picks up the user
    setMfaResolver(null);
  };

  const cancelMfa = () => setMfaResolver(null);

  const logout = async () => {
    if (DEV_AUTH) { setCurrentUser(null); return; }
    const { auth }    = await import('../lib/firebase');
    const { signOut } = await import('firebase/auth');
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{
      currentUser, loading, login, loginWithGoogle, logout,
      mfaPending: mfaResolver !== null, resolveMfa, cancelMfa,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
