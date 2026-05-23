import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Sidebar from './components/Sidebar';
import ChatView from './views/ChatView';
import SearchView from './views/SearchView';
import PoliciesView from './views/PoliciesView';
import TemplatesView from './views/TemplatesView';
import ClientsView from './views/ClientsView';
import LoginView from './views/LoginView';

type View = 'chat' | 'search' | 'policies' | 'templates' | 'clients';

function AppShell() {
  const { currentUser, loading } = useAuth();
  const [activeView, setActiveView] = useState<View>('chat');

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-gray-400 text-lg">Loading…</div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginView />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {activeView === 'chat' && <ChatView />}
        {activeView === 'search' && <SearchView />}
        {activeView === 'policies' && <PoliciesView />}
        {activeView === 'templates' && <TemplatesView />}
        {activeView === 'clients' && <ClientsView />}
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
