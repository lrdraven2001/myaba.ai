import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

/**
 * Click-through acceptance gate. After sign-in, a user who has not affirmatively
 * accepted the current published terms is blocked here until they do. Acceptance
 * (user + version + timestamp) is recorded server-side, so the click-through
 * agreement in the Terms is provable. Rendered by App before the main shell.
 */
export default function TermsGate({ onAccepted }: { onAccepted: () => void }) {
  const { logout } = useAuth();
  const [phase, setPhase]         = useState<'loading' | 'needed' | 'error'>('loading');
  const [version, setVersion]     = useState('');
  const [checked, setChecked]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => {
    let alive = true;
    api.getTermsStatus()
      .then((s) => {
        if (!alive) return;
        if (s.accepted) { onAccepted(); return; }
        setVersion(s.currentVersion);
        setPhase('needed');
      })
      .catch(() => { if (alive) setPhase('error'); });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const accept = async () => {
    setSubmitting(true);
    setError('');
    try {
      await api.acceptTerms(version);
      onAccepted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record acceptance. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (phase === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-gray-400 text-lg">Loading…</div>
      </div>
    );
  }

  const linkStyle = 'text-blue-600 underline';
  const L = (href: string, label: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkStyle}>{label}</a>
  );

  return (
    <div className="h-screen flex items-center justify-center p-4" style={{ background: '#F1F5F9' }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-7">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Before you continue</h1>
        <p className="text-sm text-gray-500 mb-5">
          Please review and accept our legal terms to use myABA.ai.
        </p>

        {phase === 'error' ? (
          <>
            <p className="text-sm text-red-600 mb-4">
              We couldn’t load the current terms. Please reload the page and try again.
            </p>
            <button onClick={() => window.location.reload()}
              className="w-full py-2.5 rounded-lg text-white text-sm font-semibold" style={{ background: '#1E88FF' }}>
              Reload
            </button>
          </>
        ) : (
          <>
            <label className="flex items-start gap-3 mb-4 cursor-pointer">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)}
                className="mt-1" style={{ accentColor: '#1E88FF' }} />
              <span className="text-sm text-gray-700 leading-relaxed">
                I have read and agree to the {L('https://myaba.ai/terms', 'Terms of Service')},{' '}
                {L('https://myaba.ai/privacy', 'Privacy Policy')}, and{' '}
                {L('https://myaba.ai/dpa', 'Data Processing Addendum')}.
              </span>
            </label>

            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

            <button
              onClick={accept}
              disabled={!checked || submitting}
              className="w-full py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-50"
              style={{ background: '#1E88FF' }}
            >
              {submitting ? 'Recording…' : 'I Agree & Continue'}
            </button>

            <button onClick={() => logout()}
              className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600">
              Sign out instead
            </button>
          </>
        )}
      </div>
    </div>
  );
}
