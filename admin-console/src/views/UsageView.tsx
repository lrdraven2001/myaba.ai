import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartBar, faSyncAlt } from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import type { UsageSummary, UsageRow } from '../lib/api';

function fmtNum(n: number) { return n.toLocaleString(); }

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', padding: '18px 20px' }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em' }}>{value}</div>
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

const STATUS_COLOR: Record<string, string> = {
  active:    '#4ADE80',
  trial:     '#FBBF24',
  suspended: '#F87171',
};

export default function UsageView() {
  const [data, setData]       = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setData(await api.getUsage()); } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

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
            <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>{data?.month ?? '—'} &nbsp;·&nbsp; All orgs</p>
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
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF', fontSize: 14 }}>Loading…</div>
        ) : data ? (
          <>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
              <StatCard label="Active Orgs"     value={String(data.orgCount)}          sub="organizations on platform" />
              <StatCard label="Total AI Calls"  value={fmtNum(data.totalAiCalls ?? 0)} sub="this month"                />
              <StatCard label="Documents"       value={fmtNum(data.totalDocuments ?? 0)} sub="generated this month"    />
              <StatCard label="Chat Messages"   value={fmtNum(data.totalChats ?? 0)}   sub="across all orgs"           />
            </div>

            {/* Per-org breakdown */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr 1fr 2fr 2fr 2fr', padding: '10px 16px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                {['Organization', 'Plan', 'Status', 'AI Calls', 'Documents', 'Chats'].map((h) => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                ))}
              </div>

              {data.rows.map((row: UsageRow) => (
                <div
                  key={row.orgId}
                  style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr 1fr 2fr 2fr 2fr', padding: '14px 16px', borderBottom: '1px solid #F3F4F6', alignItems: 'center' }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{row.orgName}</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{row.memberCount} members</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#6B7280', textTransform: 'capitalize' }}>{row.plan}</div>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 500, color: STATUS_COLOR[row.status] ?? '#9CA3AF', textTransform: 'capitalize' }}>
                      {row.status}
                    </span>
                  </div>
                  <BarCell value={row.aiCalls ?? 0}       max={maxCalls} />
                  <BarCell value={row.documentCount ?? 0} max={maxDocs}  />
                  <BarCell value={row.chatCount ?? 0}     max={maxChats} />
                </div>
              ))}
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
