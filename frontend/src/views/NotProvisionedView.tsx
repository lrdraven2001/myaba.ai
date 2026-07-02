import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShieldAlt } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../contexts/AuthContext';

/**
 * Shown when a signed-in user has no org AND is not on the Pathfinder
 * allowlist. Org creation is invitation-only; unapproved users land here
 * instead of the create-org onboarding flow.
 */
export default function NotProvisionedView() {
  const { currentUser, logout } = useAuth();

  return (
    <div className="h-screen overflow-y-auto bg-gray-50">
     <div className="min-h-full flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <div
          className="mx-auto mb-5 flex items-center justify-center rounded-full"
          style={{ width: 56, height: 56, background: '#e8f0f2' }}
        >
          <FontAwesomeIcon icon={faShieldAlt} style={{ color: '#2a5f6f', fontSize: 24 }} />
        </div>

        <h1 className="text-xl font-semibold text-gray-900">Account not yet provisioned</h1>

        <p className="mt-3 text-sm text-gray-600 leading-relaxed">
          Your sign-in succeeded, but{' '}
          <span className="font-medium text-gray-800">{currentUser?.email ?? 'this account'}</span>{' '}
          isn’t approved to create an organization. MyABA access is granted through the
          Pathfinder program.
        </p>

        <p className="mt-3 text-sm text-gray-600 leading-relaxed">
          If your practice already uses MyABA, ask your administrator to send you an{' '}
          <span className="font-medium text-gray-800">invitation</span>. Otherwise, contact{' '}
          <a href="mailto:hello@myaba.ai" className="font-medium" style={{ color: '#2a5f6f' }}>
            hello@myaba.ai
          </a>{' '}
          to get started.
        </p>

        <button
          onClick={() => { void logout(); }}
          className="mt-6 w-full px-4 py-2.5 rounded-lg text-sm font-medium text-white"
          style={{ background: '#2a5f6f' }}
        >
          Sign out
        </button>
      </div>
     </div>
    </div>
  );
}
