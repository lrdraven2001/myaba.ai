import { useEffect, useState } from 'react';
import type { TotpSecret } from 'firebase/auth';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShieldHalved } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../contexts/AuthContext';
import { startTotpEnrollment, completeTotpEnrollment } from '../lib/mfa';

/**
 * Forced TOTP enrollment. Shown when the user's org requires MFA (`mfaEnforced`)
 * but the signed-in user has not yet enrolled a second factor. Blocks the app
 * until they enroll an authenticator. Mirrors the enrollment flow already used
 * in InviteAcceptView / AccountSettingsModal.
 */
export default function MfaEnrollmentGate() {
  const { firebaseUser, logout } = useAuth();
  const [secret, setSecret]       = useState<TotpSecret | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [code, setCode]           = useState('');
  const [error, setError]         = useState('');
  const [genError, setGenError]   = useState('');
  const [busy, setBusy]           = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!firebaseUser) return;
      try {
        const { secret: s, qrDataUrl: dataUrl, manualKey: key } = await startTotpEnrollment(firebaseUser);
        if (!cancelled) { setSecret(s); setQrDataUrl(dataUrl); setManualKey(key); }
      } catch {
        if (!cancelled) setGenError('Could not start enrollment. Confirm MFA is enabled for the project, then reload.');
      }
    })();
    return () => { cancelled = true; };
  }, [firebaseUser]);

  const enroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret || !firebaseUser) return;
    setError('');
    if (code.length !== 6) { setError('Enter the 6-digit code from your authenticator.'); return; }
    setBusy(true);
    try {
      await completeTotpEnrollment(firebaseUser, secret, code);
      window.location.reload(); // re-check the gate with the new factor in place
    } catch {
      setError('Invalid code. Wait for the next code and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xs border border-gray-100 p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex items-center justify-center rounded-full" style={{ width: 52, height: 52, background: '#e8f0f2' }}>
            <FontAwesomeIcon icon={faShieldHalved} style={{ color: '#2a5f6f', fontSize: 22 }} />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Set up two-step verification</h1>
          <p className="mt-2 text-sm text-gray-600 leading-relaxed">
            Your organization requires multi-factor authentication. Scan the QR code with an
            authenticator app (Google Authenticator, Authy, 1Password…), then enter the 6-digit code.
          </p>
        </div>

        {genError ? (
          <div className="mt-5 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{genError}</div>
        ) : (
          <>
            <div className="mt-5 flex flex-col items-center">
              {qrDataUrl
                ? <img src={qrDataUrl} alt="Authenticator QR code" width={180} height={180} className="rounded-lg border border-gray-200" />
                : <div className="w-[180px] h-[180px] rounded-lg bg-gray-100 animate-pulse" />}
              {manualKey && (
                <p className="mt-3 text-xs text-gray-500 text-center">
                  Can’t scan? Enter this key manually:<br />
                  <span className="font-mono text-gray-700 break-all">{manualKey}</span>
                </p>
              )}
            </div>

            <form onSubmit={enroll} className="mt-5">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric" autoFocus placeholder="000000" aria-label="Authenticator code"
                className="w-full text-center tracking-[0.3em] text-xl font-bold py-2.5 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-600"
              />
              {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
              <button
                type="submit" disabled={busy || !secret}
                className="mt-4 w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: '#2a5f6f' }}
              >
                {busy ? 'Verifying…' : 'Verify & Continue'}
              </button>
            </form>
          </>
        )}

        <button onClick={() => { void logout(); }} className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700">
          Sign out
        </button>
      </div>
    </div>
  );
}
