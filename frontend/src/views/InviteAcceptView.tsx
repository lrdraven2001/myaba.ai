import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUser, faEnvelope, faLock, faShieldAlt, faEye, faEyeSlash,
  faCheck, faMobileAlt, faFileContract, faCheckCircle,
} from '@fortawesome/free-solid-svg-icons';
import {
  createUserWithEmailAndPassword,
  updateProfile,
  multiFactor,
  type TotpSecret,
  type User,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { api } from '../lib/api';
import { startTotpEnrollment, completeTotpEnrollment } from '../lib/mfa';

// Firebase emulator does not support TOTP MFA — skip that step in dev
const IS_EMULATOR = !!import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL;

type Step = 'account' | 'twoFactor' | 'agreements';

interface Props {
  token: string;
  invitePreview: { orgName: string; role: string; mfaEnforced?: boolean } | null;
}

function StepIndicator({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'account',    label: 'Account' },
    { key: 'twoFactor',  label: '2FA' },
    { key: 'agreements', label: 'Agreements' },
  ];
  const visibleSteps = IS_EMULATOR
    ? steps.filter((s) => s.key !== 'twoFactor')
    : steps;

  const currentIdx = visibleSteps.findIndex((s) => s.key === step);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
      {visibleSteps.map((s, i) => {
        const done   = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? '#3F9B2F' : active ? '#1E88FF' : '#E4EEF3',
                color: done || active ? 'white' : '#A8B4BF',
                fontSize: 13, fontWeight: 700, transition: 'all 0.2s',
              }}>
                {done ? <FontAwesomeIcon icon={faCheck} style={{ fontSize: 12 }} /> : i + 1}
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: active ? '#1E88FF' : done ? '#3F9B2F' : '#A8B4BF', letterSpacing: '0.03em' }}>
                {s.label}
              </span>
            </div>
            {i < visibleSteps.length - 1 && (
              <div style={{ width: 48, height: 1, background: done ? '#3F9B2F' : '#E4EEF3', margin: '0 8px', marginBottom: 20 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function InviteAcceptView({ token, invitePreview }: Props) {
  const [step, setStep] = useState<Step>('account');

  // Step 1 — account
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [confirmPw, setConfirmPw]     = useState('');
  const [showPw, setShowPw]           = useState(false);

  // Step 2 — 2FA
  const [totpSecret, setTotpSecret]   = useState<TotpSecret | null>(null);
  const [qrDataUrl, setQrDataUrl]     = useState('');
  const [manualKey, setManualKey]     = useState('');
  const [otpCode, setOtpCode]         = useState('');

  // Step 3 — agreements (ToS only; BAA was already signed by the org admin)
  const [tosChecked, setTosChecked]   = useState(false);

  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  // Start TOTP enrollment (secret + QR) and advance to the 2FA step. If TOTP MFA
  // isn't enabled on the Firebase project, enrollment can't start — rather than
  // dead-end the invitee with a blank QR, skip 2FA so they can finish setup.
  // (Org MFA enforcement still applies at login once TOTP is enabled.)
  const beginTwoFactor = async (user: User) => {
    try {
      const enroll = await startTotpEnrollment(user, user.email ?? email ?? undefined);
      setTotpSecret(enroll.secret);
      setQrDataUrl(enroll.qrDataUrl);
      setManualKey(enroll.manualKey);
      setStep('twoFactor');
    } catch {
      setStep('agreements');
    }
  };

  // If user is already authenticated (e.g. returning to an in-progress invite),
  // skip straight to the appropriate step.
  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;
    // Only force 2FA when the org actually requires it (the MFA switch controls this).
    if (IS_EMULATOR || !invitePreview?.mfaEnforced || multiFactor(u).enrolledFactors.length > 0) {
      setStep('agreements');
    } else {
      // Re-generate the QR (it was never persisted across a reload); if TOTP is
      // unavailable this skips 2FA rather than stranding them on a blank screen.
      void beginTwoFactor(u);
    }
  }, []);

  // ── Step 1: Create account ──────────────────────────────────────────────────

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!displayName.trim()) { setError('Full name is required.'); return; }
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPw) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(user, { displayName: displayName.trim() });

      if (IS_EMULATOR || !invitePreview?.mfaEnforced) {
        setStep('agreements'); // org doesn't require MFA → skip 2FA enrollment
      } else {
        await beginTwoFactor(user);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('email-already-in-use')) {
        setError('An account with this email already exists. Contact your administrator.');
      } else {
        setError('Account creation failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Verify TOTP ─────────────────────────────────────────────────────

  const handleVerifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpSecret || !auth.currentUser) return;
    setError('');
    if (otpCode.length !== 6) { setError('Enter the 6-digit code from your authenticator.'); return; }
    setLoading(true);
    try {
      await completeTotpEnrollment(auth.currentUser, totpSecret, otpCode);
      setStep('agreements');
    } catch {
      setError('Invalid code. Please wait for the next code and try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Accept agreements + claim invite ───────────────────────────────

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tosChecked) { setError('You must accept the Terms of Service to continue.'); return; }
    setError('');
    setLoading(true);
    try {
      await api.claimInvite(token);
      // Force-refresh the Firebase ID token so the new orgId/role claims are
      // included before the reload — otherwise the cached token has no orgId
      // and OnboardingView shows instead of the main app.
      await auth.currentUser?.getIdToken(true);
      sessionStorage.removeItem('pendingInviteToken');
      window.location.reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to join organization. Please contact support.');
    } finally {
      setLoading(false);
    }
  };

  // ── Shared card shell ───────────────────────────────────────────────────────

  const roleLabel = invitePreview?.role?.replace(/_/g, ' ') ?? '';

  return (
    <div style={{ height: '100vh', overflowY: 'auto', background: '#F0F7FA' }}>
    <div style={{
      minHeight: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px 16px', boxSizing: 'border-box',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16, background: 'white',
          boxShadow: '0 4px 14px rgba(0,0,0,0.10)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', marginBottom: 12, overflow: 'hidden',
        }}>
          <img src="/app-icon.png" alt="myABA.ai" style={{ width: 52, height: 52, objectFit: 'contain' }} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
          <span style={{ color: '#1E3347' }}>my</span>
          <span style={{ color: '#1E88FF' }}>ABA</span>
          <span style={{ color: '#3F9B2F' }}>.ai</span>
        </div>
      </div>

      <div style={{
        width: '100%', maxWidth: 460, background: 'white', borderRadius: 20,
        boxShadow: '0 4px 24px rgba(0,0,0,0.09)', padding: '32px 32px 28px',
        border: '1px solid #E4EEF3',
      }}>
        {/* Invite banner */}
        {invitePreview && (
          <div style={{
            background: '#EEF7EA', border: '1px solid #B9DEB0', borderRadius: 10,
            padding: '10px 14px', marginBottom: 20, fontSize: 12.5, color: '#2E6B20', lineHeight: 1.5,
          }}>
            You've been invited to join <strong>{invitePreview.orgName}</strong>
            {roleLabel && <> as a <strong style={{ textTransform: 'capitalize' }}>{roleLabel.toLowerCase()}</strong></>}.
          </div>
        )}

        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E3347', marginBottom: 4 }}>
          {step === 'account'    ? 'Create your account'
          : step === 'twoFactor' ? 'Set up two-factor authentication'
          :                        'Review & accept agreements'}
        </h2>
        <p style={{ fontSize: 12.5, color: '#6B7B88', marginBottom: 20, lineHeight: 1.4 }}>
          {step === 'account'    ? 'Choose a password and confirm your details.'
          : step === 'twoFactor' ? '2FA is required for all myABA.ai accounts.'
          :                        'Required before accessing clinical data.'}
        </p>

        <StepIndicator step={step} />

        {/* ── Step 1 ── */}
        {step === 'account' && (
          <form onSubmit={handleCreateAccount} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Full Name" icon={faUser}>
              <input
                type="text" required value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jane Smith"
                style={inputStyle}
                onFocus={onFocus} onBlur={onBlur}
              />
            </Field>

            <Field label="Email Address" icon={faEnvelope}>
              <input
                type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@yourorg.com"
                style={inputStyle}
                onFocus={onFocus} onBlur={onBlur}
              />
            </Field>

            <Field label="Password" icon={faLock} suffix={
              <button type="button" onClick={() => setShowPw(!showPw)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A8B4BF', padding: '0 12px' }}>
                <FontAwesomeIcon icon={showPw ? faEyeSlash : faEye} />
              </button>
            }>
              <input
                type={showPw ? 'text' : 'password'} required value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                style={{ ...inputStyle, paddingRight: 40 }}
                onFocus={onFocus} onBlur={onBlur}
              />
            </Field>

            <Field label="Confirm Password" icon={faLock}>
              <input
                type={showPw ? 'text' : 'password'} required value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Re-enter password"
                style={inputStyle}
                onFocus={onFocus} onBlur={onBlur}
              />
            </Field>

            {error && <p style={{ fontSize: 12, color: '#DC2626', marginTop: -4 }}>{error}</p>}

            <button type="submit" disabled={loading} style={btnStyle(loading)}>
              {loading ? 'Creating account…' : 'Continue →'}
            </button>
          </form>
        )}

        {/* ── Step 2 ── */}
        {step === 'twoFactor' && (
          <form onSubmit={handleVerifyTotp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 4 }}>
              <FontAwesomeIcon icon={faMobileAlt} style={{ color: '#1E88FF', fontSize: 22, marginTop: 2 }} />
              <p style={{ fontSize: 12.5, color: '#3A5270', lineHeight: 1.55, margin: 0 }}>
                Open <strong>Google Authenticator</strong>, <strong>Authy</strong>, or any TOTP app
                and scan the QR code below.
              </p>
            </div>

            {qrDataUrl && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <img src={qrDataUrl} alt="TOTP QR Code" style={{ width: 180, height: 180, border: '1px solid #E4EEF3', borderRadius: 8 }} />
                <details style={{ width: '100%' }}>
                  <summary style={{ fontSize: 11, color: '#1E88FF', cursor: 'pointer', textAlign: 'center' }}>
                    Can't scan? Enter key manually
                  </summary>
                  <div style={{
                    marginTop: 8, background: '#F8FBFF', border: '1px solid #CCDFF8',
                    borderRadius: 8, padding: '8px 12px', fontFamily: 'monospace',
                    fontSize: 12, color: '#1E3347', wordBreak: 'break-all', textAlign: 'center',
                  }}>
                    {manualKey}
                  </div>
                </details>
              </div>
            )}

            <Field label="6-digit verification code" icon={faShieldAlt}>
              <input
                type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                required value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                style={{ ...inputStyle, letterSpacing: '0.25em', textAlign: 'center', fontSize: 18, fontWeight: 700 }}
                onFocus={onFocus} onBlur={onBlur}
                autoFocus
              />
            </Field>

            {error && <p style={{ fontSize: 12, color: '#DC2626' }}>{error}</p>}

            <button type="submit" disabled={loading || otpCode.length !== 6} style={btnStyle(loading || otpCode.length !== 6)}>
              {loading ? 'Verifying…' : 'Verify & Continue →'}
            </button>

            {/* Fallback when the QR couldn't be generated (TOTP MFA not enabled on
                the project) — don't strand the invitee; let them finish setup. */}
            {!qrDataUrl && (
              <button
                type="button"
                onClick={() => setStep('agreements')}
                style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 12.5, cursor: 'pointer', marginTop: 2 }}
              >
                Two-factor setup is unavailable — continue without it →
              </button>
            )}
          </form>
        )}

        {/* ── Step 3 ── */}
        {step === 'agreements' && (
          <form onSubmit={handleAccept} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Terms of Service */}
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#4A5568', marginBottom: 6 }}>Terms of Service</p>
              <div style={{
                border: '1px solid #E4EEF3', borderRadius: 8, padding: '10px 12px',
                maxHeight: 100, overflowY: 'auto', fontSize: 11, color: '#6B7B88', lineHeight: 1.5,
              }}>
                By using myABA.ai, you agree to use the platform solely for lawful ABA clinical
                documentation purposes. You are responsible for maintaining the confidentiality of
                your account credentials. Unauthorized sharing of access is prohibited. myABA.ai
                reserves the right to suspend accounts that violate these terms. See the full{' '}
                <a href="https://myaba.ai/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#1E88FF' }}>Terms of Service</a>{' '}
                and <a href="https://myaba.ai/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#1E88FF' }}>Privacy Policy</a>.
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={tosChecked} onChange={(e) => setTosChecked(e.target.checked)}
                  style={{ marginTop: 2, accentColor: '#1E88FF' }} />
                <span style={{ fontSize: 12, color: '#3A5270' }}>
                  I have read and agree to the <strong>Terms of Service</strong>.
                </span>
              </label>
            </div>

            {/* BAA notice — already signed by org admin */}
            <div style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
              background: '#EEF7EA', border: '1px solid #B9DEB0', borderRadius: 8, padding: '10px 12px',
            }}>
              <FontAwesomeIcon icon={faCheckCircle} style={{ color: '#3F9B2F', fontSize: 13, marginTop: 1, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#2E6B20', lineHeight: 1.5 }}>
                A <strong>Business Associate Agreement</strong> is already in place for your organization.
                You are covered by your organization's BAA.
              </span>
            </div>

            {IS_EMULATOR && (
              <div style={{ display: 'flex', gap: 8, background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '8px 12px' }}>
                <FontAwesomeIcon icon={faShieldAlt} style={{ color: '#D97706', fontSize: 12, marginTop: 2 }} />
                <span style={{ fontSize: 11, color: '#92400E' }}>
                  Running against emulator — 2FA enrollment skipped. Required in production.
                </span>
              </div>
            )}

            {error && <p style={{ fontSize: 12, color: '#DC2626' }}>{error}</p>}

            <button
              type="submit"
              disabled={loading || !tosChecked}
              style={btnStyle(loading || !tosChecked)}
            >
              <FontAwesomeIcon icon={faCheckCircle} style={{ marginRight: 6 }} />
              {loading ? 'Joining organization…' : 'Accept & Join Organization'}
            </button>
          </form>
        )}
      </div>

      <p style={{ fontSize: 11, color: '#A8B4BF', marginTop: 20 }}>
        HIPAA-compliant platform · All data encrypted in transit
      </p>
    </div>
    </div>
  );
}

// ── Shared style helpers ──────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px 10px 34px',
  border: '1.5px solid #DCE7EE', borderRadius: 10,
  fontSize: 14, color: '#1E3347', background: 'white',
  outline: 'none', boxSizing: 'border-box',
};

const onFocus  = (e: React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor = '#1E88FF');
const onBlur   = (e: React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor = '#DCE7EE');

const btnStyle = (disabled: boolean): React.CSSProperties => ({
  width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
  background: disabled ? '#A8C4F0' : '#1E88FF', color: 'white',
  fontSize: 14, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
  transition: 'background 0.15s',
});

function Field({
  label, icon, children, suffix,
}: {
  label: string;
  icon: typeof faUser;
  children: React.ReactNode;
  suffix?: React.ReactNode;
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4A5568', marginBottom: 5 }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <FontAwesomeIcon icon={icon} style={{
          position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
          color: '#A8B4BF', fontSize: 13, pointerEvents: 'none',
        }} />
        {children}
        {suffix && <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', display: 'flex', alignItems: 'center' }}>{suffix}</div>}
      </div>
    </div>
  );
}
