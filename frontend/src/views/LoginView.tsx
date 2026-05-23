import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBrain } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../contexts/AuthContext';

export default function LoginView() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch {
      setError('Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center" style={{ background: '#f0f7fa' }}>
      <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="flex items-center justify-center rounded-xl mb-3"
            style={{ background: '#2a5f6f', width: 72, height: 72 }}
          >
            <FontAwesomeIcon icon={faBrain} style={{ fontSize: 38, color: 'white' }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#2a5f6f' }}>
            myABA.ai
          </h1>
          <p className="text-gray-500 text-sm mt-1">AI-Powered ABA Clinical Documentation</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:border-teal-600 text-sm"
              placeholder="bcba@clinic.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:border-teal-600 text-sm"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg font-semibold text-white text-sm transition-opacity"
            style={{ background: '#2a5f6f', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          HIPAA-compliant platform. All data encrypted.
        </p>
      </div>
    </div>
  );
}
