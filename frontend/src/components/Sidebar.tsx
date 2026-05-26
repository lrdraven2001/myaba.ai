import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCommentDots,
  faFileAlt,
  faUsers,
  faCog,
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

const navItems: { view: View; icon: typeof faCommentDots; label: string; color: string }[] = [
  { view: 'chat',      icon: faCommentDots,    label: 'Chat',      color: '#3F9B2F' },
  { view: 'search',    icon: faSearch,         label: 'Search',    color: '#1E88FF' },
  { view: 'projects',  icon: faProjectDiagram, label: 'Projects',  color: '#F5A623' },
  { view: 'clients',   icon: faUsers,          label: 'Clients',   color: '#7ED957' },
  { view: 'documents', icon: faFileAlt,        label: 'Documents', color: '#1E88FF' },
];

export default function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const { currentUser } = useAuth();
  const [showProfile, setShowProfile]   = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const isAdmin = currentUser?.role === 'ORG_ADMIN' || currentUser?.role === 'ORG_SUPER_ADMIN';

  useEffect(() => {
    if (!isAdmin) return;
    const load = () => {
      api.getReviewPendingCount()
        .then((r) => setPendingCount(r.count))
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [isAdmin]);

  const initials = currentUser?.displayName
    ? currentUser.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : currentUser?.email?.slice(0, 2).toUpperCase() ?? '??';

  const navBtn = (
    isActive: boolean,
    onClick: () => void,
    iconEl: React.ReactNode,
    label: string,
    extraStyle?: React.CSSProperties,
  ) => (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '9px 14px',
        width: '100%',
        background: isActive ? '#EEF7EA' : 'transparent',
        borderTop: 'none',
        borderRight: 'none',
        borderBottom: 'none',
        borderLeft: isActive ? '3px solid #55C943' : '3px solid transparent',
        cursor: 'pointer',
        transition: 'background 0.15s',
        textAlign: 'left',
        ...extraStyle,
      }}
    >
      {iconEl}
      <span style={{
        fontSize: 14,
        fontWeight: isActive ? 700 : 500,
        color: isActive ? '#2E7D32' : '#1E3347',
        letterSpacing: '0.01em',
      }}>
        {label}
      </span>
    </button>
  );

  return (
    <>
      <div
        className="flex flex-col"
        style={{
          width: 195,
          background: '#F8FBFC',
          minHeight: '100vh',
          flexShrink: 0,
          borderRight: '1px solid #DCE7EE',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* ── Logo card ── */}
        <div style={{ padding: '14px 12px 12px', borderBottom: '1px solid #DCE7EE' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'white',
              borderRadius: 12,
              padding: '8px 10px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
            }}
          >
            <img
              src="/app-icon.png"
              alt="myABA.ai"
              style={{ width: 50, height: 50, objectFit: 'contain', flexShrink: 0 }}
              onError={(e) => { (e.target as HTMLImageElement).src = '/favicon.svg'; }}
            />
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em' }}>
                <span style={{ color: '#1E3347' }}>my</span>
                <span style={{ color: '#1E88FF' }}>ABA</span>
                <span style={{ color: '#3F9B2F' }}>.ai</span>
              </div>
              <div style={{ fontSize: 10, color: '#6B7B88', marginTop: 1 }}>
                ABA Platform
              </div>
            </div>
          </div>
        </div>

        {/* ── Nav items ── */}
        <div style={{ paddingTop: 6, paddingBottom: 4 }}>
          {navItems.map(({ view, icon, label, color }) => {
            const isActive = activeView === view;
            return navBtn(
              isActive,
              () => onViewChange(view),
              <FontAwesomeIcon
                icon={icon}
                style={{ fontSize: 19, color: isActive ? color : '#A8B4BF', flexShrink: 0, width: 22 }}
              />,
              label,
            );
          })}

          {/* Review queue — admin only */}
          {isAdmin && (() => {
            const isActive = activeView === 'review';
            return navBtn(
              isActive,
              () => onViewChange('review'),
              <div className="relative" style={{ width: 22, flexShrink: 0 }}>
                <FontAwesomeIcon
                  icon={faShieldAlt}
                  style={{ fontSize: 19, color: isActive ? '#F5A623' : '#A8B4BF' }}
                />
                {pendingCount > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-white flex items-center justify-center font-bold"
                    style={{ background: '#f59e0b', fontSize: 9 }}
                  >
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </div>,
              'Review',
            );
          })()}
        </div>

        {/* ── Divider ── */}
        <div style={{ height: 1, background: '#DCE7EE', margin: '4px 14px' }} />

        {/* ── Bottom: settings + profile + wave ── */}
        <div className="mt-auto flex flex-col" style={{ position: 'relative', zIndex: 1 }}>
          {navBtn(
            activeView === 'settings',
            () => onViewChange('settings'),
            <FontAwesomeIcon
              icon={faCog}
              style={{
                fontSize: 19,
                color: activeView === 'settings' ? '#3F9B2F' : '#A8B4BF',
                flexShrink: 0,
                width: 22,
              }}
            />,
            'Settings',
          )}

          <button
            onClick={() => setShowProfile(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              padding: '9px 14px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
            }}
            title="My Profile"
          >
            <div
              className="flex items-center justify-center rounded-full"
              style={{
                width: 34,
                height: 34,
                background: '#7ED957',
                color: 'white',
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
                boxShadow: '0 2px 8px rgba(126,217,87,0.4)',
              }}
            >
              {initials}
            </div>
            <span style={{ fontSize: 14, fontWeight: 500, color: '#1E3347' }}>Profile</span>
          </button>

          {/* Decorative wave */}
          <svg
            viewBox="0 0 195 44"
            width="195"
            style={{ display: 'block', marginTop: 4 }}
            preserveAspectRatio="none"
          >
            <path
              d="M0,22 C35,4 70,40 105,22 C140,4 168,34 195,20 L195,44 L0,44 Z"
              fill="#D9EEFF"
            />
            <path
              d="M0,30 C28,14 62,44 98,30 C132,16 162,38 195,28 L195,44 L0,44 Z"
              fill="#BFE1FF"
              opacity="0.75"
            />
          </svg>
        </div>
      </div>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </>
  );
}
