import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCommentDots,
  faFileAlt,
  faUsers,
  faUsersCog,
  faCog,
  faProjectDiagram,
  faShieldAlt,
  faTimes,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { isClinicalRole, isAdminRole } from '../types';
import type { View } from '../App';

interface SidebarProps {
  activeView: View;
  onViewChange: (view: View) => void;
  /** Mobile drawer: open state + close handler. Ignored on desktop (md+). */
  mobileOpen?: boolean;
  onClose?: () => void;
}

const navItems: { view: View; icon: typeof faCommentDots; label: string; color: string }[] = [
  { view: 'chat',      icon: faCommentDots,    label: 'Chat',      color: '#3F9B2F' },
  { view: 'projects',  icon: faProjectDiagram, label: 'Projects',  color: '#F5A623' },
  { view: 'clients',   icon: faUsers,          label: 'Clients',   color: '#7ED957' },
  { view: 'documents', icon: faFileAlt,        label: 'Resources', color: '#1E88FF' },
  { view: 'team',      icon: faUsersCog,       label: 'Team',      color: '#F5A623' },
];

export default function Sidebar({ activeView, onViewChange, mobileOpen = false, onClose }: SidebarProps) {
  const { currentUser } = useAuth();
  const [orgName, setOrgName] = useState('');

  const isAdmin    = isAdminRole(currentUser?.role ?? '');
  const isClinical = isClinicalRole(currentUser?.role ?? '');

  // Load org name
  useEffect(() => {
    if (!currentUser?.orgId) return;
    api.getOrg(currentUser.orgId)
      .then((o) => setOrgName(o.name ?? ''))
      .catch(() => {});
  }, [currentUser?.orgId]);

  // Live-update the org name when it's changed in Settings (no UI refresh needed).
  useEffect(() => {
    const onOrgUpdated = (e: Event) => {
      const name = (e as CustomEvent<{ name?: string }>).detail?.name;
      if (name) setOrgName(name);
    };
    window.addEventListener('org:updated', onOrgUpdated);
    return () => window.removeEventListener('org:updated', onOrgUpdated);
  }, []);

  const navBtn = (
    isActive: boolean,
    onClick: () => void,
    iconEl: React.ReactNode,
    label: string,
    extraStyle?: React.CSSProperties,
    keyId?: string,
  ) => (
    <button
      key={keyId}
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

  // Shared nav body (logo + items). onNavigate lets the mobile drawer also close.
  const navBody = (onNavigate: (view: View) => void) => (
    <>
      {/* ── Logo card — sticky so it never scrolls out of view ── */}
      <div style={{ padding: '14px 12px 12px', borderBottom: '1px solid #DCE7EE', position: 'sticky', top: 0, background: '#eaf3fb', zIndex: 10 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'white',
              borderRadius: 12,
              padding: '8px 10px',
              border: '1px solid #DCE7EE',
            }}
          >
            <img
              src="/app-icon.png"
              alt="myABA.ai"
              style={{ width: 50, height: 50, objectFit: 'contain', flexShrink: 0 }}
              onError={(e) => { (e.target as HTMLImageElement).src = '/favicon.svg'; }}
            />
            <div style={{ lineHeight: 1.2, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em' }}>
                <span style={{ color: '#1E3347' }}>my</span>
                <span style={{ color: '#1E88FF' }}>ABA</span>
                <span style={{ color: '#3F9B2F' }}>.ai</span>
              </div>
              <div style={{
                fontSize: 10,
                color: '#6B7B88',
                marginTop: 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 100,
              }}>
                {orgName || 'ABA Platform'}
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
              () => onNavigate(view),
              <FontAwesomeIcon
                icon={icon}
                style={{ fontSize: 19, color: isActive ? color : '#A8B4BF', flexShrink: 0, width: 22 }}
              />,
              label,
              undefined,
              view,
            );
          })}

          {/* Clinical + admin nav items */}
          {(isClinical || isAdmin) && (() => {
            const reviewActive = activeView === 'review';
            return navBtn(
              reviewActive,
              () => onNavigate('review'),
              <FontAwesomeIcon icon={faShieldAlt} style={{ fontSize: 19, color: reviewActive ? '#F5A623' : '#A8B4BF', flexShrink: 0, width: 22 }} />,
              'Review',
            );
          })()}

          {/* Admin-only nav items */}
          {isAdmin && (() => {
            const settingsActive = activeView === 'settings';
            return navBtn(
              settingsActive,
              () => onNavigate('settings'),
              <FontAwesomeIcon icon={faCog} style={{ fontSize: 19, color: settingsActive ? '#3F9B2F' : '#A8B4BF', flexShrink: 0, width: 22 }} />,
              'Settings',
            );
          })()}

        </div>
    </>
  );

  const panelVisual: React.CSSProperties = {
    width: 195,
    background: 'linear-gradient(180deg, #eaf3fb 0%, #e7f3eb 100%)',
    overflowY: 'auto',
    overflowX: 'hidden',
  };

  return (
    <>
      {/* Desktop: fixed left column (hidden below md) */}
      <div
        className="hidden md:flex flex-col"
        style={{ ...panelVisual, height: '100%', flexShrink: 0, borderRight: '1px solid #DCE7EE', position: 'relative' }}
      >
        {navBody(onViewChange)}
      </div>

      {/* Mobile: slide-over drawer + backdrop (below md only) */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0" style={{ zIndex: 60 }}>
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <div
            className="absolute left-0 top-0 bottom-0 flex flex-col"
            style={{ ...panelVisual, borderRight: '1px solid #DCE7EE' }}
          >
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="absolute top-3 right-2 z-20 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-white/60"
            >
              <FontAwesomeIcon icon={faTimes} className="text-sm" />
            </button>
            {navBody((v) => { onViewChange(v); onClose?.(); })}
          </div>
        </div>
      )}
    </>
  );
}
