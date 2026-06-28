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
  email: 'admin@myaba.ai',
  displayName: 'Chris Hunt',
  role: 'ORG_SUPER_ADMIN',
  purpose: 'treatment',
  orgId: 'dev-org-001',
  supervisorId: undefined,
};

interface AuthContextValue {
  currentUser: AppUser | null;
  firebaseUser: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  /** Re-read the Firebase user + claims (call after a profile / email / MFA change). */
  refreshUser: () => Promise<void>;
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
            const claims = tokenResult.claims as Record<string, unknown>;
            setCurrentUser({
              uid: user.uid,
              email: user.email ?? '',
              displayName: user.displayName,
              role: (claims.role as UserRole) ?? 'GENERAL_STAFF',
              purpose: (claims.purpose as UserPurpose) ?? 'treatment',
              orgId: (claims.orgId as string) ?? '',
              supervisorId: claims.supervisorId as string | undefined,
              phiAccess: claims.phiAccess as boolean | undefined,
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

  const register = async (email: string, password: string, displayName: string) => {
    if (DEV_AUTH) {
      setCurrentUser({ ...DEV_USER, email, displayName });
      return;
    }
    const { auth } = await import('../lib/firebase');
    const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    // Set display name immediately so the UI shows it without a second login
    await updateProfile(credential.user, { displayName });
    // onAuthStateChanged fires automatically after this; force claims refresh
    await credential.user.getIdToken(true);
  };

  const loginWithGoogle = async () => {
    if (DEV_AUTH) {
      setCurrentUser({ ...DEV_USER, email: 'dev@google.com' });
      return;
    }
    const { auth } = await import('../lib/firebase');
    const { signInWithPopup, GoogleAuthProvider } = await import('firebase/auth');
    await signInWithPopup(auth, new GoogleAuthProvider());
    // onAuthStateChanged above will pick up the resulting user automatically
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

  const refreshUser = async () => {
    if (DEV_AUTH) return;
    const { auth } = await import('../lib/firebase');
    const user = auth.currentUser;
    if (!user) return;
    await user.reload();
    const tokenResult = await user.getIdTokenResult(true);
    const claims = tokenResult.claims as Record<string, unknown>;
    setFirebaseUser(user);
    setCurrentUser({
      uid: user.uid,
      email: user.email ?? '',
      displayName: user.displayName,
      role: (claims.role as UserRole) ?? 'GENERAL_STAFF',
      purpose: (claims.purpose as UserPurpose) ?? 'treatment',
      orgId: (claims.orgId as string) ?? '',
      supervisorId: claims.supervisorId as string | undefined,
      phiAccess: claims.phiAccess as boolean | undefined,
    });
  };

  return (
    <AuthContext.Provider value={{ currentUser, firebaseUser, loading, login, register, loginWithGoogle, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
