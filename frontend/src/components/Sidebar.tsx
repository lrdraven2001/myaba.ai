import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCommentDots,
  faFileAlt,
  faUsers,
  faCog,
  faBrain,
  faProjectDiagram,
  faSearch,
  faShieldAlt,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../contexts/AuthContext';
import ProfileModal from './ProfileModal';
import { api } from '../lib/api';
import type { View } from '../App';

interface SidebarProps {
  activeView: View;
  onViewChange: (view: View) => void;
}

const navItems: { view: View; icon: typeof faCommentDots; label: string }[] = [
  { view: 'chat',      icon: faCommentDots,    label: 'Chat'      },
  { view: 'search',    icon: faSearch,         label: 'Search'    },
  { view: 'projects',  icon: faProjectDiagram, label: 'Projects'  },
  { view: 'clients',   icon: faUsers,          label: 'Clients'   },
  { view: 'documents', icon: faFileAlt,        label: 'Documents' },
];

export default function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const { currentUser } = useAuth();
  const [showProfile, setShowProfile]     = useState(false);
  const [pendingCount, setPendingCount]   = useState(0);

  const isAdmin = currentUser?.role === 'ORG_ADMIN' || currentUser?.role === 'ORG_SUPER_ADMIN';

  // Poll for pending review count every 60 s (admin only)
  useEffect(() => {
    if (!isAdmin) return;
    const load = () => {
      api.getReviewPendingCount()
        .then((r) => setPendingCount(r.count))
        .catch(() => {/* non-fatal */});
    };
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [isAdmin]);

  const initials = currentUser?.displayName
    ? currentUser.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : currentUser?.email?.slice(0, 2).toUpperCase() ?? '??';

  return (
    <>
      <div
        className="flex flex-col items-center"
        style={{ width: 120, background: '#2a5f6f', minHeight: '100vh', flexShrink: 0 }}
      >
        {/* Logo */}
        <div className="w-full flex justify-center py-5" style={{ background: '#1e4d5c' }}>
          <div className="flex flex-col items-center">
            <div
              className="flex items-center justify-center rounded-lg"
              style={{ background: 'white', width: 56, height: 56 }}
            >
              <FontAwesomeIcon icon={faBrain} style={{ fontSize: 28, color: '#2a5f6f' }} />
            </div>
            <div className="text-white font-bold text-center mt-1" style={{ fontSize: 10, lineHeight: '1.2' }}>
              my<br />ABA
            </div>
          </div>
        </div>

        {/* Nav items */}
        {navItems.map(({ view, icon, label }) => (
          <button
            key={view}
            onClick={() => onViewChange(view)}
            className="w-full flex flex-col items-center py-4 text-white cursor-pointer transition-colors"
            style={{
              background: activeView === view ? 'rgba(255,255,255,0.15)' : 'transparent',
              borderTop: 'none',
              borderRight: 'none',
              borderBottom: 'none',
              borderLeft: activeView === view ? '3px solid #5fb3d0' : '3px solid transparent',
            }}
          >
            <FontAwesomeIcon icon={icon} style={{ fontSize: 24, marginBottom: 5 }} />
            <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.02em' }}>{label}</span>
          </button>
        ))}

        {/* Review queue — admin only */}
        {isAdmin && (
          <button
            onClick={() => onViewChange('review')}
            className="w-full flex flex-col items-center py-4 text-white cursor-pointer transition-colors relative"
            style={{
              background: activeView === 'review' ? 'rgba(255,255,255,0.15)' : 'transparent',
              borderTop: 'none', borderRight: 'none', borderBottom: 'none',
              borderLeft: activeView === 'review' ? '3px solid #5fb3d0' : '3px solid transparent',
            }}
          >
            <div className="relative">
              <FontAwesomeIcon icon={faShieldAlt} style={{ fontSize: 24, marginBottom: 5 }} />
              {pendingCount > 0 && (
                <span
                  className="absolute -top-1.5 -right-2 w-4 h-4 rounded-full text-white flex items-center justify-center font-bold"
                  style={{ background: '#f59e0b', fontSize: 9 }}
                >
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </div>
            <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.02em' }}>Review</span>
          </button>
        )}

        {/* Bottom — settings + profile avatar */}
        <div className="mt-auto flex flex-col items-center pb-5 gap-4">
          {/* Settings gear */}
          <button
            onClick={() => onViewChange('settings')}
            className="flex flex-col items-center gap-1 text-white transition-opacity hover:opacity-80"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <FontAwesomeIcon
              icon={faCog}
              style={{ fontSize: 26, color: activeView === 'settings' ? '#5fb3d0' : 'white' }}
            />
            <span style={{ fontSize: 10, color: activeView === 'settings' ? '#5fb3d0' : 'rgba(255,255,255,0.7)' }}>
              Settings
            </span>
          </button>

          {/* Profile avatar */}
          <button
            onClick={() => setShowProfile(true)}
            className="flex flex-col items-center gap-1 transition-opacity hover:opacity-80"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
            title="My Profile"
          >
            <div
              className="flex items-center justify-center rounded-full font-bold"
              style={{ width: 44, height: 44, background: 'white', color: '#2a5f6f', fontSize: 16 }}
            >
              {initials}
            </div>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>Profile</span>
          </button>
        </div>
      </div>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </>
  );
}
