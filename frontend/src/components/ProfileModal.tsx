import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faSignOutAlt, faUserCircle, faBuilding, faIdBadge } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../contexts/AuthContext';

const ROLE_LABELS: Record<string, string> = {
  CLINICAL_DIRECTOR: 'Clinical Director',
  TREATING_BCBA:     'Treating BCBA',
  SUPERVISING_BCBA:  'Supervising BCBA',
  BCBA_STUDENT:      'BCBA Student',
  RBT:               'Registered Behavior Technician',
  GENERAL_STAFF:     'General Staff',
  SCHEDULING_ADMIN:  'Scheduling Admin',
  BILLING_ADMIN:     'Billing Admin',
  ORG_ADMIN:         'Practice Administrator',
  ORG_SUPER_ADMIN:   'Clinical Director',
};

interface Props {
  onClose: () => void;
}

export default function ProfileModal({ onClose }: Props) {
  const { currentUser, logout } = useAuth();
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

      {/* Panel — anchored to bottom-left, above sidebar */}
      <div
        className="fixed z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 w-72 p-5"
        style={{ bottom: 72, left: 128 }}
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

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
        >
          <FontAwesomeIcon icon={faSignOutAlt} />
          Sign Out
        </button>
      </div>
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
