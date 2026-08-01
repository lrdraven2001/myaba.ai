import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

// ── Automatic logoff (HIPAA §164.312(a)(2)(iii)) ─────────────────────────────
// Signs the user out after a period of inactivity, with a warning + countdown so
// they can extend. Env-overridable so environments can tune it without a rebuild.
// Cross-tab aware: activity in ANY tab keeps the whole app alive (Firebase already
// propagates the sign-out itself to every tab).

const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === 'true';
const IDLE_MINUTES = Number(import.meta.env.VITE_IDLE_TIMEOUT_MINUTES) || 15;
const WARNING_SECONDS = Number(import.meta.env.VITE_IDLE_WARNING_SECONDS) || 60;

const IDLE_MS = IDLE_MINUTES * 60_000;
const WARN_MS = WARNING_SECONDS * 1000;
const LS_KEY = 'myaba:lastActivity';
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'] as const;

export default function IdleTimeout() {
  const { currentUser, logout } = useAuth();
  const [warning, setWarning] = useState(false);
  const [remaining, setRemaining] = useState(WARNING_SECONDS);

  const lastActivityRef = useRef(0);
  const lsWriteRef = useRef(0);
  // Keep the latest logout without re-subscribing the listeners each render.
  const logoutRef = useRef(logout);
  useEffect(() => { logoutRef.current = logout; }, [logout]);

  const markActive = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    // Throttle cross-tab broadcasts to once every 2s.
    if (now - lsWriteRef.current > 2000) {
      lsWriteRef.current = now;
      try { localStorage.setItem(LS_KEY, String(now)); } catch { /* storage disabled */ }
    }
    setWarning(false);
  }, []);

  useEffect(() => {
    if (DEV_AUTH || !currentUser) return;

    lastActivityRef.current = Date.now();
    try { localStorage.setItem(LS_KEY, String(lastActivityRef.current)); } catch { /* ignore */ }

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, markActive, { passive: true }));

    // Another tab's activity resets our idle timer too.
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === LS_KEY && ev.newValue) {
        const t = Number(ev.newValue);
        if (!Number.isNaN(t)) {
          lastActivityRef.current = Math.max(lastActivityRef.current, t);
          setWarning(false);
        }
      }
    };
    window.addEventListener('storage', onStorage);

    const interval = window.setInterval(() => {
      const idleFor = Date.now() - lastActivityRef.current;
      if (idleFor >= IDLE_MS) {
        logoutRef.current();
      } else if (idleFor >= IDLE_MS - WARN_MS) {
        setWarning(true);
        setRemaining(Math.max(0, Math.ceil((IDLE_MS - idleFor) / 1000)));
      } else {
        setWarning(false);
      }
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, markActive));
      window.removeEventListener('storage', onStorage);
      window.clearInterval(interval);
    };
  }, [currentUser, markActive]);

  if (DEV_AUTH || !currentUser || !warning) return null;

  const mm = Math.floor(remaining / 60);
  const ss = (remaining % 60).toString().padStart(2, '0');
  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40" role="alertdialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900">Are you still there?</h2>
        <p className="text-sm text-gray-600 mt-2">
          For security, you'll be signed out due to inactivity in{' '}
          <span className="font-semibold text-gray-900">{mm}:{ss}</span>.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={() => logoutRef.current()}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Sign out now
          </button>
          <button
            onClick={markActive}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#2a5f6f' }}
          >
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  );
}
