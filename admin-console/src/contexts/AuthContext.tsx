import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

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

  const login = async (email: string, password: string) => {
    if (DEV_AUTH) { setCurrentUser({ ...DEV_USER, email }); return; }
    const { auth }                       = await import('../lib/firebase');
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    await signInWithEmailAndPassword(auth, email, password);
  };

  const loginWithGoogle = async () => {
    if (DEV_AUTH) { setCurrentUser(DEV_USER); return; }
    const { auth }                                = await import('../lib/firebase');
    const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
    await signInWithPopup(auth, new GoogleAuthProvider());
  };

  const logout = async () => {
    if (DEV_AUTH) { setCurrentUser(null); return; }
    const { auth }    = await import('../lib/firebase');
    const { signOut } = await import('firebase/auth');
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ currentUser, loading, login, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
