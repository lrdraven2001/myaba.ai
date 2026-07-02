import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUserPlus, faSyncAlt, faTrashAlt, faCheckCircle,
  faHourglassHalf, faRotateLeft, faSpinner,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import type { ApprovedCreator } from '../lib/api';

function fmtDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Pathfinder allowlist management. Each entry is one email approved to create
 * an organization (single-use — creating the org marks it "used"). Re-approving
 * a used entry resets it.
 */
export default function ApprovedCreatorsView() {
  const [creators, setCreators]   = useState<ApprovedCreator[]>([]);
  const [loading, setLoading]     = useState(true);
  const [email, setEmail]         = useState('');
  const [note, setNote]           = useState('');
  const [adding, setAdding]       = useState(false);
  const [error, setError]         = useState('');
  const [actioning, setActioning] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { creators } = await api.getApprovedCreators();
      setCreators(creators);
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError('');
    setAdding(true);
    try {
      await api.addApprovedCreator(email.trim(), note.trim() || undefined);
      setEmail(''); setNote('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add');
    } finally {
      setAdding(false);
    }
  };

  const handleRevoke = async (c: ApprovedCreator) => {
    setActioning(c.email);
    try { await api.revokeApprovedCreator(c.email); setCreators((p) => p.filter((x) => x.email !== c.email)); }
    catch { /* keep row */ }
    finally { setActioning(null); }
  };

  const handleReset = async (c: ApprovedCreator) => {
    setActioning(c.email);
    try { await api.addApprovedCreator(c.email, c.note); await load(); }
    catch { /* keep row */ }
    finally { setActioning(null); }
  };

  const pending = creators.filter((c) => !c.used).length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '20px 28px', background: 'white', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FontAwesomeIcon icon={faUserPlus} style={{ color: '#1D4ED8', fontSize: 16 }} />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: 0 }}>Approved Org Creators</h1>
            <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>
              Pathfinder allowlist — {pending} pending invitation{pending !== 1 ? 's' : ''}, {creators.length} total
            </p>
          </div>
        </div>
        <button
          onClick={load}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}
        >
          <FontAwesomeIcon icon={faSyncAlt} style={{ fontSize: 12 }} />
          Refresh
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>

        {/* Add form */}
        <form onSubmit={handleAdd} style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '16px 18px', marginBottom: 20, maxWidth: 720 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 10 }}>
            Approve a new organization creator
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@newpractice.com"
              style={{ flex: 2, padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', color: '#111827' }}
            />
            <input
              value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional) — e.g. practice name"
              style={{ flex: 2, padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', color: '#111827' }}
            />
            <button
              type="submit" disabled={adding || !email.trim()}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: adding ? '#93C5FD' : 'linear-gradient(135deg, #1565C0, #1E88FF)', border: 'none', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 600, cursor: adding ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
            >
              <FontAwesomeIcon icon={adding ? faSpinner : faUserPlus} className={adding ? 'fa-spin' : ''} style={{ fontSize: 12 }} />
              {adding ? 'Adding…' : 'Approve'}
            </button>
          </div>
          {error && <p style={{ fontSize: 12, color: '#DC2626', marginTop: 8, marginBottom: 0 }}>{error}</p>}
          <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8, marginBottom: 0 }}>
            The approved email can sign in and create one organization (they become its Practice Administrator).
            Entries are single-use; re-approving a used entry lets the same email provision again.
          </p>
        </form>

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF', fontSize: 14 }}>Loading…</div>
        ) : (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.6fr 1.2fr 1.4fr 100px', padding: '10px 16px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
              {['Email', 'Note', 'Status', 'Approved', ''].map((h) => (
                <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
              ))}
            </div>

            {creators.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF', fontSize: 14 }}>
                No approved creators yet — add one above to invite a new organization.
              </div>
            ) : creators.map((c) => (
              <div key={c.email} style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.6fr 1.2fr 1.4fr 100px', padding: '13px 16px', borderBottom: '1px solid #F3F4F6', alignItems: 'center', opacity: actioning === c.email ? 0.5 : 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email}</div>
                <div style={{ fontSize: 12, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.note || '—'}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FontAwesomeIcon
                    icon={c.used ? faCheckCircle : faHourglassHalf}
                    style={{ color: c.used ? '#4ADE80' : '#FBBF24', fontSize: 12 }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 500, color: c.used ? '#16A34A' : '#B45309' }}>
                    {c.used ? 'Org created' : 'Pending'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#6B7280' }}>
                  {fmtDate(c.approvedAt)}
                  {c.used && c.orgId && (
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>→ {c.orgId}</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  {c.used && (
                    <button
                      onClick={() => handleReset(c)}
                      title="Re-approve — lets this email create another org"
                      style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 6, cursor: 'pointer', color: '#6B7280', padding: '5px 8px', fontSize: 12 }}
                    >
                      <FontAwesomeIcon icon={faRotateLeft} />
                    </button>
                  )}
                  <button
                    onClick={() => handleRevoke(c)}
                    title="Remove from allowlist"
                    style={{ background: 'none', border: '1px solid #FEE2E2', borderRadius: 6, cursor: 'pointer', color: '#DC2626', padding: '5px 8px', fontSize: 12 }}
                  >
                    <FontAwesomeIcon icon={faTrashAlt} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
