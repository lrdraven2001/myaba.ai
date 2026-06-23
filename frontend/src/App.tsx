import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faShieldAlt } from '@fortawesome/free-solid-svg-icons';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProfileModal from './components/ProfileModal';
import Sidebar from './components/Sidebar';
import ChatView from './views/ChatView';
import SearchView from './views/SearchView';
import ResourcesView from './views/ResourcesView';
import ClientsView from './views/ClientsView';
import ProjectsView from './views/ProjectsView';
import SettingsView from './views/SettingsView';
import ReviewQueueView from './views/ReviewQueueView';
import TeamView from './views/TeamView';
import LoginView from './views/LoginView';
import OnboardingView from './views/OnboardingView';

export type View = 'chat' | 'search' | 'documents' | 'clients' | 'projects' | 'settings' | 'review' | 'team';

export type DocumentTab = 'resources' | 'templates';

const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === 'true';

const ROLE_LABELS: Record<string, string> = {
  ORG_SUPER_ADMIN:  'Super Admin',
  ORG_ADMIN:        'Administrator',
  TREATING_BCBA:    'Treating BCBA',
  SUPERVISING_BCBA: 'Supervising BCBA',
  BCBA_STUDENT:     'BCBA Student',
  RBT:              'RBT',
  PARENT_GUARDIAN:  'Parent / Guardian',
  VIEWER:           'Viewer',
};

// ── Global footer ──────────────────────────────────────────────────────────────

function AppFooter() {
  const { currentUser } = useAuth();
  const [showProfile, setShowProfile] = useState(false);

  const initials = currentUser?.displayName
    ? currentUser.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : currentUser?.email?.slice(0, 2).toUpperCase() ?? '??';

  const displayName = currentUser?.displayName ?? currentUser?.email ?? 'User';
  const roleLabel   = ROLE_LABELS[currentUser?.role ?? ''] ?? currentUser?.role ?? 'User';

  return (
    <>
    <div
      style={{
        height: 44,
        flexShrink: 0,
        background: 'white',
        borderTop: '1px solid #DCE7EE',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 18,
        paddingRight: 24,
      }}
    >
      {/* Profile — clickable to open modal */}
      <button
        onClick={() => setShowProfile(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 6px',
          borderRadius: 8,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        title="My Profile"
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: '#7ED957',
            color: 'white',
            fontSize: 12,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(126,217,87,0.35)',
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div style={{ lineHeight: 1.25 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1E3347' }}>{displayName}</div>
          <div style={{ fontSize: 11, color: '#6B7B88' }}>{roleLabel}</div>
        </div>
        <FontAwesomeIcon icon={faChevronDown} style={{ color: '#A8B4BF', fontSize: 10, marginLeft: 2 }} />
      </button>

      {/* Divider */}
      <div style={{ width: 1, height: 24, background: '#DCE7EE', margin: '0 16px' }} />

      {/* HIPAA note */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <FontAwesomeIcon icon={faShieldAlt} style={{ color: '#3F9B2F', fontSize: 13 }} />
        <span style={{ fontSize: 12, color: '#6B7B88' }}>
          All data is HIPAA compliant and role-permissioned.
        </span>
        <a
          href="#"
          style={{ fontSize: 12, color: '#1E88FF', textDecoration: 'none', fontWeight: 500 }}
          onMouseEnter={(e) => ((e.target as HTMLAnchorElement).style.textDecoration = 'underline')}
          onMouseLeave={(e) => ((e.target as HTMLAnchorElement).style.textDecoration = 'none')}
        >
          Learn more
        </a>
      </div>
    </div>
    {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </>
  );
}

// ── App shell ──────────────────────────────────────────────────────────────────

function AppShell() {
  const { currentUser, loading } = useAuth();
  const [activeView, setActiveView]         = useState<View>('chat');
  const [pendingChatId, setPendingChatId]   = useState<string | null>(null);
  const [pendingClientId, setPendingClientId] = useState<string | null>(null);
  const [pendingDocTab, setPendingDocTab]   = useState<DocumentTab>('resources');

  const handleNavigateToChat = (chatId: string) => {
    setPendingChatId(chatId);
    setActiveView('chat');
  };

  const handleNavigateFromSearch = (type: string, _id: string, docTab?: DocumentTab) => {
    if (type === 'chat') {
      setPendingChatId(_id);
      setActiveView('chat');
    } else if (type === 'client') {
      setActiveView('clients');
    } else if (type === 'project') {
      setActiveView('projects');
    } else if (type === 'resource' || type === 'template') {
      setPendingDocTab(type === 'resource' ? 'resources' : 'templates');
      setActiveView('documents');
    } else {
      setActiveView(type as View);
    }
    void docTab; // docTab forwarding placeholder for future deep-link
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-gray-400 text-lg">Loading…</div>
      </div>
    );
  }

  if (!currentUser) return <LoginView />;

  if (!DEV_AUTH && (!currentUser.orgId || currentUser.orgId === '')) {
    return (
      <OnboardingView
        onComplete={() => { window.location.reload(); }}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Main content row */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar activeView={activeView} onViewChange={setActiveView} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Brand accent bar */}
          <div style={{ height: 3, flexShrink: 0, background: 'linear-gradient(90deg, #1E88FF 0%, #3F9B2F 55%, #7ED957 100%)' }} />
          {activeView === 'chat'      && (
            <ChatView
              initialChatId={pendingChatId}
              initialClientId={pendingClientId}
              key={pendingChatId ?? 'chat'}
            />
          )}
          {activeView === 'search'    && <SearchView onNavigate={handleNavigateFromSearch} />}
          {activeView === 'documents' && <ResourcesView />}
          {activeView === 'clients'   && (
            <ClientsView onStartChat={(clientId) => {
              setPendingChatId(null);
              setPendingClientId(clientId);
              setActiveView('chat');
            }} />
          )}
          {activeView === 'projects'  && (
            <ProjectsView onNavigateToChat={handleNavigateToChat} />
          )}
          {activeView === 'settings'  && <SettingsView />}
          {activeView === 'review'    && <ReviewQueueView />}
          {activeView === 'team'      && <TeamView />}
        </div>
      </div>
      {/* Global footer */}
      <AppFooter />
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
