import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShieldAlt, faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../contexts/AuthContext';

export default function LoginView() {
  const { login } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

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
