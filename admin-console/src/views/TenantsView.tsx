import { useEffect, useState, type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBuilding, faSearch, faEllipsisV, faSyncAlt, faTimes,
  faUpRightFromSquare, faSpinner,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import type { Tenant, TenantDetail } from '../lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtNum(n: number) {
  return n.toLocaleString();
}

/** Payment status badge styling. */
const PAYMENT_META: Record<string, { label: string; color: string; bg: string }> = {
  active:   { label: 'Paid',     color: '#16A34A', bg: '#DCFCE7' },
  trialing: { label: 'Trial',    color: '#CA8A04', bg: '#FEF9C3' },
  past_due: { label: 'Past due', color: '#DC2626', bg: '#FEE2E2' },
  canceled: { label: 'Canceled', color: '#6B7280', bg: '#F3F4F6' },
};
function paymentMeta(s?: string | null) {
  return (s && PAYMENT_META[s]) || { label: 'No sub', color: '#9CA3AF', bg: '#F3F4F6' };
}
function fmtMoney(cents?: number) {
  if (cents === -1) return 'Custom';
  if (cents == null) return '—';
  return `$${Math.round(cents / 100).toLocaleString()}`;
}
function fmtMonth(period?: string) {
  if (!period) return 'Never';
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

const PLAN_STYLE: Record<string, { bg: string; text: string }> = {
  solo:       { bg: '#1E293B', text: '#94A3B8' },
  team:       { bg: '#1E3A5F', text: '#60A5FA' },
  enterprise: { bg: '#1B2F1E', text: '#4ADE80' },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function TenantsView() {
  const [tenants, setTenants]   = useState<Tenant[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState<'all' | 'active' | 'trial' | 'suspended'>('all');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

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
            <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 0.8fr 1fr 0.8fr 0.7fr 1.1fr 40px', padding: '10px 16px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
              {['Organization', 'Plan', 'Payment', 'MRR', 'Members', 'Usage (lifetime)', ''].map((h) => (
                <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF', fontSize: 14 }}>No results</div>
            ) : filtered.map((t) => {
              const planStyle = PLAN_STYLE[t.plan]  ?? PLAN_STYLE.solo;
              const pay = paymentMeta(t.subscriptionStatus);
              const suspended = t.status === 'suspended';
              return (
                <div
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.8fr 0.8fr 1fr 0.8fr 0.7fr 1.1fr 40px',
                    padding: '13px 16px',
                    borderBottom: '1px solid #F3F4F6',
                    alignItems: 'center',
                    opacity: actioning === t.id ? 0.5 : 1,
                    cursor: 'pointer',
                    transition: 'opacity 0.2s, background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#F9FAFB')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Org name + email */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {t.name}
                      {suspended && <span style={{ fontSize: 10, fontWeight: 600, color: '#F87171', background: '#FEF2F2', padding: '1px 6px', borderRadius: 10 }}>Suspended</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{t.adminEmail}</div>
                    <div style={{ fontSize: 11, color: '#D1D5DB', marginTop: 1 }}>Joined {fmtDate(t.createdAt)}</div>
                  </div>

                  {/* Plan */}
                  <div>
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: planStyle.bg, color: planStyle.text, textTransform: 'capitalize' }}>
                      {t.plan}
                    </span>
                  </div>

                  {/* Payment status */}
                  <div>
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: pay.bg, color: pay.color }}>
                      {pay.label}
                    </span>
                  </div>

                  {/* MRR — dimmed when not actively paying; "est" = seat estimate (not live Stripe) */}
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.paying ? '#111827' : '#9CA3AF' }}>
                    {fmtMoney(t.mrrCents)}
                    {t.mrrIsEstimate && t.mrrCents !== 0 && t.mrrCents !== -1 && (
                      <span style={{ fontSize: 10, fontWeight: 500, color: '#9CA3AF', marginLeft: 4 }}>est</span>
                    )}
                  </div>

                  {/* Members */}
                  <div style={{ fontSize: 13, color: '#374151' }}>{t.memberCount}</div>

                  {/* Usage (lifetime) + last active */}
                  <div>
                    <div style={{ fontSize: 13, color: '#374151' }}>{fmtNum(t.lifetimeAiCalls ?? 0)} calls</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>
                      {(t.lifetimeDocuments ?? 0)} docs · active {fmtMonth(t.lastActive)}
                    </div>
                  </div>

                  {/* Actions menu */}
                  <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
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
                          onClick={() => { setSelected(t.id); setOpenMenu(null); }}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 13, color: '#374151', background: 'none', border: 'none', cursor: 'pointer' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#F9FAFB')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                        >
                          View details
                        </button>
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

      {selected && (
        <TenantDetailModal
          orgId={selected}
          onClose={() => setSelected(null)}
          onStatusChange={(status) =>
            setTenants((prev) => prev.map((x) => (x.id === selected ? { ...x, status } : x)))}
        />
      )}
    </div>
  );
}

// ── Per-org drill-in modal ──────────────────────────────────────────────────────

function TenantDetailModal({ orgId, onClose, onStatusChange }: {
  orgId: string;
  onClose: () => void;
  onStatusChange: (status: 'active' | 'suspended') => void;
}) {
  const [d, setD] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.getTenant(orgId)
      .then((t) => { if (alive) setD(t); })
      .catch(() => { if (alive) setD(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [orgId]);

  const suspend = async () => {
    if (!d) return;
    const next = d.status === 'suspended' ? 'active' : 'suspended';
    setBusy(true);
    try {
      await api.setTenantStatus(orgId, next);
      setD({ ...d, status: next });
      onStatusChange(next);
    } catch { /* non-fatal */ }
    finally { setBusy(false); }
  };

  const pay = paymentMeta(d?.subscriptionStatus);
  const invoices = d?.billing?.invoices ?? [];

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560, maxWidth: '92vw', height: '100%', background: '#F8FAFC', boxShadow: '-8px 0 24px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ padding: '18px 24px', background: 'white', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{d?.name ?? 'Organization'}</div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{d?.adminEmail}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 18, padding: 4 }}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF' }}>
              <FontAwesomeIcon icon={faSpinner} spin /> Loading…
            </div>
          ) : !d ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF' }}>Could not load this organization.</div>
          ) : (
            <>
              {/* Billing card */}
              <Card title="Billing">
                <Row label="Plan"><span style={{ textTransform: 'capitalize' }}>{d.plan}</span></Row>
                <Row label="Payment">
                  <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: pay.bg, color: pay.color }}>{pay.label}</span>
                </Row>
                <Row label={d.mrrIsEstimate ? 'MRR (est.)' : 'MRR (billed)'}>{fmtMoney(d.mrrCents)}</Row>
                <Row label="Seats">{d.memberCount} ({d.fullSeats ?? 0} full · {d.liteSeats ?? 0} lite)</Row>
                <Row label="Renews">{d.currentPeriodEnd ? new Date(d.currentPeriodEnd * 1000).toLocaleDateString() : '—'}</Row>
                <Row label="BAA">{d.baaAccepted ? 'Accepted' : 'Not accepted'}</Row>
              </Card>

              {/* Recent invoices */}
              {invoices.length > 0 && (
                <Card title="Recent invoices">
                  {invoices.map((inv) => (
                    <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #F3F4F6', fontSize: 13 }}>
                      <span style={{ color: '#374151' }}>
                        {inv.number || inv.id} · <span style={{ textTransform: 'capitalize', color: inv.status === 'paid' ? '#16A34A' : '#CA8A04' }}>{inv.status}</span>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ color: '#111827', fontWeight: 600 }}>${((inv.amountPaid ?? inv.amountDue ?? 0) / 100).toLocaleString()}</span>
                        {inv.hostedInvoiceUrl && (
                          <a href={inv.hostedInvoiceUrl} target="_blank" rel="noreferrer" style={{ color: '#1D4ED8' }}>
                            <FontAwesomeIcon icon={faUpRightFromSquare} style={{ fontSize: 11 }} />
                          </a>
                        )}
                      </span>
                    </div>
                  ))}
                </Card>
              )}

              {/* Usage history */}
              <Card title="Usage by month">
                {(d.usageHistory ?? []).length === 0 ? (
                  <div style={{ color: '#9CA3AF', fontSize: 13 }}>No usage recorded yet.</div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', paddingBottom: 6, borderBottom: '1px solid #E5E7EB' }}>
                      <div>Month</div><div>AI calls</div><div>Docs</div><div>Chats</div>
                    </div>
                    {(d.usageHistory ?? []).map((u) => (
                      <div key={u.period} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', fontSize: 13, color: '#374151', padding: '6px 0', borderBottom: '1px solid #F3F4F6' }}>
                        <div>{fmtMonth(u.period)}</div><div>{fmtNum(u.aiCalls)}</div><div>{fmtNum(u.documentCount)}</div><div>{fmtNum(u.chatCount)}</div>
                      </div>
                    ))}
                  </>
                )}
              </Card>

              {/* Members */}
              <Card title={`Members (${(d.members ?? []).length})`}>
                {(d.members ?? []).map((m) => (
                  <div key={m.uid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F3F4F6', fontSize: 13 }}>
                    <span style={{ color: '#374151' }}>{m.displayName || m.email}</span>
                    <span style={{ fontSize: 11, color: '#6B7280' }}>{m.role} · {m.aiTier}</span>
                  </div>
                ))}
              </Card>

              <button
                onClick={suspend}
                disabled={busy}
                style={{ marginTop: 4, padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: d.status === 'suspended' ? '#16A34A' : '#DC2626' }}
              >
                {busy ? 'Working…' : d.status === 'suspended' ? 'Reactivate organization' : 'Suspend organization'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', padding: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: 13 }}>
      <span style={{ color: '#6B7280' }}>{label}</span>
      <span style={{ color: '#111827', fontWeight: 500 }}>{children}</span>
    </div>
  );
}
