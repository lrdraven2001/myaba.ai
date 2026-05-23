import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCommentDots,
  faSearch,
  faFileAlt,
  faFolderOpen,
  faUsers,
  faCog,
  faBrain,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../contexts/AuthContext';

type View = 'chat' | 'search' | 'policies' | 'templates' | 'clients';

interface SidebarProps {
  activeView: View;
  onViewChange: (view: View) => void;
}

const navItems: { view: View; icon: typeof faCommentDots; label: string }[] = [
  { view: 'chat', icon: faCommentDots, label: 'Chat' },
  { view: 'search', icon: faSearch, label: 'Search' },
  { view: 'policies', icon: faFileAlt, label: 'Policies' },
  { view: 'templates', icon: faFolderOpen, label: 'Templates' },
  { view: 'clients', icon: faUsers, label: 'Clients' },
];

export default function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const { currentUser } = useAuth();

  const initials = currentUser?.displayName
    ? currentUser.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : currentUser?.email?.slice(0, 2).toUpperCase() ?? 'CH';

  return (
    <div
      className="flex flex-col items-center"
      style={{ width: 120, background: '#2a5f6f', minHeight: '100vh' }}
    >
      {/* Logo */}
      <div
        className="w-full flex justify-center py-6"
        style={{ background: '#1e4d5c' }}
      >
        <div className="flex flex-col items-center">
          <div
            className="flex items-center justify-center rounded-lg"
            style={{ background: 'white', width: 60, height: 60 }}
          >
            <FontAwesomeIcon icon={faBrain} style={{ fontSize: 32, color: '#2a5f6f' }} />
          </div>
          <div
            className="text-white font-bold text-center mt-1"
            style={{ fontSize: 11, lineHeight: '1.2' }}
          >
            my<br />ABA
          </div>
        </div>
      </div>

      {/* Nav */}
      {navItems.map(({ view, icon, label }) => (
        <button
          key={view}
          onClick={() => onViewChange(view)}
          className="w-full flex flex-col items-center py-5 text-white cursor-pointer transition-colors"
          style={{
            background: activeView === view ? 'rgba(255,255,255,0.15)' : 'transparent',
            borderLeft: activeView === view ? '4px solid #5fb3d0' : '4px solid transparent',
            borderRight: 'none',
            borderTop: 'none',
            borderBottom: 'none',
          }}
        >
          <FontAwesomeIcon icon={icon} style={{ fontSize: 28, marginBottom: 8 }} />
          <span style={{ fontSize: 12, fontWeight: 500 }}>{label}</span>
        </button>
      ))}

      {/* Bottom */}
      <div className="mt-auto flex flex-col items-center pb-5 gap-5">
        <FontAwesomeIcon
          icon={faCog}
          style={{ fontSize: 32, color: 'white', cursor: 'pointer' }}
        />
        <div
          className="flex items-center justify-center rounded-full font-bold"
          style={{
            width: 50,
            height: 50,
            background: 'white',
            color: '#2a5f6f',
            fontSize: 18,
          }}
        >
          {initials}
        </div>
      </div>
    </div>
  );
}
