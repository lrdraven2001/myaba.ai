import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faShieldAlt, faLock, faFileContract, faSearch } from '@fortawesome/free-solid-svg-icons';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProfileModal from './components/ProfileModal';
import NotificationBell from './components/NotificationBell';
import HelpMenu from './components/HelpMenu';
import Sidebar from './components/Sidebar';
import ChatView from './views/ChatView';
import SearchModal from './views/SearchModal';
import ResourcesView from './views/ResourcesView';
import ClientsView from './views/ClientsView';
import ProjectsView from './views/ProjectsView';
import SettingsView from './views/SettingsView';
import ReviewQueueView from './views/ReviewQueueView';
import TeamView from './views/TeamView';
import LoginView from './views/LoginView';
import OnboardingView from './views/OnboardingView';
import NotProvisionedView from './views/NotProvisionedView';
import MfaEnrollmentGate from './views/MfaEnrollmentGate';
import InviteAcceptView from './views/InviteAcceptView';
import { api } from './lib/api';
import { ALL_ROLE_LABELS as ROLE_LABELS } from './types';
import { hasEnrolledFactor } from './lib/mfa';

// Capture invite token from URL before any render — store in sessionStorage, clean URL
const INVITE_MATCH = window.location.pathname.match(/^\/invite\/([A-Za-z0-9]+)/);
if (INVITE_MATCH) {
  sessionStorage.setItem('pendingInviteToken', INVITE_MATCH[1]);
  history.replaceState(null, '', '/');
}

export type View = 'chat' | 'search' | 'documents' | 'clients' | 'projects' | 'settings' | 'review' | 'team';

export type DocumentTab = 'resources' | 'templates';

const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === 'true';

// ── Top-right profile menu ───────────────────────────────────────────────────────

