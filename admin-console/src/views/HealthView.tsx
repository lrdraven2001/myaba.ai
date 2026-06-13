import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faHeartbeat, faCheckCircle, faTimesCircle,
  faSpinner, faSyncAlt,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import type { HealthReport, ServiceHealth } from '../lib/api';

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function ServiceCard({ s }: { s: ServiceHealth }) {
  return (
    <div style={{
      background: 'white',
      borderRadius: 12,
      border: `1px solid ${s.up ? '#D1FAE5' : '#FEE2E2'}`,
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{s.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FontAwesomeIcon
            icon={s.up ? faCheckCircle : faTimesCircle}
            style={{ color: s.up ? '#16A34A' : '#DC2626', fontSize: 16 }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: s.up ? '#16A34A' : '#DC2626' }}>
            {s.up ? 'UP' : 'DOWN'}
          </span>
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#6B7280' }}>{s.message}</div>

      {s.latencyMs > 0 && (
        <div style={{ display: 'flex', align: 'center', gap: 6 }}>
          <div style={{ width: Math.min(s.latencyMs, 200), height: 4, background: s.latencyMs < 100 ? '#4ADE80' : s.latencyMs < 500 ? '#FBBF24' : '#F87171', borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: '#9CA3AF' }}>{s.latencyMs}ms</span>
        </div>
      )}
    </div>
  );
}

export default function HealthView() {
  const [report, setReport]   = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try { setReport(await api.getHealth()); } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { void load(); }, []);

  // Auto-refresh every 30s
  useEffect(() => {
    const t = setInterval(() => void load(true), 30_000);
    return () => clearInterval(t);
  }, []);

  const services = report
    ? [report.api, report.firebase, report.aclx, report.dlp]
    : [];

  const allUp = services.every((s) => s.up);
  const anyDown = services.some((s) => !s.up);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '20px 28px', background: 'white', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FontAwesomeIcon icon={faHeartbeat} style={{ color: '#1D4ED8', fontSize: 16 }} />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: 0 }}>Health</h1>
            <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>
              {report ? `Last checked ${fmtTime(report.checkedAt)}` : 'Service status'}
            </p>
          </div>
        </div>
        <button
          onClick={() => void load(true)}
          disabled={refreshing}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}
        >
          <FontAwesomeIcon icon={refreshing ? faSpinner : faSyncAlt} spin={refreshing} style={{ fontSize: 12 }} />
          Refresh
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>

        {/* Overall status banner */}
        {!loading && report && (
          <div style={{
            padding: '14px 18px',
            borderRadius: 12,
            background: allUp ? '#F0FDF4' : anyDown ? '#FEF2F2' : '#FFFBEB',
            border: `1px solid ${allUp ? '#BBF7D0' : anyDown ? '#FECACA' : '#FDE68A'}`,
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <FontAwesomeIcon
              icon={allUp ? faCheckCircle : faTimesCircle}
              style={{ fontSize: 18, color: allUp ? '#16A34A' : '#DC2626' }}
            />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                {allUp ? 'All systems operational' : anyDown ? 'Some services are down' : 'Partial degradation'}
              </div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                {services.filter((s) => s.up).length} of {services.length} services healthy
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF', fontSize: 14 }}>
            Checking services…
          </div>
        ) : report ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {services.map((s) => <ServiceCard key={s.name} s={s} />)}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF', fontSize: 14 }}>
            Could not reach the backend. Is it running on port 9090?
          </div>
        )}
      </div>
    </div>
  );
}
