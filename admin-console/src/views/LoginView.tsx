import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShieldAlt, faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../contexts/AuthContext';

export default function LoginView() {
  const { login, loginWithGoogle } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch {
      setError('Google sign-in failed or was cancelled.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch {
      setError('Invalid credentials or insufficient permissions.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0F172A',
      padding: 24,
    }}>
      <div style={{
        width: '100%',
        maxWidth: 380,
        background: '#1E293B',
        borderRadius: 16,
        border: '1px solid #334155',
        padding: '36px 32px',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'linear-gradient(135deg, #1565C0, #42A5F5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 12,
          }}>
            <FontAwesomeIcon icon={faShieldAlt} style={{ color: 'white', fontSize: 22 }} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#F1F5F9' }}>
            <span style={{ color: '#60A5FA' }}>myABA</span>
            <span style={{ color: '#94A3B8' }}>.ai</span>
          </div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Platform Admin Console
          </div>
        </div>

        {/* Google sign-in — primary path (same identity pool as the main app) */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '11px 0', marginBottom: 18,
            background: 'white', border: 'none', borderRadius: 8,
            color: '#1F2937', fontSize: 14, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          <svg width="17" height="17" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{ flex: 1, height: 1, background: '#334155' }} />
          <span style={{ fontSize: 11, color: '#475569' }}>or with email</span>
          <div style={{ flex: 1, height: 1, background: '#334155' }} />
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#94A3B8', marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="chris@myaba.ai"
              style={{
                width: '100%', padding: '10px 12px',
                background: '#0F172A', border: '1px solid #334155',
                borderRadius: 8, color: '#F1F5F9', fontSize: 14,
                outline: 'none',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#3B82F6')}
              onBlur={(e) => (e.target.style.borderColor = '#334155')}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#94A3B8', marginBottom: 6 }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%', padding: '10px 38px 10px 12px',
                  background: '#0F172A', border: '1px solid #334155',
                  borderRadius: 8, color: '#F1F5F9', fontSize: 14,
                  outline: 'none',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#3B82F6')}
                onBlur={(e) => (e.target.style.borderColor = '#334155')}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                style={{
                  position: 'absolute', right: 10, top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none', border: 'none',
                  color: '#475569', cursor: 'pointer',
                }}
              >
                <FontAwesomeIcon icon={showPw ? faEyeSlash : faEye} style={{ fontSize: 14 }} />
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: '#450A0A', border: '1px solid #7F1D1D',
              color: '#FCA5A5', fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '11px 0',
              background: loading ? '#1D4ED8' : 'linear-gradient(135deg, #1565C0, #1E88FF)',
              border: 'none', borderRadius: 8,
              color: 'white', fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: 4,
              transition: 'opacity 0.15s',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#334155', marginTop: 20 }}>
          Admin console access only. Not the customer app.
        </p>
      </div>
    </div>
  );
}
