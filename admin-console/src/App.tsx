import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { api, ApiError } from './lib/api';
import LoginView from './views/LoginView';
import Sidebar from './components/Sidebar';
import ApprovedCreatorsView from './views/ApprovedCreatorsView';
import TenantsView from './views/TenantsView';
import UsageView from './views/UsageView';
import PlatformConfigView from './views/PlatformConfigView';
import HealthView from './views/HealthView';

export type View = 'creators' | 'tenants' | 'usage' | 'config' | 'health';

/** Shown when a signed-in user is not on the PLATFORM_ADMIN_EMAILS allowlist. */
function AccessDeniedView() {
  const { currentUser, logout } = useAuth();
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F172A', padding: 24 }}>
      <div style={{ maxWidth: 420, background: '#1E293B', border: '1px solid #334155', borderRadius: 16, padding: '32px 30px', textAlign: 'center' }}>
        <div style={{ fontSize: 34, marginBottom: 12 }}>🔒</div>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#F1F5F9', margin: 0 }}>Not a platform operator</h1>
        <p style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.6, marginTop: 10 }}>
          <span style={{ color: '#E2E8F0', fontWeight: 600 }}>{currentUser?.email}</span> signed in
          successfully but is not on the platform-operator allowlist. Operators are granted via the{' '}
          <code style={{ background: '#0F172A', padding: '1px 5px', borderRadius: 4, fontSize: 12 }}>PLATFORM_ADMIN_EMAILS</code>{' '}
          environment variable on the API service.
        </p>
        <button
          onClick={() => { void logout(); }}
          style={{ marginTop: 20, padding: '9px 22px', background: 'linear-gradient(135deg, #1565C0, #1E88FF)', border: 'none', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function AppShell() {
  const { currentUser, loading } = useAuth();
  const [view, setView] = useState<View>('creators');
  // Server-side access probe: 'checking' | 'ok' | 'denied'. The backend gates
  // /api/platform by the PLATFORM_ADMIN_EMAILS allowlist — the client can't
  // (and shouldn't) know the list, so we ask by calling a harmless endpoint.
  const [access, setAccess] = useState<'checking' | 'ok' | 'denied'>('checking');

  useEffect(() => {
    if (!currentUser) { setAccess('checking'); return; }
    let cancelled = false;
    api.getHealth()
      .then(() => { if (!cancelled) setAccess('ok'); })
      .catch((e) => {
        if (cancelled) return;
        setAccess(e instanceof ApiError && e.status === 403 ? 'denied' : 'ok');
        // Non-403 failures (backend down) fall through to the shell so views
        // can show their own error states rather than a misleading lockout.
      });
    return () => { cancelled = true; };
  }, [currentUser?.uid]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: '#0F172A' }}>
        <p style={{ color: '#94A3B8', fontSize: 15 }}>Loading…</p>
      </div>
    );
  }

  if (!currentUser) return <LoginView />;
  if (access === 'denied') return <AccessDeniedView />;
  if (access === 'checking') {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F172A' }}>
        <p style={{ color: '#94A3B8', fontSize: 15 }}>Verifying access…</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', background: '#0F172A' }}>
      <Sidebar activeView={view} onViewChange={setView} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F8FAFC' }}>
        {/* Top accent bar */}
        <div style={{ height: 3, flexShrink: 0, background: 'linear-gradient(90deg, #1565C0 0%, #1E88FF 50%, #42A5F5 100%)' }} />
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {view === 'creators' && <ApprovedCreatorsView />}
          {view === 'tenants'  && <TenantsView />}
          {view === 'usage'    && <UsageView />}
          {view === 'config'   && <PlatformConfigView />}
          {view === 'health'   && <HealthView />}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
