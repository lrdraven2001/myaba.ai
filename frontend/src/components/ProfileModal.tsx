import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faSignOutAlt, faUserCircle, faBuilding, faIdBadge, faUserGear } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../contexts/AuthContext';
import AccountSettingsModal from './AccountSettingsModal';

const ROLE_LABELS: Record<string, string> = {
  CLINICAL_DIRECTOR: 'Clinical Director',
  TREATING_BCBA:     'Treating BCBA',
  SUPERVISING_BCBA:  'Clinical Supervisor',
  BCBA_STUDENT:      'BCBA Student',
  RBT:               'Behavior Technician',
  GENERAL_STAFF:     'General Staff',
  SCHEDULING_ADMIN:  'Scheduling Admin',
  BILLING_ADMIN:     'Billing Admin',
  ORG_ADMIN:         'Practice Administrator',
  ORG_SUPER_ADMIN:   'Practice Administrator',
};

interface Props {
  onClose: () => void;
}

export default function ProfileModal({ onClose }: Props) {
  const { currentUser, logout } = useAuth();
  const [showAccount, setShowAccount] = useState(false);
  if (!currentUser) return null;

  const initials = currentUser.displayName
    ? currentUser.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : currentUser.email.slice(0, 2).toUpperCase();

  const handleSignOut = async () => {
    await logout();
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel — anchored to top-right, below the profile menu */}
      <div
        className="fixed z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 w-72 p-5"
        style={{ top: 60, right: 20 }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
        >
          <FontAwesomeIcon icon={faTimes} />
        </button>

        {/* Avatar + name */}
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl shrink-0"
            style={{ background: '#2a5f6f', color: 'white' }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">
              {currentUser.displayName ?? 'My Profile'}
            </p>
            <p className="text-xs text-gray-500 truncate">{currentUser.email}</p>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-2 mb-5">
          <InfoRow icon={faIdBadge} label="Role" value={ROLE_LABELS[currentUser.role] ?? currentUser.role} />
          <InfoRow icon={faBuilding} label="Org" value={currentUser.orgId || '—'} />
          {currentUser.supervisorId && (
            <InfoRow icon={faUserCircle} label="Supervisor" value={currentUser.supervisorId} />
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-gray-100 mb-4" />

        {/* Account & Security */}
        <button
          onClick={() => setShowAccount(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 mb-2 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          <FontAwesomeIcon icon={faUserGear} />
          Account &amp; Security
        </button>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
        >
          <FontAwesomeIcon icon={faSignOutAlt} />
          Sign Out
        </button>
      </div>
      {showAccount && <AccountSettingsModal onClose={() => setShowAccount(false)} />}
    </>
  );
}

function InfoRow({ icon, label, value }: { icon: typeof faIdBadge; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <FontAwesomeIcon icon={icon} className="text-gray-400 mt-0.5 w-3.5 shrink-0" />
      <div className="min-w-0">
        <span className="text-xs text-gray-400">{label}: </span>
        <span className="text-xs font-medium text-gray-700 break-all">{value}</span>
      </div>
    </div>
  );
}
