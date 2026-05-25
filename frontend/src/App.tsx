import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Sidebar from './components/Sidebar';
import ChatView from './views/ChatView';
import SearchView from './views/SearchView';
import DocumentsView from './views/DocumentsView';
import ClientsView from './views/ClientsView';
import ProjectsView from './views/ProjectsView';
import SettingsView from './views/SettingsView';
import ReviewQueueView from './views/ReviewQueueView';
import LoginView from './views/LoginView';
import OnboardingView from './views/OnboardingView';

export type View = 'chat' | 'search' | 'documents' | 'clients' | 'projects' | 'settings' | 'review';

export type DocumentTab = 'resources' | 'templates';

const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === 'true';

function AppShell() {
  const { currentUser, loading } = useAuth();
  const [activeView, setActiveView]       = useState<View>('chat');
  const [pendingChatId, setPendingChatId]     = useState<string | null>(null);
  const [pendingDocTab, setPendingDocTab]     = useState<DocumentTab>('resources');

  /** Called by ProjectsView when the user starts a chat from a project. */
  const handleNavigateToChat = (chatId: string) => {
    setPendingChatId(chatId);
    setActiveView('chat');
  };

  /** Called by SearchView when the user clicks a result. */
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

  // New users who haven't joined an org yet go through onboarding.
  // Skip in dev-auth mode — the stub user already has dev-org-001.
  if (!DEV_AUTH && (!currentUser.orgId || currentUser.orgId === '')) {
    return (
      <OnboardingView
        onComplete={() => {
          // Token refresh: Firebase custom claims are now set.
          // A full reload re-initialises AuthContext with the updated token.
          window.location.reload();
        }}
      />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {activeView === 'chat'      && (
          <ChatView
            initialChatId={pendingChatId}
            key={pendingChatId ?? 'chat'}
          />
        )}
        {activeView === 'search'    && <SearchView onNavigate={handleNavigateFromSearch} />}
        {activeView === 'documents' && <DocumentsView initialTab={pendingDocTab} key={pendingDocTab} />}
        {activeView === 'clients'   && <ClientsView />}
        {activeView === 'projects'  && (
          <ProjectsView onNavigateToChat={handleNavigateToChat} />
        )}
        {activeView === 'settings'  && <SettingsView />}
        {activeView === 'review'    && <ReviewQueueView />}
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
