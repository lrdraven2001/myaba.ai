import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === 'true';

// In dev-auth mode Firebase isn't configured yet — export stubs so imports
// don't blow up at module load time. AuthContext only uses Firebase dynamically
// when DEV_AUTH is false, and api.ts guards its own calls behind getIdToken().
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

if (!DEV_AUTH) {
  app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
} else {
  // Typed stubs — safe to import but calling methods will throw at runtime
  app = null as unknown as FirebaseApp;
  auth = { currentUser: null } as unknown as Auth;
  db = null as unknown as Firestore;
  storage = null as unknown as FirebaseStorage;
}

export { app, auth, db, storage };
export default app;
