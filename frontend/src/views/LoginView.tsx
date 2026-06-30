import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash, faLock, faEnvelope, faFlask, faUser, faEnvelopeOpen } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../contexts/AuthContext';

// Google "G" logo as a clean inline SVG — no extra package dependency
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  );
}

interface Props {
  invitePreview?: { orgName: string; role: string } | null;
}

export default function LoginView({ invitePreview }: Props = {}) {
  const { login, register, loginWithGoogle, mfaChallengePending, resolveMfaSignIn, cancelMfa } = useAuth();
  const hasInvite = !!invitePreview;
  const [mfaCode, setMfaCode]   = useState('');
  const [mfaError, setMfaError] = useState('');
  const [mfaBusy, setMfaBusy]   = useState(false);
  const [mode, setMode]             = useState<'signin' | 'register'>(hasInvite ? 'register' : 'signin');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [showPw, setShowPw]         = useState(false);
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const switchMode = (next: 'signin' | 'register') => {
    setMode(next);
    setError('');
    setPassword('');
    setConfirmPw('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'register') {
      if (!displayName.trim()) { setError('Full name is required.'); return; }
      if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
      if (password !== confirmPw) { setError('Passwords do not match.'); return; }
    }

    setLoading(true);
    try {
      if (mode === 'register') {
        await register(email, password, displayName.trim());
      } else {
        await login(email, password);
      }
    } catch (err: unknown) {
      // Enrolled-MFA user: the second-factor challenge modal takes over — no error.
      if ((err as { code?: string })?.code === 'mfa-required') { setLoading(false); return; }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('email-already-in-use')) {
        setError('An account with this email already exists. Sign in instead.');
      } else if (msg.includes('invalid-credential') || msg.includes('wrong-password') || msg.includes('user-not-found')) {
        setError('Invalid email or password. Please try again.');
      } else if (msg.includes('weak-password')) {
        setError('Password is too weak. Use at least 8 characters.');
      } else {
        setError(mode === 'register' ? 'Registration failed. Please try again.' : 'Sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'mfa-required') { setGoogleLoading(false); return; }
      setError('Google sign-in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaError('');
    if (mfaCode.length !== 6) { setMfaError('Enter the 6-digit code from your authenticator.'); return; }
    setMfaBusy(true);
    try {
      await resolveMfaSignIn(mfaCode);
      // success — onAuthStateChanged signs the user in and unmounts LoginView
    } catch {
      setMfaError('Invalid code. Wait for the next code and try again.');
    } finally {
      setMfaBusy(false);
    }
  };

  const isRegister = mode === 'register';

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#F0F7FA',
      padding: 24,
    }}>
      {/* Second-factor (TOTP) challenge — shown when an enrolled-MFA sign-in is paused */}
      {mfaChallengePending && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,35,45,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 380, background: 'white', borderRadius: 18, padding: '28px', boxShadow: '0 10px 40px rgba(0,0,0,0.22)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1E3347', margin: 0 }}>Two-step verification</h2>
            <p style={{ fontSize: 13, color: '#6B7B88', marginTop: 6, lineHeight: 1.5 }}>
              Enter the 6-digit code from your authenticator app to finish signing in.
            </p>
            <form onSubmit={handleVerifyMfa} style={{ marginTop: 16 }}>
              <input
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric" autoFocus placeholder="000000" aria-label="Authenticator code"
                style={{ width: '100%', textAlign: 'center', letterSpacing: '0.3em', fontSize: 22, fontWeight: 700, padding: '10px 0', border: '1.5px solid #DCE7EE', borderRadius: 10, color: '#1E3347', outline: 'none', boxSizing: 'border-box' }}
              />
              {mfaError && (
                <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: '#FFF1F1', border: '1px solid #FFC9C9', color: '#C0392B', fontSize: 13 }}>{mfaError}</div>
              )}
              <button type="submit" disabled={mfaBusy} style={{ width: '100%', marginTop: 14, padding: '12px 0', background: mfaBusy ? '#A8B4BF' : 'linear-gradient(135deg,#1E88FF,#1565C0)', border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontWeight: 700, cursor: mfaBusy ? 'not-allowed' : 'pointer' }}>
                {mfaBusy ? 'Verifying…' : 'Verify & Sign In'}
              </button>
              <button type="button" onClick={() => { cancelMfa(); setMfaCode(''); setMfaError(''); }} style={{ width: '100%', marginTop: 8, padding: '8px 0', background: 'transparent', border: 'none', color: '#6B7B88', fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}
      <div style={{
        width: '100%',
        maxWidth: 420,
        background: 'white',
        borderRadius: 20,
        boxShadow: '0 4px 24px rgba(0,0,0,0.09)',
        padding: '40px 36px 32px',
        border: '1px solid #E4EEF3',
      }}>

        {/* ── Logo + wordmark ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 18, background: 'white',
            boxShadow: '0 4px 14px rgba(0,0,0,0.10)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 14, overflow: 'hidden',
          }}>
            <img
              src="/app-icon.png"
              alt="myABA.ai"
              style={{ width: 58, height: 58, objectFit: 'contain' }}
              onError={(e) => { (e.target as HTMLImageElement).src = '/favicon.svg'; }}
            />
          </div>

          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
            <span style={{ color: '#1E3347' }}>my</span>
            <span style={{ color: '#1E88FF' }}>ABA</span>
            <span style={{ color: '#3F9B2F' }}>.ai</span>
          </div>
          <div style={{ fontSize: 13, color: '#6B7B88', marginTop: 5 }}>
            AI-Powered ABA Clinical Documentation
          </div>

          {/* Pathfinder early-access badge */}
          <div style={{
            marginTop: 14,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'linear-gradient(135deg, #EEF7EA, #E6F4FF)',
            border: '1px solid #B9DEB0', borderRadius: 20, padding: '5px 12px',
          }}>
            <FontAwesomeIcon icon={faFlask} style={{ color: '#3F9B2F', fontSize: 11 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#2E6B20', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Pathfinder Early Access
            </span>
          </div>
        </div>

        {/* ── Mode tabs — only shown when arriving via invite (Sign In + Create Account) ── */}
        {hasInvite && (
          <div style={{
            display: 'flex', borderRadius: 10, border: '1.5px solid #DCE7EE',
            marginBottom: 20, overflow: 'hidden',
          }}>
            {(['signin', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                style={{
                  flex: 1, padding: '9px 0',
                  background: mode === m ? '#1E3347' : 'transparent',
                  color: mode === m ? 'white' : '#6B7B88',
                  border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 700,
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>
        )}

        {/* ── Invite banner (when arriving via invite link) ── */}
        {invitePreview ? (
          <div style={{
            background: '#EEF7EA', border: '1px solid #B9DEB0', borderRadius: 10,
            padding: '11px 14px', marginBottom: 20, fontSize: 12.5, color: '#2E6B20', lineHeight: 1.55,
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <FontAwesomeIcon icon={faEnvelopeOpen} style={{ color: '#3F9B2F', fontSize: 14, marginTop: 2, flexShrink: 0 }} />
            <div>
              You've been invited to join <strong>{invitePreview.orgName}</strong> as a{' '}
              <strong>{invitePreview.role.replace(/_/g, ' ').toLowerCase()}</strong>.
              <br />
              <span style={{ color: '#4A7A3A' }}>Sign in or create an account to accept.</span>
            </div>
          </div>
        ) : !isRegister && (
          <div style={{
            background: '#F8FBFF', border: '1px solid #CCDFF8', borderRadius: 10,
            padding: '11px 14px', marginBottom: 20, fontSize: 12.5, color: '#3A5270', lineHeight: 1.55,
          }}>
            myABA.ai is in a <strong>closed early-access program</strong> with select partner agencies.
            Sign in below, or create an account to register your agency.
            <br />
            <span style={{ color: '#6B7B88', marginTop: 4, display: 'block' }}>
              Questions? &nbsp;
              <a href="mailto:hello@myaba.ai?subject=Pathfinder%20Interest"
                style={{ color: '#1E88FF', textDecoration: 'none', fontWeight: 600 }}>
                Contact us
              </a>
            </span>
          </div>
        )}

        {/* ── Google button (sign-in only for now — OAuth registration same flow) ── */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading || loading}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '11px 0', background: 'white', border: '1.5px solid #DCE7EE', borderRadius: 10,
            fontSize: 14, fontWeight: 600, color: '#1E3347',
            cursor: googleLoading || loading ? 'not-allowed' : 'pointer',
            opacity: googleLoading || loading ? 0.6 : 1, transition: 'border-color 0.15s, box-shadow 0.15s',
            marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          }}
          onMouseEnter={(e) => { if (!googleLoading && !loading) { e.currentTarget.style.borderColor = '#1E88FF'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(30,136,255,0.12)'; } }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#DCE7EE'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'; }}
        >
          <GoogleLogo />
          {googleLoading ? 'Signing in…' : `Continue with Google`}
        </button>

        {/* ── Divider ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 1, background: '#E4EEF3' }} />
          <span style={{ fontSize: 12, color: '#A8B4BF', fontWeight: 500 }}>
            {isRegister ? 'or register with email' : 'or sign in with email'}
          </span>
          <div style={{ flex: 1, height: 1, background: '#E4EEF3' }} />
        </div>

        {/* ── Form ── */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Full name (registration only) */}
          {isRegister && (
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4A5568', marginBottom: 6 }}>
                Full Name
              </label>
              <div style={{ position: 'relative' }}>
                <FontAwesomeIcon icon={faUser} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#A8B4BF', fontSize: 13, pointerEvents: 'none' }} />
                <input
                  type="text" required value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Jane Smith" disabled={loading}
                  style={{ width: '100%', padding: '10px 12px 10px 34px', border: '1.5px solid #DCE7EE', borderRadius: 10, fontSize: 14, color: '#1E3347', background: 'white', outline: 'none', boxSizing: 'border-box' }}
                  onFocus={(e) => (e.target.style.borderColor = '#1E88FF')}
                  onBlur={(e) => (e.target.style.borderColor = '#DCE7EE')}
                />
              </div>
            </div>
          )}

          {/* Email */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4A5568', marginBottom: 6 }}>
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <FontAwesomeIcon icon={faEnvelope} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#A8B4BF', fontSize: 13, pointerEvents: 'none' }} />
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="bcba@clinic.com" disabled={loading || googleLoading}
                style={{ width: '100%', padding: '10px 12px 10px 34px', border: '1.5px solid #DCE7EE', borderRadius: 10, fontSize: 14, color: '#1E3347', background: 'white', outline: 'none', boxSizing: 'border-box' }}
                onFocus={(e) => (e.target.style.borderColor = '#1E88FF')}
                onBlur={(e) => (e.target.style.borderColor = '#DCE7EE')}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4A5568', marginBottom: 6 }}>
              Password {isRegister && <span style={{ fontWeight: 400, color: '#A8B4BF' }}>(min 8 chars)</span>}
            </label>
            <div style={{ position: 'relative' }}>
              <FontAwesomeIcon icon={faLock} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#A8B4BF', fontSize: 13, pointerEvents: 'none' }} />
              <input
                type={showPw ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" disabled={loading || googleLoading}
                style={{ width: '100%', padding: '10px 38px 10px 34px', border: '1.5px solid #DCE7EE', borderRadius: 10, fontSize: 14, color: '#1E3347', background: 'white', outline: 'none', boxSizing: 'border-box' }}
                onFocus={(e) => (e.target.style.borderColor = '#1E88FF')}
                onBlur={(e) => (e.target.style.borderColor = '#DCE7EE')}
              />
              <button type="button" onClick={() => setShowPw((v) => !v)} tabIndex={-1}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#A8B4BF', cursor: 'pointer', padding: '2px 4px' }}>
                <FontAwesomeIcon icon={showPw ? faEyeSlash : faEye} style={{ fontSize: 13 }} />
              </button>
            </div>
          </div>

          {/* Confirm password (registration only) */}
          {isRegister && (
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4A5568', marginBottom: 6 }}>
                Confirm Password
              </label>
              <div style={{ position: 'relative' }}>
                <FontAwesomeIcon icon={faLock} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#A8B4BF', fontSize: 13, pointerEvents: 'none' }} />
                <input
                  type={showPw ? 'text' : 'password'} required value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="••••••••" disabled={loading}
                  style={{ width: '100%', padding: '10px 38px 10px 34px', border: '1.5px solid #DCE7EE', borderRadius: 10, fontSize: 14, color: '#1E3347', background: 'white', outline: 'none', boxSizing: 'border-box', borderColor: confirmPw && confirmPw !== password ? '#FC8181' : '#DCE7EE' }}
                  onFocus={(e) => (e.target.style.borderColor = confirmPw !== password ? '#FC8181' : '#1E88FF')}
                  onBlur={(e) => (e.target.style.borderColor = confirmPw && confirmPw !== password ? '#FC8181' : '#DCE7EE')}
                />
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div style={{ padding: '9px 12px', borderRadius: 8, background: '#FFF1F1', border: '1px solid #FFC9C9', color: '#C0392B', fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || googleLoading}
            style={{
              padding: '12px 0',
              background: loading ? '#A8B4BF' : 'linear-gradient(135deg, #1E88FF, #1565C0)',
              border: 'none', borderRadius: 10, color: 'white',
              fontSize: 14, fontWeight: 700,
              cursor: loading || googleLoading ? 'not-allowed' : 'pointer',
              marginTop: 2, letterSpacing: '0.01em',
              boxShadow: loading ? 'none' : '0 2px 8px rgba(30,136,255,0.30)',
              transition: 'opacity 0.15s',
            }}
          >
            {loading ? (isRegister ? 'Creating account…' : 'Signing in…') : (isRegister ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        {/* ── Footer ── */}
        <p style={{ textAlign: 'center', fontSize: 11, color: '#A8B4BF', marginTop: 24, lineHeight: 1.6 }}>
          HIPAA-compliant platform &nbsp;·&nbsp; All data encrypted in transit
          <br />
          {isRegister
            ? 'By creating an account you agree to our Terms of Service'
            : 'Pathfinder Beta · Access by invitation only'}
        </p>
      </div>
    </div>
  );
}
