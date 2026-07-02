import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBuilding,
  faChartBar,
  faCog,
  faHeartbeat,
  faSignOutAlt,
  faUserPlus,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../contexts/AuthContext';
import type { View } from '../App';

interface SidebarProps {
  activeView: View;
  onViewChange: (v: View) => void;
}

const NAV: { view: View; icon: typeof faBuilding; label: string; color: string }[] = [
  { view: 'creators', icon: faUserPlus,  label: 'Org Invitations', color: '#A78BFA' },
  { view: 'tenants',  icon: faBuilding,  label: 'Tenants',         color: '#60A5FA' },
  { view: 'usage',    icon: faChartBar,  label: 'Usage',           color: '#4ADE80' },
  { view: 'config',   icon: faCog,       label: 'Config',          color: '#FBBF24' },
  { view: 'health',   icon: faHeartbeat, label: 'Health',          color: '#F87171' },
];

export default function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const { currentUser, logout } = useAuth();

  const initials = currentUser?.displayName
    ? currentUser.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  return (
    <div style={{
      width: 220,
      flexShrink: 0,
      background: '#0F172A',
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid #1E293B',
    }}>

      {/* Logo */}
      <div style={{ padding: '16px 14px', borderBottom: '1px solid #1E293B' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src="/app-icon.png"
            alt="myABA.ai"
            style={{ width: 38, height: 38, objectFit: 'contain', flexShrink: 0 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div style={{ lineHeight: 1.25 }}>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em' }}>
              <span style={{ color: '#CBD5E1' }}>my</span>
              <span style={{ color: '#60A5FA' }}>ABA</span>
              <span style={{ color: '#4ADE80' }}>.ai</span>
            </div>
            <div style={{ fontSize: 10, color: '#475569', letterSpacing: '0.07em', textTransform: 'uppercase', marginTop: 1 }}>
              Platform Admin
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 0' }}>
        {NAV.map(({ view, icon, label, color }) => {
          const active = activeView === view;
          return (
            <button
              key={view}
              onClick={() => onViewChange(view)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                padding: '10px 16px',
                background: active ? '#1E293B' : 'transparent',
                border: 'none',
                borderLeft: `3px solid ${active ? color : 'transparent'}`,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#1E293B80'; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <FontAwesomeIcon
                icon={icon}
                style={{ fontSize: 15, color: active ? color : '#475569', width: 18, flexShrink: 0 }}
              />
              <span style={{
                fontSize: 14,
                fontWeight: active ? 600 : 400,
                color: active ? '#E2E8F0' : '#64748B',
              }}>
                {label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Footer: user + logout */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #1E293B' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: '#1565C0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: 'white', flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#E2E8F0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentUser?.displayName}
            </div>
            <div style={{ fontSize: 11, color: '#475569' }}>Platform Operator</div>
          </div>
        </div>
        <button
          onClick={logout}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', padding: '7px 10px',
            background: 'transparent',
            border: '1px solid #1E293B',
            borderRadius: 8,
            cursor: 'pointer',
            color: '#64748B',
            fontSize: 13,
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#334155'; e.currentTarget.style.color = '#94A3B8'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1E293B'; e.currentTarget.style.color = '#64748B'; }}
        >
          <FontAwesomeIcon icon={faSignOutAlt} style={{ fontSize: 13 }} />
          Sign out
        </button>
      </div>
    </div>
  );
}
