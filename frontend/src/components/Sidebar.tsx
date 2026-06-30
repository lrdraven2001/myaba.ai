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
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { isClinicalRole, isAdminRole } from '../types';
import type { View } from '../App';

interface SidebarProps {
  activeView: View;
  onViewChange: (view: View) => void;
}

const navItems: { view: View; icon: typeof faCommentDots; label: string; color: string }[] = [
  { view: 'chat',      icon: faCommentDots,    label: 'Chat',      color: '#3F9B2F' },
  { view: 'projects',  icon: faProjectDiagram, label: 'Projects',  color: '#F5A623' },
  { view: 'clients',   icon: faUsers,          label: 'Clients',   color: '#7ED957' },
  { view: 'documents', icon: faFileAlt,        label: 'Resources', color: '#1E88FF' },
  { view: 'team',      icon: faUsersCog,       label: 'Team',      color: '#F5A623' },
];

export default function Sidebar({ activeView, onViewChange }: SidebarProps) {
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

  return (
    <>
      <div
        className="flex flex-col"
        style={{
          width: 195,
          /* Soft brand gradient (blue → green); dark nav text keeps AA contrast. */
          background: 'linear-gradient(180deg, #eaf3fb 0%, #e7f3eb 100%)',
          height: '100%',       /* fill the flex row exactly — no more, no less */
          flexShrink: 0,
          borderRight: '1px solid #DCE7EE',
          overflowY: 'auto',    /* sidebar itself scrolls if nav items ever overflow */
          overflowX: 'hidden',
          position: 'relative',
        }}
      >
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
              () => onViewChange(view),
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
              () => onViewChange('review'),
              <FontAwesomeIcon icon={faShieldAlt} style={{ fontSize: 19, color: reviewActive ? '#F5A623' : '#A8B4BF', flexShrink: 0, width: 22 }} />,
              'Review',
            );
          })()}

          {/* Admin-only nav items */}
          {isAdmin && (() => {
            const settingsActive = activeView === 'settings';
            return navBtn(
              settingsActive,
              () => onViewChange('settings'),
              <FontAwesomeIcon icon={faCog} style={{ fontSize: 19, color: settingsActive ? '#3F9B2F' : '#A8B4BF', flexShrink: 0, width: 22 }} />,
              'Settings',
            );
          })()}

        </div>
      </div>

    </>
  );
}
