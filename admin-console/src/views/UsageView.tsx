import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartBar, faSyncAlt } from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import type { UsageSummary, UsageRow } from '../lib/api';

function fmtNum(n: number) { return n.toLocaleString(); }
function fmtMoney(cents?: number) {
  if (cents === -1) return 'Custom';
  if (cents == null) return '—';
  return `$${Math.round(cents / 100).toLocaleString()}`;
}
const PAYMENT_META: Record<string, { label: string; color: string; bg: string }> = {
  active:   { label: 'Paid',     color: '#16A34A', bg: '#DCFCE7' },
  trialing: { label: 'Trial',    color: '#CA8A04', bg: '#FEF9C3' },
  past_due: { label: 'Past due', color: '#DC2626', bg: '#FEE2E2' },
  canceled: { label: 'Canceled', color: '#6B7280', bg: '#F3F4F6' },
};
function paymentMeta(s?: string | null) {
  return (s && PAYMENT_META[s]) || { label: 'No sub', color: '#9CA3AF', bg: '#F3F4F6' };
}

/** The last `count` months as { value: "YYYY-MM", label: "August 2026" }, newest first. */
function recentMonths(count = 12): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < count; i++) {
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ value, label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) });
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}
const MONTHS = recentMonths(12);

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', padding: '18px 20px' }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent ?? '#0F172A', letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function BarCell({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: '#3B82F6', borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 12, color: '#374151', minWidth: 36, textAlign: 'right' }}>{fmtNum(value)}</span>
    </div>
  );
}

export default function UsageView() {
  const [data, setData]       = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth]     = useState<string>(MONTHS[0].value); // default: current month

  const load = async (m: string) => {
    setLoading(true);
    try { setData(await api.getUsage(m)); } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(month); }, [month]);

  const monthLabel = MONTHS.find((m) => m.value === month)?.label ?? month;
  const maxCalls = data ? Math.max(...data.rows.map((r) => r.aiCalls ?? 0), 1)       : 1;
  const maxDocs  = data ? Math.max(...data.rows.map((r) => r.documentCount ?? 0), 1) : 1;
  const maxChats = data ? Math.max(...data.rows.map((r) => r.chatCount ?? 0), 1)     : 1;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '20px 28px', background: 'white', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FontAwesomeIcon icon={faChartBar} style={{ color: '#1D4ED8', fontSize: 16 }} />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: 0 }}>Usage</h1>
            <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>All-time totals below · monthly detail for the selected period</p>
          </div>
        </div>
        <button
          onClick={() => load(month)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}
        >
          <FontAwesomeIcon icon={faSyncAlt} style={{ fontSize: 12 }} />
          Refresh
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
        {loading && !data ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF', fontSize: 14 }}>Loading…</div>
        ) : data ? (
          <>
            {/* All-time totals — the platform-wide "total usage" */}
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Platform totals (all time)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
              <StatCard label="Est. MRR"       value={fmtMoney(data.totalMrrCents ?? 0)} sub={`${data.payingOrgCount ?? 0} paying · ${data.orgCount} orgs`} accent="#16A34A" />
              <StatCard label="AI Calls"       value={fmtNum(data.lifetimeAiCalls ?? 0)}   sub="all time" />
              <StatCard label="Documents"      value={fmtNum(data.lifetimeDocuments ?? 0)} sub="generated, all time" />
              <StatCard label="Chat Messages"  value={fmtNum(data.lifetimeChats ?? 0)}     sub="all time" />
            </div>

            {/* Month selector + selected-month totals */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>By month</div>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                style={{ padding: '6px 10px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, color: '#111827', background: 'white', cursor: 'pointer' }}
              >
                {MONTHS.map((m, i) => (
                  <option key={m.value} value={m.value}>{i === 0 ? `${m.label} (this month)` : i === 1 ? `${m.label} (last month)` : m.label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
              <StatCard label={`AI Calls — ${monthLabel}`} value={fmtNum(data.totalAiCalls ?? 0)} />
              <StatCard label={`Documents — ${monthLabel}`} value={fmtNum(data.totalDocuments ?? 0)} />
              <StatCard label={`Chats — ${monthLabel}`} value={fmtNum(data.totalChats ?? 0)} />
            </div>

            {/* Per-org breakdown for the selected month */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden', opacity: loading ? 0.6 : 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.7fr 0.9fr 0.7fr 1.5fr 1.5fr 1.5fr', padding: '10px 16px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                {['Organization', 'Plan', 'Payment', 'MRR', `AI Calls`, 'Documents', 'Chats'].map((h) => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                ))}
              </div>
              <div style={{ padding: '4px 16px 0', fontSize: 10, color: '#9CA3AF' }}>Usage bars show {monthLabel}; lifetime shown under each org.</div>

              {data.rows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF', fontSize: 14 }}>No organizations.</div>
              ) : data.rows.map((row: UsageRow) => {
                const pay = paymentMeta(row.subscriptionStatus);
                return (
                  <div
                    key={row.orgId}
                    style={{ display: 'grid', gridTemplateColumns: '2fr 0.7fr 0.9fr 0.7fr 1.5fr 1.5fr 1.5fr', padding: '14px 16px', borderBottom: '1px solid #F3F4F6', alignItems: 'center' }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{row.orgName}</div>
                      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                        {row.memberCount} members · {fmtNum(row.lifetimeAiCalls ?? 0)} calls lifetime
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: '#6B7280', textTransform: 'capitalize' }}>{row.plan}</div>
                    <div>
                      <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: pay.bg, color: pay.color }}>{pay.label}</span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: row.paying ? '#111827' : '#9CA3AF' }}>{fmtMoney(row.mrrCents)}</div>
                    <BarCell value={row.aiCalls ?? 0}       max={maxCalls} />
                    <BarCell value={row.documentCount ?? 0} max={maxDocs}  />
                    <BarCell value={row.chatCount ?? 0}     max={maxChats} />
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF', fontSize: 14 }}>
            Could not load usage data. Is the backend running?
          </div>
        )}
      </div>
    </div>
  );
}
