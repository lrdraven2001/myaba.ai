import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginView from './views/LoginView';
import Sidebar from './components/Sidebar';
import TenantsView from './views/TenantsView';
import UsageView from './views/UsageView';
import PlatformConfigView from './views/PlatformConfigView';
import HealthView from './views/HealthView';

export type View = 'tenants' | 'usage' | 'config' | 'health';

function AppShell() {
  const { currentUser, loading } = useAuth();
  const [view, setView] = useState<View>('tenants');

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: '#0F172A' }}>
        <p style={{ color: '#94A3B8', fontSize: 15 }}>Loading…</p>
      </div>
    );
  }

  if (!currentUser) return <LoginView />;

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', background: '#0F172A' }}>
      <Sidebar activeView={view} onViewChange={setView} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F8FAFC' }}>
        {/* Top accent bar */}
        <div style={{ height: 3, flexShrink: 0, background: 'linear-gradient(90deg, #1565C0 0%, #1E88FF 50%, #42A5F5 100%)' }} />
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {view === 'tenants' && <TenantsView />}
          {view === 'usage'   && <UsageView />}
          {view === 'config'  && <PlatformConfigView />}
          {view === 'health'  && <HealthView />}
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
