import { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTimes, faUser, faEnvelope, faKey, faShieldHalved, faMobileScreen,
  faCheck, faTrash, faSpinner, faFingerprint, faCircleInfo, faPlus,
} from '@fortawesome/free-solid-svg-icons';
import { faGoogle } from '@fortawesome/free-brands-svg-icons';
import { useAuth } from '../contexts/AuthContext';
import { startTotpEnrollment, completeTotpEnrollment } from '../lib/mfa';
import { api } from '../lib/api';

interface Factor { uid: string; displayName?: string | null; factorId: string }

export default function AccountSettingsModal({ onClose }: { onClose: () => void }) {
  const { firebaseUser, refreshUser } = useAuth();
  const [err, setErr]   = useState('');
  const [ok, setOk]     = useState('');
  const flash = (m: string, isErr = false) => { if (isErr) { setErr(m); setOk(''); } else { setOk(m); setErr(''); } };

  // Reauth overlay (for sensitive ops on password accounts)
  const [reauthFor, setReauthFor] = useState<null | (() => Promise<void>)>(null);
  const [reauthPw, setReauthPw]   = useState('');

  const providers = (firebaseUser?.providerData ?? []).map((p) => p.providerId);
  const hasGoogle = providers.includes('google.com');
  const hasPassword = providers.includes('password');

  /** Run a sensitive op; on requires-recent-login, reauth (Google popup or password prompt) then retry. */
  const runSensitive = useCallback(async (fn: () => Promise<void>) => {
    if (!firebaseUser) return;
    try { await fn(); }
    catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === 'auth/requires-recent-login') {
        if (hasGoogle) {
          const { GoogleAuthProvider, reauthenticateWithPopup } = await import('firebase/auth');
          await reauthenticateWithPopup(firebaseUser, new GoogleAuthProvider());
          await fn();
        } else {
          setReauthFor(() => fn);   // show password reauth overlay, retry after
        }
      } else { throw e; }
    }
  }, [firebaseUser, hasGoogle]);

  const submitReauth = async () => {
    if (!firebaseUser || !firebaseUser.email) return;
    try {
      const { EmailAuthProvider, reauthenticateWithCredential } = await import('firebase/auth');
      await reauthenticateWithCredential(firebaseUser, EmailAuthProvider.credential(firebaseUser.email, reauthPw));
      const retry = reauthFor;
      setReauthFor(null); setReauthPw('');
      if (retry) await retry();
      flash('Done.');
    } catch { flash('Re-authentication failed — check your password.', true); }
  };

  if (!firebaseUser) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Account &amp; Security</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><FontAwesomeIcon icon={faTimes} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
          {(ok || err) && (
            <div className="text-sm px-3 py-2 rounded-lg" style={ok ? { background: '#EEF7EA', color: '#2E7D22' } : { background: '#FEECEC', color: '#B91C1C' }}>
              {ok || err}
            </div>
          )}

          <ProfileSection firebaseUser={firebaseUser} refreshUser={refreshUser} flash={flash} runSensitive={runSensitive} />
          <SignInSection
            firebaseUser={firebaseUser} hasGoogle={hasGoogle} hasPassword={hasPassword}
            flash={flash} refreshUser={refreshUser} runSensitive={runSensitive}
          />
          <MfaSection firebaseUser={firebaseUser} flash={flash} refreshUser={refreshUser} runSensitive={runSensitive} />
          <PasskeySection />
        </div>

        {reauthFor && (
          <div className="border-t border-gray-100 px-6 py-4 bg-amber-50">
            <p className="text-sm text-amber-800 mb-2">For your security, re-enter your password to continue.</p>
            <div className="flex gap-2">
              <input type="password" value={reauthPw} onChange={(e) => setReauthPw(e.target.value)} placeholder="Password"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" autoFocus />
              <button onClick={submitReauth} className="px-4 py-2 rounded-lg text-white text-sm font-semibold" style={{ background: '#2a5f6f' }}>Confirm</button>
              <button onClick={() => { setReauthFor(null); setReauthPw(''); }} className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-500">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section: Profile ──────────────────────────────────────────────────────────

function ProfileSection({ firebaseUser, refreshUser, flash, runSensitive }: any) {
  const [name, setName]       = useState(firebaseUser.displayName ?? '');
  const [savingName, setSN]   = useState(false);
  const [editEmail, setEE]    = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [busyEmail, setBE]    = useState(false);

  const saveName = async () => {
    if (!name.trim()) return;
    setSN(true);
    try {
      const { updateProfile } = await import('firebase/auth');
      await updateProfile(firebaseUser, { displayName: name.trim() });
      await api.updateMyProfile({ displayName: name.trim() }).catch(() => {});
      await refreshUser();
      flash('Display name updated.');
    } catch (e: any) { flash(e?.message ?? 'Could not update name.', true); }
    finally { setSN(false); }
  };

  const changeEmail = async () => {
    if (!newEmail.trim()) return;
    setBE(true);
    try {
      await runSensitive(async () => {
        const { verifyBeforeUpdateEmail } = await import('firebase/auth');
        await verifyBeforeUpdateEmail(firebaseUser, newEmail.trim());
      });
      flash(`Verification sent to ${newEmail.trim()}. Click the link in that email to finish the change.`);
      setEE(false); setNewEmail('');
    } catch (e: any) { flash(e?.message ?? 'Could not change email.', true); }
    finally { setBE(false); }
  };

  return (
    <Section icon={faUser} title="Profile">
      <Field label="Display Name">
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inp} />
          <button onClick={saveName} disabled={savingName || !name.trim()} className="px-4 rounded-lg text-white text-sm font-semibold shrink-0" style={{ background: '#1E88FF' }}>
            {savingName ? <FontAwesomeIcon icon={faSpinner} className="animate-spin" /> : 'Save'}
          </button>
        </div>
      </Field>
      <Field label="Email (login ID)">
        {!editEmail ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">{firebaseUser.email}</span>
            <button onClick={() => setEE(true)} className="text-sm font-semibold" style={{ color: '#1E88FF' }}>Change</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new@email.com" className={inp} autoFocus />
            <button onClick={changeEmail} disabled={busyEmail} className="px-4 rounded-lg text-white text-sm font-semibold shrink-0" style={{ background: '#1E88FF' }}>
              {busyEmail ? '…' : 'Verify'}
            </button>
            <button onClick={() => { setEE(false); setNewEmail(''); }} className="px-3 rounded-lg border border-gray-200 text-sm text-gray-500">Cancel</button>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-1">Changing your email sends a verification link; it becomes your login ID once confirmed.</p>
      </Field>
    </Section>
  );
}

// ── Section: Sign-in methods ───────────────────────────────────────────────────

function SignInSection({ firebaseUser, hasGoogle, hasPassword, flash, refreshUser, runSensitive }: any) {
  const linkGoogle = async () => {
    try {
      const { GoogleAuthProvider, linkWithPopup } = await import('firebase/auth');
      await linkWithPopup(firebaseUser, new GoogleAuthProvider());
      await refreshUser();
      flash('Google account linked.');
    } catch (e: any) {
      flash(e?.code === 'auth/credential-already-in-use' ? 'That Google account is already linked to another user.' : (e?.message ?? 'Could not link Google.'), true);
    }
  };
  const unlinkGoogle = async () => {
    try {
      await runSensitive(async () => { const { unlink } = await import('firebase/auth'); await unlink(firebaseUser, 'google.com'); });
      await refreshUser();
      flash('Google account unlinked.');
    } catch (e: any) { flash(e?.message ?? 'Could not unlink.', true); }
  };
  const resetPassword = async () => {
    try {
      const { auth } = await import('../lib/firebase');
      const { sendPasswordResetEmail } = await import('firebase/auth');
      await sendPasswordResetEmail(auth, firebaseUser.email);
      flash(`Password reset link sent to ${firebaseUser.email}.`);
    } catch (e: any) { flash(e?.message ?? 'Could not send reset email.', true); }
  };

  return (
    <Section icon={faKey} title="Sign-in methods">
      {/* Google */}
      <Row icon={faGoogle} iconColor="#DB4437" label="Google" sub={hasGoogle ? 'Connected' : 'Sign in with your Google account'}>
        {hasGoogle
          ? <button onClick={unlinkGoogle} className="text-sm font-semibold text-red-500">Unlink</button>
          : <button onClick={linkGoogle} className="px-3 py-1.5 rounded-lg text-white text-sm font-semibold" style={{ background: '#1E88FF' }}>Link</button>}
      </Row>
      {/* Password */}
      {hasPassword && (
        <Row icon={faEnvelope} iconColor="#6B7B88" label="Email &amp; password" sub="Sign in with your email and password">
          <button onClick={resetPassword} className="text-sm font-semibold" style={{ color: '#1E88FF' }}>Reset password</button>
        </Row>
      )}
    </Section>
  );
}

// ── Section: Two-factor auth ───────────────────────────────────────────────────

function MfaSection({ firebaseUser, flash, refreshUser, runSensitive }: any) {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [totp, setTotp]       = useState<null | { key: string; qr: string; secret: any }>(null);
  const [code, setCode]       = useState('');
  const [busy, setBusy]       = useState(false);

  const loadFactors = useCallback(async () => {
    const { multiFactor } = await import('firebase/auth');
    setFactors(multiFactor(firebaseUser).enrolledFactors as Factor[]);
  }, [firebaseUser]);
  useEffect(() => { loadFactors(); }, [loadFactors]);

  const startTotp = async () => {
    setBusy(true);
    try {
      await runSensitive(async () => {
        const { secret, qrDataUrl, manualKey } = await startTotpEnrollment(firebaseUser);
        setTotp({ key: manualKey, qr: qrDataUrl, secret });
      });
    } catch (e: any) { flash(e?.message ?? 'Could not start 2FA setup. (Authenticator 2FA needs real Firebase / Identity Platform — limited in the local emulator.)', true); }
    finally { setBusy(false); }
  };

  const finishTotp = async () => {
    if (!totp || !code.trim()) return;
    setBusy(true);
    try {
      await completeTotpEnrollment(firebaseUser, totp.secret, code.trim(), 'Authenticator app');
      setTotp(null); setCode('');
      await refreshUser(); await loadFactors();
      flash('Authenticator app added. You\'ll be asked for a code at sign-in.');
    } catch (e: any) { flash(e?.message ?? 'That code didn\'t match — try the current one.', true); }
    finally { setBusy(false); }
  };

  const removeFactor = async (f: Factor) => {
    try {
      await runSensitive(async () => { const { multiFactor } = await import('firebase/auth'); await multiFactor(firebaseUser).unenroll(f); });
      await loadFactors();
      flash('Two-factor method removed.');
    } catch (e: any) { flash(e?.message ?? 'Could not remove.', true); }
  };

  return (
    <Section icon={faShieldHalved} title="Two-factor authentication">
      <p className="text-xs text-gray-400 -mt-1 mb-1">Add a second step at sign-in. Re-add your authenticator any time you switch phones.</p>
      {factors.length > 0 && factors.map((f) => (
        <Row key={f.uid} icon={f.factorId === 'phone' ? faMobileScreen : faShieldHalved} iconColor="#3F9B2F"
             label={f.displayName || (f.factorId === 'phone' ? 'Phone (SMS)' : 'Authenticator app')} sub="Enrolled">
          <button onClick={() => removeFactor(f)} className="text-red-400 hover:text-red-600" title="Remove"><FontAwesomeIcon icon={faTrash} style={{ fontSize: 13 }} /></button>
        </Row>
      ))}

      {!totp ? (
        <button onClick={startTotp} disabled={busy} className="flex items-center gap-2 text-sm font-semibold mt-1" style={{ color: '#1E88FF' }}>
          <FontAwesomeIcon icon={faPlus} style={{ fontSize: 11 }} /> {busy ? 'Preparing…' : 'Add authenticator app'}
        </button>
      ) : (
        <div className="mt-2 rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-700 mb-2">Scan this with Google Authenticator, Authy, or 1Password — then enter the 6-digit code.</p>
          <div className="flex gap-4 items-start">
            <img src={totp.qr} alt="2FA QR" style={{ width: 132, height: 132 }} />
            <div className="flex-1">
              <p className="text-xs text-gray-400 mb-1">Or enter this key manually:</p>
              <code className="text-xs break-all bg-gray-50 px-2 py-1 rounded block mb-3">{totp.key}</code>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" maxLength={6}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm tracking-widest text-center mb-2" />
              <div className="flex gap-2">
                <button onClick={finishTotp} disabled={busy || code.length < 6} className="flex-1 py-2 rounded-lg text-white text-sm font-semibold" style={{ background: '#1E88FF' }}>
                  {busy ? 'Verifying…' : 'Verify & enable'}
                </button>
                <button onClick={() => { setTotp(null); setCode(''); }} className="px-3 rounded-lg border border-gray-200 text-sm text-gray-500">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

// ── Section: Passkeys (scaffold) ───────────────────────────────────────────────

function PasskeySection() {
  const supported = typeof window !== 'undefined' && !!(window as any).PublicKeyCredential;
  return (
    <Section icon={faFingerprint} title="Passkeys">
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex gap-3">
        <FontAwesomeIcon icon={faCircleInfo} style={{ color: '#1E88FF', fontSize: 15, marginTop: 2 }} />
        <div className="text-sm text-gray-600 leading-relaxed">
          <p className="font-semibold text-gray-700 mb-1">Passkey-ready</p>
          Sign in with Face ID, a fingerprint, or your device PIN — no password. Your device {supported ? 'supports passkeys' : 'will support passkeys once available'}.
          Passkey sign-in lights up when it&apos;s enabled for this project in Firebase / Google Identity Platform (it isn&apos;t a drop-in provider in the SDK yet, and the local auth emulator doesn&apos;t support it).
          <button disabled className="mt-2 block px-3 py-1.5 rounded-lg text-sm font-semibold text-gray-400 border border-gray-200 cursor-not-allowed">
            <FontAwesomeIcon icon={faFingerprint} style={{ fontSize: 11 }} /> Add a passkey (coming soon)
          </button>
        </div>
      </div>
    </Section>
  );
}

// ── Small layout helpers ───────────────────────────────────────────────────────

function Section({ icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <FontAwesomeIcon icon={icon} style={{ color: '#2a5f6f', fontSize: 14 }} />
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>{children}</div>;
}
function Row({ icon, iconColor, label, sub, children }: any) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-150 px-4 py-3" style={{ borderColor: '#EEF2F6' }}>
      <FontAwesomeIcon icon={icon} style={{ color: iconColor, fontSize: 16, width: 20 }} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-800" dangerouslySetInnerHTML={{ __html: label }} />
        <div className="text-xs text-gray-400">{sub}</div>
      </div>
      {children}
    </div>
  );
}
const inp = 'flex-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200';
