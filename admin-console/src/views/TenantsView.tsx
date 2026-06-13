import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBuilding, faSearch, faCheckCircle, faPauseCircle,
  faFlask, faEllipsisV, faSyncAlt,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import type { Tenant } from '../lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtBytes(b: number) {
  if (b >= 1_000_000_000) return `${(b / 1_000_000_000).toFixed(1)} GB`;
  if (b >= 1_000_000)     return `${(b / 1_000_000).toFixed(1)} MB`;
  if (b >= 1_000)         return `${(b / 1_000).toFixed(0)} KB`;
  return `${b} B`;
}

function fmtNum(n: number) {
  return n.toLocaleString();
}

const PLAN_STYLE: Record<string, { bg: string; text: string }> = {
  solo:       { bg: '#1E293B', text: '#94A3B8' },
  team:       { bg: '#1E3A5F', text: '#60A5FA' },
  enterprise: { bg: '#1B2F1E', text: '#4ADE80' },
};

const STATUS_META: Record<string, { icon: typeof faCheckCircle; color: string; label: string }> = {
  active:    { icon: faCheckCircle,  color: '#4ADE80', label: 'Active'    },
  trial:     { icon: faFlask,        color: '#FBBF24', label: 'Trial'     },
  suspended: { icon: faPauseCircle,  color: '#F87171', label: 'Suspended' },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function TenantsView() {
  const [tenants, setTenants]   = useState<Tenant[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState<'all' | 'active' | 'trial' | 'suspended'>('all');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getTenants();
      setTenants(data);
    } catch {
      // backend unreachable — keep empty
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = tenants.filter((t) => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase())
                     || t.adminEmail.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || t.status === filter;
    return matchSearch && matchFilter;
  });

  const counts = {
    all:       tenants.length,
    active:    tenants.filter((t) => t.status === 'active').length,
    trial:     tenants.filter((t) => t.status === 'trial').length,
    suspended: tenants.filter((t) => t.status === 'suspended').length,
  };

  const toggleStatus = async (t: Tenant) => {
    const next = t.status === 'suspended' ? 'active' : 'suspended';
    setActioning(t.id);
    setOpenMenu(null);
    try {
      await api.setTenantStatus(t.id, next);
      setTenants((prev) => prev.map((x) => x.id === t.id ? { ...x, status: next } : x));
    } catch { /* non-fatal in dev */ }
    finally { setActioning(null); }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '20px 28px 0', background: 'white', borderBottom: '1px solid #E5E7EB' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FontAwesomeIcon icon={faBuilding} style={{ color: '#1D4ED8', fontSize: 16 }} />
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: 0 }}>Tenants</h1>
              <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>{tenants.length} organizations on platform</p>
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

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'active', 'trial', 'suspended'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '8px 14px', fontSize: 13, fontWeight: 500,
                background: 'transparent', border: 'none',
                borderBottom: filter === f ? '2px solid #1D4ED8' : '2px solid transparent',
                color: filter === f ? '#1D4ED8' : '#6B7280',
                cursor: 'pointer', textTransform: 'capitalize',
              }}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
            </button>
          ))}
        </div>
      </div>

      {/* Search + table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 28px' }}>

        {/* Search */}
        <div style={{ position: 'relative', maxWidth: 340, marginBottom: 16 }}>
          <FontAwesomeIcon icon={faSearch} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', fontSize: 13 }} />
          <input
            type="text"
            placeholder="Search by org name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px 8px 32px',
              border: '1px solid #E5E7EB', borderRadius: 8,
              fontSize: 13, color: '#111827', outline: 'none',
              background: 'white',
            }}
          />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF', fontSize: 14 }}>
            Loading tenants…
          </div>
        ) : (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 40px', padding: '10px 16px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
              {['Organization', 'Plan', 'Status', 'Members', 'AI Calls', 'Storage', ''].map((h) => (
                <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF', fontSize: 14 }}>No results</div>
            ) : filtered.map((t) => {
              const statusM  = STATUS_META[t.status] ?? STATUS_META.active;
              const planStyle = PLAN_STYLE[t.plan]  ?? PLAN_STYLE.solo;
              return (
                <div
                  key={t.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 40px',
                    padding: '13px 16px',
                    borderBottom: '1px solid #F3F4F6',
                    alignItems: 'center',
                    opacity: actioning === t.id ? 0.5 : 1,
                    transition: 'opacity 0.2s',
                  }}
                >
                  {/* Org name + email */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{t.adminEmail}</div>
                    <div style={{ fontSize: 11, color: '#D1D5DB', marginTop: 1 }}>Joined {fmtDate(t.createdAt)}</div>
                  </div>

                  {/* Plan */}
                  <div>
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: planStyle.bg, color: planStyle.text, textTransform: 'capitalize' }}>
                      {t.plan}
                    </span>
                  </div>

                  {/* Status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FontAwesomeIcon icon={statusM.icon} style={{ color: statusM.color, fontSize: 13 }} />
                    <span style={{ fontSize: 12, color: statusM.color, fontWeight: 500 }}>{statusM.label}</span>
                  </div>

                  {/* Members */}
                  <div style={{ fontSize: 13, color: '#374151' }}>{t.memberCount}</div>

                  {/* AI calls */}
                  <div style={{ fontSize: 13, color: '#374151' }}>{fmtNum(t.aiCalls ?? 0)}</div>

                  {/* Storage */}
                  <div style={{ fontSize: 13, color: '#374151' }}>{fmtBytes(t.storageBytes ?? 0)}</div>

                  {/* Actions menu */}
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => setOpenMenu(openMenu === t.id ? null : t.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: '4px 6px', borderRadius: 6 }}
                    >
                      <FontAwesomeIcon icon={faEllipsisV} style={{ fontSize: 14 }} />
                    </button>
                    {openMenu === t.id && (
                      <div style={{
                        position: 'absolute', right: 0, top: 28, zIndex: 50,
                        background: 'white', border: '1px solid #E5E7EB',
                        borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                        minWidth: 160, overflow: 'hidden',
                      }}>
                        <button
                          onClick={() => toggleStatus(t)}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 13, color: t.status === 'suspended' ? '#16A34A' : '#DC2626', background: 'none', border: 'none', cursor: 'pointer' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#F9FAFB')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                        >
                          {t.status === 'suspended' ? 'Reactivate org' : 'Suspend org'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
