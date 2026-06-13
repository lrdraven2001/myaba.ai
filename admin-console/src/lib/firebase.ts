import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === 'true';

let app: FirebaseApp;
let auth: Auth;

if (!DEV_AUTH) {
  app = initializeApp({
    apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  });
  auth = getAuth(app);
} else {
  app  = null as unknown as FirebaseApp;
  auth = { currentUser: null } as unknown as Auth;
}

export { app, auth };
export default app;
