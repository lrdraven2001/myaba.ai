import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === 'true';

interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  role: string;
}

const DEV_USER: AdminUser = {
  uid:         'dev-user-001',
  email:       'chris@myaba.ai',
  displayName: 'Chris Hunt',
  role:        'ORG_SUPER_ADMIN',
};

interface AuthContextValue {
  currentUser: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(DEV_AUTH ? DEV_USER : null);
  const [loading, setLoading]         = useState(!DEV_AUTH);

  useEffect(() => {
    if (DEV_AUTH) return;
    import('../lib/firebase').then(({ auth }) => {
      import('firebase/auth').then(({ onAuthStateChanged, getIdTokenResult }) => {
        const unsub = onAuthStateChanged(auth, async (fbUser) => {
          if (fbUser) {
            const token  = await getIdTokenResult(fbUser);
            const claims = token.claims as Record<string, string>;
            // Only allow ORG_SUPER_ADMIN into the admin console
            if (claims.role !== 'ORG_SUPER_ADMIN') {
              setCurrentUser(null);
            } else {
              setCurrentUser({
                uid:         fbUser.uid,
                email:       fbUser.email ?? '',
                displayName: fbUser.displayName ?? '',
                role:        claims.role,
              });
            }
          } else {
            setCurrentUser(null);
          }
          setLoading(false);
        });
        return unsub;
      });
    });
  }, []);

  const login = async (email: string, password: string) => {
    if (DEV_AUTH) { setCurrentUser({ ...DEV_USER, email }); return; }
    const { auth }                   = await import('../lib/firebase');
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    await signInWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    if (DEV_AUTH) { setCurrentUser(null); return; }
    const { auth }   = await import('../lib/firebase');
    const { signOut } = await import('firebase/auth');
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ currentUser, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
