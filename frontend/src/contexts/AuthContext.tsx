import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from 'firebase/auth';
import type { AppUser, UserRole, UserPurpose } from '../types';

// ---------------------------------------------------------------------------
// Dev-mode stub — set VITE_DEV_AUTH=true in .env.local to bypass Firebase
// ---------------------------------------------------------------------------
const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === 'true';

const DEV_USER: AppUser = {
  uid: 'dev-user-001',
  email: 'bcba@myaba.dev',
  displayName: 'Chris Hunt',
  role: 'TREATING_BCBA',
  purpose: 'treatment',
  orgId: 'dev-org-001',
};

interface AuthContextValue {
  currentUser: AppUser | null;
  firebaseUser: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(DEV_AUTH ? DEV_USER : null);
  const [loading, setLoading] = useState(!DEV_AUTH);

  useEffect(() => {
    if (DEV_AUTH) return;

    // Dynamic import so Firebase is only initialized when credentials exist
    import('../lib/firebase').then(({ auth }) => {
      import('firebase/auth').then(({ onAuthStateChanged }) => {
        const unsub = onAuthStateChanged(auth, async (user) => {
          setFirebaseUser(user);
          if (user) {
            const { getIdTokenResult } = await import('firebase/auth');
            const tokenResult = await getIdTokenResult(user);
            const claims = tokenResult.claims as Record<string, string>;
            setCurrentUser({
              uid: user.uid,
              email: user.email ?? '',
              displayName: user.displayName,
              role: (claims.role as UserRole) ?? 'TREATING_BCBA',
              purpose: (claims.purpose as UserPurpose) ?? 'treatment',
              orgId: claims.orgId ?? '',
            });
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
    if (DEV_AUTH) {
      setCurrentUser({ ...DEV_USER, email });
      return;
    }
    const { auth } = await import('../lib/firebase');
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    await signInWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    if (DEV_AUTH) {
      setCurrentUser(null);
      return;
    }
    const { auth } = await import('../lib/firebase');
    const { signOut } = await import('firebase/auth');
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ currentUser, firebaseUser, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