function ProfileMenu() {
  const { currentUser } = useAuth();
  const [showProfile, setShowProfile] = useState(false);

  const initials = currentUser?.displayName
    ? currentUser.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : currentUser?.email?.slice(0, 2).toUpperCase() ?? '??';

  const displayName = currentUser?.displayName ?? currentUser?.email ?? 'User';
  const roleLabel   = ROLE_LABELS[currentUser?.role ?? ''] ?? currentUser?.role ?? 'User';

  return (
    <>
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
        <div style={{ lineHeight: 1.25, textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1E3347' }}>{displayName}</div>
          <div style={{ fontSize: 11, color: '#6B7B88' }}>{roleLabel}</div>
        </div>
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
        <FontAwesomeIcon icon={faChevronDown} style={{ color: '#A8B4BF', fontSize: 10 }} />
      </button>
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </>
  );
}

// ── App shell ──────────────────────────────────────────────────────────────────

function AppShell() {
  const { currentUser, firebaseUser, loading } = useAuth();
  const [activeView, setActiveView]           = useState<View>('chat');
  const [pendingChatId, setPendingChatId]     = useState<string | null>(null);
  const [pendingClientId, setPendingClientId] = useState<string | null>(null);
  const [pendingDocTab, setPendingDocTab]     = useState<DocumentTab>('resources');
  const [invitePreview, setInvitePreview]     = useState<{ orgName: string; role: string } | null>(null);
  // Org BAA state — absent field on legacy orgs treated as accepted (true).
  const [baaAccepted, setBaaAccepted] = useState<boolean>(true);
  // Pathfinder org-creation eligibility for users with no org yet.
  // null = unknown/loading; true = may create; false = show "not provisioned".
  const [orgEligible, setOrgEligible] = useState<boolean | null>(null);
  // Workspace search modal (opened from the top-bar icon or Ctrl/⌘+K).
  const [showSearch, setShowSearch] = useState(false);
  // MFA enforcement: does the org require MFA, and has this user enrolled a factor?
  const [mfaEnforced, setMfaEnforced] = useState(false);
  const [hasMfaFactor, setHasMfaFactor] = useState<boolean | null>(null);

  // Pre-fetch org name so InviteAcceptView can show it before the user logs in.
  // Never remove the token on failure — the invite may still be valid even if preview fails.
  useEffect(() => {
    const token = sessionStorage.getItem('pendingInviteToken');
    if (token) {
      api.resolveInvite(token).then(setInvitePreview).catch(() => {});
    }
  }, []);

  // Load org BAA status + MFA enforcement whenever the user (and their orgId) is known.
  useEffect(() => {
    if (!currentUser?.orgId) return;
    api.getOrg(currentUser.orgId)
      .then((org) => {
        setBaaAccepted(org.baaAccepted ?? true);
        setMfaEnforced(Boolean(org.settings?.mfaEnforced));
      })
      .catch(() => setBaaAccepted(true)); // fail-open: don't lock out on network error
  }, [currentUser?.orgId]);

  // Whether the signed-in Firebase user has enrolled a second factor (TOTP).
  // Fail-open (treat as enrolled) on any error so we never hard-lock a user out.
  useEffect(() => {
    if (DEV_AUTH || !firebaseUser) { setHasMfaFactor(true); return; }
    hasEnrolledFactor(firebaseUser).then(setHasMfaFactor).catch(() => setHasMfaFactor(true));
  }, [firebaseUser]);

  // For signed-in users with no org, check the Pathfinder allowlist before
  // showing the create-org flow. Fail closed on error (show "not provisioned").
  useEffect(() => {
    if (DEV_AUTH) { setOrgEligible(true); return; }
    if (!currentUser) { setOrgEligible(null); return; }
    if (currentUser.orgId) { setOrgEligible(true); return; }
    setOrgEligible(null);
    api.getOrgEligibility()
      .then((r) => setOrgEligible(r.allowed))
      .catch(() => setOrgEligible(false));
  }, [currentUser?.uid, currentUser?.orgId]);

  // Ctrl/⌘+K opens the search modal from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isAdmin = currentUser?.role === 'ORG_SUPER_ADMIN' || currentUser?.role === 'CLINICAL_DIRECTOR';

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

  // Invite flow — shown for any pending invite token regardless of auth state.
  // InviteAcceptView owns the full setup flow (account → 2FA → agreements → claim).
  const pendingToken = sessionStorage.getItem('pendingInviteToken');
  if (pendingToken) {
    return <InviteAcceptView token={pendingToken} invitePreview={invitePreview} />;
  }

  if (!currentUser) return <LoginView />;

  if (!DEV_AUTH && (!currentUser.orgId || currentUser.orgId === '')) {
    if (orgEligible === null) {
      return (
        <div className="h-screen flex items-center justify-center">
          <div className="text-gray-400 text-lg">Loading…</div>
        </div>
      );
    }
    if (!orgEligible) return <NotProvisionedView />;
    return (
      <OnboardingView
        onComplete={() => { window.location.reload(); }}
      />
    );
  }

  // MFA enforcement gate: org requires MFA and this user hasn't enrolled a factor.
  if (!DEV_AUTH && mfaEnforced && hasMfaFactor === false) {
    return <MfaEnrollmentGate />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Main content row */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar activeView={activeView} onViewChange={setActiveView} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top bar — HIPAA banner (left) · help, notifications, profile (right) */}
          <div
            style={{
              height: 52, flexShrink: 0, background: 'white', borderBottom: '1px solid #DCE7EE',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 24, paddingRight: 20,
            }}
          >
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
            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => setShowSearch(true)}
                aria-label="Search (Ctrl/⌘+K)"
                title="Search  (Ctrl/⌘+K)"
                style={{
                  width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#3F5666',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#EAF2F6')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <FontAwesomeIcon icon={faSearch} style={{ fontSize: 15 }} />
              </button>
              <HelpMenu />
              <NotificationBell />
              <div style={{ width: 1, height: 24, background: '#DCE7EE', margin: '0 8px' }} />
              <ProfileMenu />
            </div>
          </div>
          {/* Brand accent bar */}
          <div style={{ height: 3, flexShrink: 0, background: 'linear-gradient(90deg, #1E88FF 0%, #3F9B2F 55%, #7ED957 100%)' }} />
          {activeView === 'chat'      && (
            <ChatView
              initialChatId={pendingChatId}
              initialClientId={pendingClientId}
              key={pendingChatId ?? 'chat'}
              baaAccepted={baaAccepted}
            />
          )}
          {activeView === 'documents' && <ResourcesView />}
          {activeView === 'clients'   && (
            baaAccepted
              ? <ClientsView
                  onStartChat={(clientId) => {
                    setPendingChatId(null);
                    setPendingClientId(clientId);
                    setActiveView('chat');
                  }}
                  onOpenChat={(chatId) => {
                    setPendingClientId(null);
                    setPendingChatId(chatId);
                    setActiveView('chat');
                  }}
                />
              : <BaaRequiredWall onGoToSettings={() => setActiveView('settings')} />
          )}
          {activeView === 'projects'  && (
            <ProjectsView onNavigateToChat={handleNavigateToChat} />
          )}
          {activeView === 'settings'  && isAdmin && <SettingsView />}
          {activeView === 'review'    && <ReviewQueueView />}
          {activeView === 'team'      && <TeamView />}
        </div>
      </div>

      {showSearch && (
        <SearchModal
          onClose={() => setShowSearch(false)}
          onNavigate={handleNavigateFromSearch}
        />
      )}
    </div>
  );
}

// ── BAA required wall ─────────────────────────────────────────────────────────

function BaaRequiredWall({ onGoToSettings }: { onGoToSettings: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 bg-gray-50">
      <div
        className="flex flex-col items-center gap-5 max-w-md text-center p-10 rounded-2xl border border-amber-200"
        style={{ background: '#fffbeb' }}
      >
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: '#fef3c7' }}
        >
          <FontAwesomeIcon icon={faLock} style={{ fontSize: 26, color: '#d97706' }} />
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-900">BAA Required</p>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            Access to client records and other HIPAA-protected features requires a signed
            Business Associate Agreement (BAA). A <strong>Clinical Director</strong> must
            sign the BAA before this section can be used.
          </p>
        </div>
        <button
          onClick={onGoToSettings}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold"
          style={{ background: '#2a5f6f' }}
        >
          <FontAwesomeIcon icon={faFileContract} style={{ fontSize: 13 }} />
          Go to Settings → BAA
        </button>
        <p className="text-xs text-gray-400">
          Once signed, refresh the page to enable clinical features.
        </p>
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
