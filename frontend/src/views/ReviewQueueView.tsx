import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faShieldAlt, faSpinner, faCheckCircle, faBan, faClock,
  faChevronDown, faChevronUp, faInfoCircle,
  faChartBar, faListAlt, faTag, faPlus, faTrash, faLock,
  faBookOpen, faComments, faUser, faExclamationTriangle, faToggleOn, faToggleOff,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type {
  ReviewQueueItem, ReviewStatus, ReviewVerdict,
  OrgPolicyRule, OrgAclxPolicy, OrgPolicyRuleType,
} from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  CHAT_RESPONSE:      'Chat response',
  DOCUMENT_GENERATED: 'Generated document',
  SEARCH_SUMMARY:     'Search summary',
};

const SENSITIVITY_COLORS: Record<string, { bg: string; text: string }> = {
  HIGH:   { bg: '#fee2e2', text: '#991b1b' },
  MEDIUM: { bg: '#fef9c3', text: '#854d0e' },
  LOW:    { bg: '#f0fdf4', text: '#166534' },
};

/** §9: Authorization deny reason labels — surface to reviewers on flagged items. */
const AUTH_DENY_LABELS: Record<string, { label: string; action: string }> = {
  NOT_PROVIDED: {
    label: 'No authorization on file',
    action: 'Add the required authorization in the client\'s Authorizations tab to unblock.',
  },
  REVOKED: {
    label: 'Authorization was revoked',
    action: 'A previously valid authorization has been revoked. A new authorization is required.',
  },
  EXPIRED: {
    label: 'Authorization has expired',
    action: 'The authorization on file has passed its expiry date. Renew or replace it.',
  },
};

function fmtDate(iso?: string) {
  if (!iso) return '--';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Convert free text into a valid slug (lowercase, underscores, max 60 chars). */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);
}

function toInitials(name: string) {
  return name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function fmtRelative(iso: string) {
  const d   = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return `${diff}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Chat review types & stub data ─────────────────────────────────────────────

interface StubChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  aclxLabel?: string;
  aclxSensitivity?: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface StubChatSession {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  supervisorId?: string;   // set on RBT sessions — which BCBA supervises them
  clientId?: string;
  clientName?: string;
  projectId?: string;
  projectName?: string;
  topic: string;
  lastActivity: string;
  messages: StubChatMessage[];
  aclxLabels: string[];
}

const ACLX_LABEL_META: Record<string, { bg: string; text: string; label: string }> = {
  PHI_DETECTED:    { bg: '#fef3c7', text: '#92400e', label: 'PHI Detected'    },
  PII_DETECTED:    { bg: '#fee2e2', text: '#991b1b', label: 'PII Detected'    },
  BEHAVIORAL_DATA: { bg: '#ede9fe', text: '#5b21b6', label: 'Behavioral Data' },
  CLINICAL_NOTE:   { bg: '#e0f2fe', text: '#075985', label: 'Clinical Note'   },
};

const CHAT_USER_COLORS: Record<string, string> = {
  ORG_SUPER_ADMIN:   'Practice Administrator',
  CLINICAL_DIRECTOR: 'Clinical Director',
  ORG_ADMIN:         '#1d4ed8',
  SUPERVISING_BCBA:  'Clinical Supervisor',
  RBT:               'Behavior Technician',
};

const CHAT_ROLE_CHIP: Record<string, { bg: string; text: string }> = {
  ORG_SUPER_ADMIN:   { bg: '#ede9fe', text: '#6d28d9' },
  CLINICAL_DIRECTOR: { bg: '#ede9fe', text: '#6d28d9' },
  ORG_ADMIN:         { bg: '#fef3c7', text: '#92400e' },
  SUPERVISING_BCBA:  { bg: '#ede9fe', text: '#5b21b6' },
  RBT:               { bg: '#EEF7EA', text: '#3F9B2F' },
};

const CHAT_ROLE_LABELS: Record<string, string> = {
  ORG_SUPER_ADMIN:   'Practice Administrator',
  CLINICAL_DIRECTOR: 'Clinical Director',
  ORG_ADMIN:         'Practice Administrator',
  SUPERVISING_BCBA:  'Clinical Supervisor',
  RBT:               'Behavior Technician',
};

function statusChip(status: ReviewStatus) {
  if (status === 'PENDING') return (
    <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
      <FontAwesomeIcon icon={faClock} className="text-xs" /> Pending
    </span>
  );
  if (status === 'APPROVED') return (
    <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
      <FontAwesomeIcon icon={faCheckCircle} className="text-xs" /> Approved
    </span>
  );
  if (status === 'LOGGED') return (
    <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: '#e8f4f8', color: '#2a5f6f', border: '1px solid #b2dce8' }}>
      <FontAwesomeIcon icon={faBookOpen} className="text-xs" /> Logged
    </span>
  );
  return (
    <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
      <FontAwesomeIcon icon={faBan} className="text-xs" /> Denied
    </span>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────

type TabId = 'queue' | 'auditlog' | 'analytics' | 'chats';
type ChatGroupBy = 'all' | 'user' | 'client' | 'project';

export default function ReviewQueueView() {
  const { currentUser } = useAuth();
  const [items, setItems]             = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const [reviewRequired, setReviewRequired] = useState(true);
  const [tab, setTab]                 = useState<TabId>('auditlog');

  const orgId       = currentUser?.orgId ?? '';
  const currentRole = currentUser?.role  ?? '';
  const currentUid  = (currentUser as any)?.uid ?? currentUser?.id ?? '';

  const canViewChats = currentRole === 'ORG_SUPER_ADMIN'
                    || currentRole === 'CLINICAL_DIRECTOR'
                    || currentRole === 'ORG_ADMIN'
                    || currentRole === 'SUPERVISING_BCBA';

  const load = () => {
    setLoading(true);
    api.getReviewQueue()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  // Load review queue items + org's reviewRequired setting in parallel
  useEffect(() => {
    load();
    if (!orgId) return;
    api.getOrg(orgId)
      .then((o) => {
        const rr = o.settings?.reviewRequired !== false;
        setReviewRequired(rr);
        // Default to Review Queue when human review is on; Audit Log otherwise
        setTab(rr ? 'queue' : 'auditlog');
      })
      .catch(() => {});
  }, [orgId]);

  const pending  = items.filter((i) => i.status === 'PENDING');
  const history  = items.filter((i) => i.status === 'APPROVED' || i.status === 'DENIED');

  const handleReviewed = (updated: ReviewQueueItem) => {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  };

  const tabs = [
    // Review Queue tab only appears when Human Review is on
    ...(reviewRequired ? [{ id: 'queue' as TabId,    label: 'Review Queue',  icon: faListAlt,  count: pending.length }] : []),
    {                    id: 'auditlog' as TabId,     label: 'Audit Log',     icon: faBookOpen, count: null             },
    ...(canViewChats    ? [{ id: 'chats' as TabId,   label: 'Chat Review',   icon: faComments, count: null             }] : []),
    {                    id: 'analytics' as TabId,    label: 'Insights',      icon: faChartBar, count: null             },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-4 flex items-center gap-4">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: '#e8f4f8' }}
        >
          <FontAwesomeIcon icon={faShieldAlt} style={{ color: '#2a5f6f', fontSize: 16 }} />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Review</h1>
          <p className="text-xs text-gray-500">
            {reviewRequired
              ? 'Flagged content is held for review before being delivered.'
              : 'Human review is off — flagged items are logged for audit automatically.'}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {reviewRequired && pending.length > 0 && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500 text-white">
              {pending.length} pending
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-8 flex gap-0">
        {tabs.map(({ id, label, icon, count }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex items-center gap-2 px-4 pb-3 pt-3 text-sm font-medium transition-colors border-b-2"
            style={{
              borderBottomColor: tab === id ? '#2a5f6f' : 'transparent',
              color: tab === id ? '#2a5f6f' : '#6b7280',
            }}
          >
            <FontAwesomeIcon icon={icon} className="text-xs" />
            {label}
            {count !== null && count > 0 && (
              <span
                className="px-1.5 py-0.5 rounded-full text-xs font-bold"
                style={
                  id === 'aclx' && count > 0
                    ? { background: '#fef3c7', color: '#92400e' }
                    : id === 'auditlog' && count > 0
                    ? { background: '#e8f4f8', color: '#2a5f6f' }
                    : { background: '#f3f4f6', color: '#6b7280' }
                }
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Body — left-justified, no max-width centering */}
      {/* Chat Review gets its own flex layout so its two panels can scroll independently */}
      {tab === 'chats' ? (
        <div className="flex-1 overflow-hidden px-8 py-6">
          <ChatReviewTab currentUserId={currentUid} currentUserRole={currentRole} orgId={orgId} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <FontAwesomeIcon icon={faSpinner} className="animate-spin text-gray-400 text-2xl" />
            </div>
          ) : (
            <>
              {tab === 'queue'     && <ReviewQueueTab pending={pending} history={history} orgId={orgId} reviewRequired={reviewRequired} onReviewed={handleReviewed} />}
              {tab === 'auditlog'  && <AuditLogTab />}
              {tab === 'analytics' && <InsightsTab />}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Review Queue tab ─────────────────────────────────────────────────────────

function ReviewQueueTab({
  pending, history, orgId, onReviewed,
}: {
  pending: ReviewQueueItem[];
  history: ReviewQueueItem[];
  orgId: string;
  onReviewed: (item: ReviewQueueItem) => void;
}) {
  const [sub, setSub] = useState<'pending' | 'history'>('pending');

  return (
    <div>
      {/* Sub-navigation */}
      <div className="flex gap-1 mb-5">
        {([
          { id: 'pending' as const, label: 'Pending Review',   count: pending.length },
          { id: 'history' as const, label: 'Decision History', count: history.length },
        ]).map(({ id, label, count }) => (
          <button
            key={id}
            onClick={() => setSub(id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border"
            style={sub === id
              ? { background: '#2a5f6f', color: 'white', borderColor: '#2a5f6f' }
              : { background: 'white', color: '#6b7280', borderColor: '#e5e7eb' }
            }
          >
            {label}
            {count > 0 && (
              <span
                className="px-1.5 py-0.5 rounded-full text-xs font-bold"
                style={sub === id
                  ? { background: 'rgba(255,255,255,0.25)', color: 'white' }
                  : id === 'pending'
                  ? { background: '#fef3c7', color: '#92400e' }
                  : { background: '#f3f4f6', color: '#6b7280' }
                }
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {sub === 'pending' && <PendingTab items={pending} orgId={orgId} onReviewed={onReviewed} />}
      {sub === 'history' && <HistoryTab items={history} />}
    </div>
  );
}

// ── Pending tab ───────────────────────────────────────────────────────────────

function PendingTab({
  items, orgId, onReviewed,
}: {
  items: ReviewQueueItem[];
  orgId: string;
  onReviewed: (item: ReviewQueueItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <FontAwesomeIcon icon={faCheckCircle} className="text-5xl mb-4 text-green-300" />
        <p className="text-base font-medium">All clear</p>
        <p className="text-sm mt-1">No items are pending review.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Review each flagged AI output and approve or deny it. Decisions and notes
        are stored permanently as part of the compliance audit trail. You can
        optionally promote a decision to an org policy rule.
      </p>
      {items.map((item) => (
        <ReviewCard key={item.id} item={item} orgId={orgId} onReviewed={onReviewed} />
      ))}
    </div>
  );
}

// ── History tab ───────────────────────────────────────────────────────────────

function HistoryTab({ items }: { items: ReviewQueueItem[] }) {
  if (items.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-base font-medium">No decisions recorded yet</p>
        <p className="text-sm mt-1">Reviewed items will appear here.</p>
      </div>
    );
  }

  const sorted = [...items].sort(
    (a, b) => new Date(b.reviewedAt ?? b.createdAt).getTime()
            - new Date(a.reviewedAt ?? a.createdAt).getTime(),
  );

  return (
    <div className="space-y-3">
      {sorted.map((item) => (
        <HistoryCard key={item.id} item={item} />
      ))}
    </div>
  );
}

// ── Audit Log tab ─────────────────────────────────────────────────────────────

interface ComplianceEvent {
  id: string; eventType: string; timestamp: string; decision: string;
  sensitivity: string | null; contentId: string; policyVersion: string;
  redacted: number; synthesis: boolean; detectors: Array<{ detector: string; matched: boolean }>;
}

const DECISION_COLORS: Record<string, { bg: string; text: string }> = {
  ALLOW:    { bg: '#EEF7EA', text: '#166534' },
  REDACT:   { bg: '#fff7ed', text: '#92400e' },
  ESCALATE: { bg: '#fef3c7', text: '#92400e' },
  BLOCK:    { bg: '#fee2e2', text: '#991b1b' },
};

function AuditLogTab() {
  const [events, setEvents] = useState<ComplianceEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getComplianceEvents(30, 100)
      .then((r) => setEvents(r.events))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <FontAwesomeIcon icon={faSpinner} className="animate-spin text-2xl" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <FontAwesomeIcon icon={faBookOpen} className="text-5xl mb-4" style={{ color: '#b2dce8' }} />
        <p className="text-base font-medium">No audit events yet</p>
        <p className="text-sm mt-1 max-w-xs mx-auto leading-relaxed">
          Every AI response is labeled and recorded by ACLX. Events from the last 30 days appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl p-4 flex items-start gap-3"
        style={{ background: '#e8f4f8', border: '1px solid #b2dce8', color: '#1e4d5c' }}>
        <FontAwesomeIcon icon={faInfoCircle} className="mt-0.5 shrink-0" />
        <p className="text-xs leading-relaxed">
          Every AI response is evaluated by ACLX and recorded here — its decision, sensitivity, and any
          redactions. Showing the last 30 days.
        </p>
      </div>
      {events.map((e) => <ComplianceEventCard key={e.id} event={e} />)}
    </div>
  );
}

function ComplianceEventCard({ event }: { event: ComplianceEvent }) {
  const [expanded, setExpanded] = useState(false);
  const dc = DECISION_COLORS[event.decision] ?? { bg: '#f3f4f6', text: '#374151' };
  const sc = SENSITIVITY_COLORS[event.sensitivity ?? ''] ?? { bg: '#f3f4f6', text: '#374151' };
  const matched = (event.detectors ?? []).filter((d) => d.matched);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-4 flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold text-gray-800">{EVENT_LABELS[event.eventType] ?? event.eventType}</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: dc.bg, color: dc.text }}>{event.decision}</span>
            {event.sensitivity && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: sc.bg, color: sc.text }}>{event.sensitivity}</span>
            )}
            {event.synthesis && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#ede9fe', color: '#6d28d9' }}>cross-client</span>
            )}
            {event.redacted > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#fff7ed', color: '#92400e' }}>{event.redacted} redacted</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">{fmtDate(event.timestamp)} · policy {event.policyVersion || '—'}</p>
        </div>
        <button onClick={() => setExpanded((v) => !v)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 shrink-0">
          <FontAwesomeIcon icon={expanded ? faChevronUp : faChevronDown} className="text-sm" />
        </button>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 text-xs text-gray-500 space-y-1">
          <p><span className="font-medium text-gray-600">Content ID:</span> {event.contentId || '—'}</p>
          <p><span className="font-medium text-gray-600">Detectors fired:</span> {matched.length ? matched.map((d) => d.detector).join(', ') : 'none'}</p>
        </div>
      )}
    </div>
  );
}

// ── Insights tab ──────────────────────────────────────────────────────────────

interface ComplianceSummary {
  periodDays: number;
  totalEvents: number;
  decisionCounts: Record<string, number>;
  eventTypeCounts: Record<string, number>;
  topDetectors: Record<string, number>;
  synthesisEvents: number;
  totalRedactions: number;
  latestPolicyVersion: string | null;
  recentEscalations: Array<{ eventType: string; timestamp: string; sensitivity: string | null; contentId: string; synthesis: boolean }>;
}

function InsightsTab() {
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getComplianceSummary(30)
      .then(setSummary)
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <FontAwesomeIcon icon={faSpinner} className="animate-spin text-2xl" />
      </div>
    );
  }

  if (!summary || summary.totalEvents === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <FontAwesomeIcon icon={faChartBar} className="text-5xl mb-4" style={{ color: '#b2dce8' }} />
        <p className="text-base font-medium">No activity to analyze yet</p>
        <p className="text-sm mt-1 max-w-xs mx-auto leading-relaxed">
          Insights are built from the last 30 days of ACLX-evaluated AI activity. They'll appear once your team starts using the AI.
        </p>
      </div>
    );
  }

  const d = summary.decisionCounts ?? {};
  const cards: Array<{ label: string; value: number; bg: string; color: string }> = [
    { label: 'Total Responses', value: summary.totalEvents,   bg: '#f9fafb', color: '#1f2937' },
    { label: 'Allowed',         value: d.ALLOW ?? 0,          bg: '#EEF7EA', color: '#166534' },
    { label: 'Escalated',       value: d.ESCALATE ?? 0,       bg: '#fef3c7', color: '#92400e' },
    { label: 'Blocked',         value: d.BLOCK ?? 0,          bg: '#fee2e2', color: '#991b1b' },
    { label: 'Redactions',      value: summary.totalRedactions, bg: '#fff7ed', color: '#9a3412' },
    { label: 'Cross-client',    value: summary.synthesisEvents, bg: '#ede9fe', color: '#6d28d9' },
  ];

  const topDetectors = Object.entries(summary.topDetectors ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxDet = topDetectors[0]?.[1] ?? 1;

  return (
    <div className="space-y-5 max-w-2xl">
      <p className="text-xs text-gray-400">Last {summary.periodDays} days · policy {summary.latestPolicyVersion ?? '—'}</p>

      {/* Metric cards */}
      <div className="grid grid-cols-3 gap-3">
        {cards.map(({ label, value, bg, color }) => (
          <div key={label} className="rounded-xl border border-gray-200 p-4" style={{ background: bg }}>
            <div className="text-2xl font-bold" style={{ color }}>{value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Top detectors */}
      {topDetectors.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h4 className="text-sm font-semibold text-gray-700">Top detectors fired</h4>
          </div>
          <div className="p-5 space-y-3">
            {topDetectors.map(([name, count]) => (
              <div key={name} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-40 shrink-0 truncate">{name}</span>
                <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(6, (count / maxDet) * 100)}%`, background: '#2a5f6f' }} />
                </div>
                <span className="text-xs font-semibold text-gray-700 w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent escalations */}
      {summary.recentEscalations.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h4 className="text-sm font-semibold text-gray-700">Recent escalations</h4>
          </div>
          <div className="divide-y divide-gray-50">
            {summary.recentEscalations.map((e, i) => (
              <div key={i} className="px-5 py-3 flex items-center gap-3">
                <FontAwesomeIcon icon={faExclamationTriangle} style={{ color: '#d97706', fontSize: 13 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">{EVENT_LABELS[e.eventType] ?? e.eventType}</p>
                  <p className="text-xs text-gray-400">{fmtDate(e.timestamp)}{e.synthesis ? ' · cross-client' : ''}</p>
                </div>
                {e.sensitivity && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold shrink-0"
                    style={SENSITIVITY_COLORS[e.sensitivity] ?? { background: '#f3f4f6', color: '#374151' }}>
                    {e.sensitivity}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Org Policy tab ────────────────────────────────────────────────────────────

export function OrgPolicyTab({ orgId }: { orgId: string }) {
  const [policy, setPolicy]   = useState<OrgAclxPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  // Add-rule form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addType, setAddType]         = useState<OrgPolicyRuleType>('BLOCK');
  const [addDesc, setAddDesc]         = useState('');
  const [addSaving, setAddSaving]     = useState(false);
  const [addError, setAddError]       = useState('');

  // Output rule: prefer client display/preferred names in generated content
  const [preferNames, setPreferNames] = useState(false);
  const [savingNames, setSavingNames] = useState(false);
  useEffect(() => {
    if (!orgId) return;
    api.getOrg(orgId).then((o) => setPreferNames(o.settings?.preferClientDisplayName ?? false)).catch(() => {});
  }, [orgId]);
  const toggleNames = async () => {
    const next = !preferNames;
    setPreferNames(next); setSavingNames(true);
    try { await api.updateOrgSettings(orgId, { preferClientDisplayName: next }); }
    catch { setPreferNames(!next); }
    finally { setSavingNames(false); }
  };

  const loadPolicy = () => {
    if (!orgId) return;
    setLoading(true);
    api.getOrgAclxPolicy(orgId)
      .then(setPolicy)
      .catch(() => setError('Failed to load content rules.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadPolicy(); }, [orgId]);

  const handleDelete = async (ruleId: string) => {
    try {
      await api.deleteOrgPolicyRule(orgId, ruleId);
      loadPolicy();
    } catch {
      setError('Failed to remove rule.');
    }
  };

  const handleAddRule = async () => {
    const desc = addDesc.trim();
    if (!desc) { setAddError('A description is required.'); return; }
    const slug = slugify(desc);
    if (!slug) { setAddError('Description must contain at least one letter or number.'); return; }
    setAddSaving(true); setAddError('');
    try {
      await api.addOrgPolicyRule(orgId, { type: addType, slug, description: desc });
      setShowAddForm(false);
      setAddDesc('');
      loadPolicy();
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : 'Failed to save rule.');
    } finally { setAddSaving(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <FontAwesomeIcon icon={faSpinner} className="animate-spin text-gray-400 text-2xl" />
    </div>
  );

  const allowRules = policy?.allowRules ?? [];
  const blockRules = policy?.blockRules ?? [];
  const totalRules = allowRules.length + blockRules.length;

  return (
    <div className="max-w-3xl space-y-6">
      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Page header */}
      <div>
        <h2 className="text-base font-semibold text-gray-800">Content Governance Rules</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Define what content is always permitted or always restricted for your organization,
          beyond the default compliance baseline. Rules can be added manually or promoted
          from a review decision.
        </p>
      </div>

      {/* Output formatting rules */}
      <div>
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Output Formatting</h3>
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-800">Use client preferred names in output</p>
            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
              When on, generated chats and documents always refer to a client by their preferred/display
              name and never their legal name — enforced by both a model instruction and a deterministic
              rewrite pass before the response is shown.
            </p>
          </div>
          <button
            onClick={toggleNames}
            disabled={savingNames}
            className="shrink-0 transition-colors disabled:opacity-50"
            style={{ color: preferNames ? '#3F9B2F' : '#d1d5db' }}
            title={preferNames ? 'Disable' : 'Enable'}
          >
            <FontAwesomeIcon icon={preferNames ? faToggleOn : faToggleOff} style={{ fontSize: 28 }} />
          </button>
        </div>
      </div>

      {/* Rule list */}
      {totalRules === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-14 text-center">
          <FontAwesomeIcon icon={faTag} className="text-3xl text-gray-200 mb-3" />
          <p className="text-sm font-medium text-gray-500">No rules yet</p>
          <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
            Add an exception or a restriction below. Rules can also be promoted
            directly from a reviewed item.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {[
            ...allowRules.map((r) => ({ ...r, type: 'ALLOW' as OrgPolicyRuleType })),
            ...blockRules.map((r) => ({ ...r, type: 'BLOCK' as OrgPolicyRuleType })),
          ]
            .sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? ''))
            .map((rule) => {
              const isAllow = rule.type === 'ALLOW';
              return (
                <div
                  key={rule.id}
                  className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-start gap-4"
                >
                  {/* Type pill */}
                  <span
                    className="mt-0.5 shrink-0 text-xs font-bold px-2 py-0.5 rounded-full"
                    style={isAllow
                      ? { background: '#dcfce7', color: '#15803d' }
                      : { background: '#fee2e2', color: '#b91c1c' }}
                  >
                    {isAllow ? 'Approved' : 'Restricted'}
                  </span>

                  {/* Description */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 leading-snug">{rule.description}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs text-gray-400">Added {fmtDate(rule.addedAt)}</span>
                      {rule.sourceReviewItemId && (
                        <span className="text-xs text-gray-400 italic">· promoted from review</span>
                      )}
                    </div>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 shrink-0 transition-colors"
                    title="Remove rule"
                  >
                    <FontAwesomeIcon icon={faTrash} style={{ fontSize: 11 }} />
                  </button>
                </div>
              );
            })}
        </div>
      )}

      {/* Add rule */}
      {showAddForm ? (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">New Rule</h3>

          {/* Type toggle */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Rule type
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setAddType('ALLOW')}
                className="flex-1 py-2.5 rounded-lg border-2 text-sm font-semibold transition-colors"
                style={addType === 'ALLOW'
                  ? { borderColor: '#16a34a', background: '#f0fdf4', color: '#15803d' }
                  : { borderColor: '#e5e7eb', background: 'white', color: '#6b7280' }}
              >
                ✓ &nbsp;Approved exception
              </button>
              <button
                onClick={() => setAddType('BLOCK')}
                className="flex-1 py-2.5 rounded-lg border-2 text-sm font-semibold transition-colors"
                style={addType === 'BLOCK'
                  ? { borderColor: '#dc2626', background: '#fef2f2', color: '#b91c1c' }
                  : { borderColor: '#e5e7eb', background: 'white', color: '#6b7280' }}
              >
                ✕ &nbsp;Restricted topic
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {addType === 'ALLOW'
                ? 'This content pattern is approved for use in your organization and should not be flagged.'
                : 'This content pattern should always be blocked, regardless of context.'}
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Description
            </label>
            <textarea
              autoFocus
              rows={3}
              value={addDesc}
              onChange={(e) => { setAddDesc(e.target.value); setAddError(''); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              placeholder={addType === 'ALLOW'
                ? 'e.g. Progress session data without direct client name references is approved for clinical notes.'
                : 'e.g. Social security numbers must never appear in any AI output.'}
            />
            {addDesc.trim() && (
              <p className="text-xs text-gray-400 mt-1">
                Rule ID: <code className="font-mono">{slugify(addDesc) || '—'}</code>
              </p>
            )}
          </div>

          {addError && <p className="text-xs text-red-500">{addError}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAddRule}
              disabled={addSaving}
              className="px-5 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50"
              style={{ background: '#2a5f6f' }}
            >
              {addSaving ? 'Saving…' : 'Save Rule'}
            </button>
            <button
              onClick={() => { setShowAddForm(false); setAddDesc(''); setAddError(''); }}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-semibold"
          style={{ background: '#2a5f6f' }}
        >
          <FontAwesomeIcon icon={faPlus} style={{ fontSize: 11 }} />
          Add Rule
        </button>
      )}
    </div>
  );
}

// ── Review card (pending) ─────────────────────────────────────────────────────

function ReviewCard({
  item, orgId, onReviewed,
}: {
  item: ReviewQueueItem;
  orgId: string;
  onReviewed: (updated: ReviewQueueItem) => void;
}) {
  const [expanded, setExpanded]   = useState(false);
  const [verdict, setVerdict]     = useState<ReviewVerdict | ''>('');
  const [notes, setNotes]         = useState('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [submitted, setSubmitted] = useState(false);

  // "Promote to Rule" state (shown after a verdict is submitted)
  const [showPromote, setShowPromote]   = useState(false);
  const [promoteType, setPromoteType]   = useState<OrgPolicyRuleType>('BLOCK');
  const [promoteSlug, setPromoteSlug]   = useState('');
  const [promoteDesc, setPromoteDesc]   = useState('');
  const [promoting, setPromoting]       = useState(false);
  const [promoted, setPromoted]         = useState(false);
  const [promoteError, setPromoteError] = useState('');

  const sensColors = SENSITIVITY_COLORS[item.aclxSensitivity ?? ''] ?? { bg: '#f3f4f6', text: '#374151' };

  const handleSubmit = async () => {
    if (!verdict) { setError('Select a verdict to continue.'); return; }
    setSaving(true); setError('');
    try {
      const updated = await api.submitReview(item.id, verdict, notes);
      onReviewed(updated);
      setSubmitted(true);
      // Pre-fill promote form based on verdict
      const ruleType: OrgPolicyRuleType = verdict === 'APPROVED' ? 'ALLOW' : 'BLOCK';
      setPromoteType(ruleType);
      setPromoteSlug(slugify(item.aclxReason?.split('.')[0] ?? ''));
      setPromoteDesc(item.aclxReason ?? '');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submission failed.');
    } finally { setSaving(false); }
  };

  const handlePromote = async () => {
    if (!promoteSlug.trim()) { setPromoteError('Slug is required.'); return; }
    if (!promoteDesc.trim()) { setPromoteError('Description is required.'); return; }
    setPromoting(true); setPromoteError('');
    try {
      await api.addOrgPolicyRule(orgId, {
        type: promoteType,
        slug: promoteSlug.trim(),
        description: promoteDesc.trim(),
        sourceReviewItemId: item.id,
      });
      setPromoted(true);
      setShowPromote(false);
    } catch (e: unknown) {
      setPromoteError(e instanceof Error ? e.message : 'Failed to create rule.');
    } finally { setPromoting(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Summary row */}
      <div className="p-4 flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold text-gray-800">
              {EVENT_LABELS[item.eventType] ?? item.eventType}
            </span>
            {statusChip(item.status)}
            {item.aclxSensitivity && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{ background: sensColors.bg, color: sensColors.text }}>
                {item.aclxSensitivity} sensitivity
              </span>
            )}
          </div>
          {item.aclxReason && (
            <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
              <span className="font-medium text-gray-600">ACLX: </span>{item.aclxReason}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-1">Flagged {fmtDate(item.createdAt)}</p>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 shrink-0"
        >
          <FontAwesomeIcon icon={expanded ? faChevronUp : faChevronDown} className="text-sm" />
        </button>
      </div>

      {/* Expanded: raw content + review form */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-4 bg-gray-50">
          {/* Flagged content */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Flagged AI Output
            </p>
            <pre className="text-xs text-gray-700 bg-white border border-gray-200 rounded-lg p-3 whitespace-pre-wrap font-mono leading-relaxed max-h-52 overflow-y-auto">
              {item.rawContent}
            </pre>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-gray-400 font-medium">Content type: </span>
              <span className="text-gray-700">{EVENT_LABELS[item.eventType]}</span>
            </div>
            <div>
              <span className="text-gray-400 font-medium">ACLX category: </span>
              <span className="text-gray-700">{item.aclxCategory ?? '--'}</span>
            </div>
            {item.clientId && (
              <div>
                <span className="text-gray-400 font-medium">Client ID: </span>
                <span className="text-gray-700 font-mono">{item.clientId}</span>
              </div>
            )}
            <div>
              <span className="text-gray-400 font-medium">Content ID: </span>
              <span className="text-gray-700 font-mono truncate">{item.contentId}</span>
            </div>
          </div>

          {/* §9: Authorization deny reason — shown when an auth check failed */}
          {item.authDenyReason && AUTH_DENY_LABELS[item.authDenyReason] && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <FontAwesomeIcon icon={faLock} className="text-amber-500 mt-0.5 shrink-0 text-sm" />
              <div>
                <p className="text-xs font-semibold text-amber-800">
                  Authorization check failed: {AUTH_DENY_LABELS[item.authDenyReason].label}
                </p>
                <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                  {AUTH_DENY_LABELS[item.authDenyReason].action}
                </p>
              </div>
            </div>
          )}

          {/* Review form — shown before submit */}
          {!submitted && (
            <div className="border-t border-gray-200 pt-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Your Decision
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setVerdict('APPROVED')}
                  className="flex-1 py-2.5 rounded-lg border-2 text-sm font-semibold transition-colors"
                  style={
                    verdict === 'APPROVED'
                      ? { borderColor: '#16a34a', background: '#f0fdf4', color: '#16a34a' }
                      : { borderColor: '#e5e7eb', background: 'white', color: '#6b7280' }
                  }
                >
                  <FontAwesomeIcon icon={faCheckCircle} className="mr-2" />
                  Approve
                </button>
                <button
                  onClick={() => setVerdict('DENIED')}
                  className="flex-1 py-2.5 rounded-lg border-2 text-sm font-semibold transition-colors"
                  style={
                    verdict === 'DENIED'
                      ? { borderColor: '#dc2626', background: '#fef2f2', color: '#dc2626' }
                      : { borderColor: '#e5e7eb', background: 'white', color: '#6b7280' }
                  }
                >
                  <FontAwesomeIcon icon={faBan} className="mr-2" />
                  Deny
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Reviewer Notes
                  <span className="normal-case font-normal text-gray-400 ml-1">
                    (recommended)
                  </span>
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                  placeholder="Explain your decision and note any policy adjustments recommended..."
                />
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <button
                onClick={handleSubmit}
                disabled={saving || !verdict}
                className="w-full py-2.5 rounded-lg text-white text-sm font-semibold transition-opacity disabled:opacity-50"
                style={{ background: verdict === 'APPROVED' ? '#16a34a' : verdict === 'DENIED' ? '#dc2626' : '#9ca3af' }}
              >
                {saving ? (
                  <><FontAwesomeIcon icon={faSpinner} className="animate-spin mr-2" />Submitting...</>
                ) : (
                  verdict ? `Submit ${verdict}` : 'Select a verdict'
                )}
              </button>
            </div>
          )}

          {/* Post-verdict: promote to rule */}
          {submitted && (
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center gap-2 mb-2">
                <FontAwesomeIcon icon={faCheckCircle} className="text-green-500" />
                <p className="text-sm font-semibold text-gray-700">Decision submitted</p>
              </div>

              {promoted ? (
                <div className="flex items-center gap-2 text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
                  <FontAwesomeIcon icon={faTag} />
                  Policy rule created and will be applied to future ACLX evaluations.
                </div>
              ) : !showPromote ? (
                <div className="flex items-center justify-between bg-gray-100 rounded-lg px-4 py-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-600">Promote to Org Policy Rule?</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Add a {verdict === 'APPROVED' ? 'ALLOW' : 'BLOCK'} rule so ACLX learns from this decision.
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setShowPromote(true)}
                      className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
                      style={{ background: '#2a5f6f' }}
                    >
                      <FontAwesomeIcon icon={faTag} className="mr-1.5" />
                      Promote
                    </button>
                    <button
                      onClick={() => setExpanded(false)}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs text-gray-500 hover:bg-gray-50"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 bg-white border border-gray-200 rounded-lg p-4">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Create Policy Rule</p>

                  <div className="flex gap-2">
                    {(['ALLOW', 'BLOCK'] as OrgPolicyRuleType[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setPromoteType(t)}
                        className="flex-1 py-2 rounded-lg border-2 text-xs font-semibold transition-colors"
                        style={promoteType === t
                          ? t === 'ALLOW'
                            ? { borderColor: '#16a34a', background: '#f0fdf4', color: '#16a34a' }
                            : { borderColor: '#dc2626', background: '#fef2f2', color: '#dc2626' }
                          : { borderColor: '#e5e7eb', background: 'white', color: '#6b7280' }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">
                      Slug <span className="font-normal text-gray-400">(no spaces)</span>
                    </label>
                    <input
                      type="text"
                      value={promoteSlug}
                      onChange={(e) => setPromoteSlug(slugify(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
                    <textarea
                      rows={2}
                      value={promoteDesc}
                      onChange={(e) => setPromoteDesc(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>

                  {promoteError && <p className="text-xs text-red-500">{promoteError}</p>}

                  <div className="flex gap-2">
                    <button
                      onClick={handlePromote}
                      disabled={promoting}
                      className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50"
                      style={{ background: '#2a5f6f' }}
                    >
                      {promoting ? 'Saving...' : 'Save Rule'}
                    </button>
                    <button
                      onClick={() => { setShowPromote(false); setPromoteError(''); }}
                      className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Chat Review tab ───────────────────────────────────────────────────────────

function ChatReviewTab({
  currentUserId,
  currentUserRole,
  orgId,
}: {
  currentUserId: string;
  currentUserRole: string;
  orgId: string;
}) {
  void currentUserId; void currentUserRole; // access scoping is enforced server-side by getChats
  const [selectedSession, setSelectedSession] = useState<StubChatSession | null>(null);
  const [groupBy, setGroupBy] = useState<ChatGroupBy>('all');
  const [sessions, setSessions] = useState<StubChatSession[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Load real chats for review. getChats() returns org-wide chats for admins/
  // Clinical Directors and the caller's own chats otherwise (scoped server-side).
  // Member + client lookups resolve display names that aren't denormalized on chats.
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.getChats(),
      api.getOrgMembers(orgId).catch(() => []),
      api.getClients().catch(() => []),
    ]).then(([chats, members, clients]) => {
      if (cancelled) return;
      const memberById = new Map(members.map((m) => [m.id, m]));
      const clientById = new Map(clients.map((c) => [c.id, c]));
      const built: StubChatSession[] = chats.map((c) => {
        const m = memberById.get(c.createdBy);
        const cl = c.clientId ? clientById.get(c.clientId) : undefined;
        const clientName = cl
          ? (cl.preferredName || [cl.firstName, cl.lastName].filter(Boolean).join(' ') || cl.legalName || c.clientId)
          : undefined;
        return {
          id: c.id,
          userId: c.createdBy,
          userName: m?.displayName || c.createdBy,
          userRole: m?.role || '',
          clientId: c.clientId || undefined,
          clientName,
          projectId: c.projectId || undefined,
          projectName: c.projectLabel || undefined,
          topic: c.title || 'Untitled conversation',
          lastActivity: c.updatedAt || c.createdAt || '',
          messages: [],
          aclxLabels: [],
        };
      });
      setSessions(built);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId]);

  // Lazy-load a conversation's messages when selected.
  const handleSelect = (session: StubChatSession) => {
    setSelectedSession({ ...session });
    if (session.messages.length > 0) return;
    setLoadingMessages(true);
    api.getChatMessages(session.id)
      .then((msgs) => {
        const mapped: StubChatMessage[] = msgs.map((mm) => ({
          id: mm.id,
          role: mm.role,
          content: mm.content,
          timestamp: mm.timestamp ?? mm.createdAt ?? '',
          aclxSensitivity: (mm.aclxLabel?.sensitivity as 'HIGH' | 'MEDIUM' | 'LOW' | undefined),
        }));
        setSelectedSession((prev) => prev && prev.id === session.id ? { ...prev, messages: mapped } : prev);
      })
      .catch(() => {})
      .finally(() => setLoadingMessages(false));
  };

  const visibleSessions = sessions;

  // Group sessions by the selected dimension
  type GroupEntry = { key: string; label: string; sessions: StubChatSession[] };
  const grouped: GroupEntry[] = (() => {
    const sorted = [...visibleSessions].sort(
      (a, b) => b.lastActivity.localeCompare(a.lastActivity),
    );
    if (groupBy === 'all') {
      return [{ key: 'all', label: 'All Conversations', sessions: sorted }];
    }
    if (groupBy === 'user') {
      const map: Record<string, StubChatSession[]> = {};
      sorted.forEach((s) => { (map[s.userId] = map[s.userId] ?? []).push(s); });
      return Object.entries(map).map(([, sessions]) => ({
        key: sessions[0].userId,
        label: sessions[0].userName,
        sessions,
      }));
    }
    if (groupBy === 'client') {
      const map: Record<string, StubChatSession[]> = {};
      sorted.forEach((s) => {
        const k = s.clientId ?? '__none';
        (map[k] = map[k] ?? []).push(s);
      });
      return Object.entries(map).map(([k, sessions]) => ({
        key: k,
        label: k === '__none' ? 'No Client' : (sessions[0].clientName ?? k),
        sessions,
      }));
    }
    // project
    const map: Record<string, StubChatSession[]> = {};
    sorted.forEach((s) => {
      const k = s.projectId ?? '__none';
      (map[k] = map[k] ?? []).push(s);
    });
    return Object.entries(map).map(([k, sessions]) => ({
      key: k,
      label: k === '__none' ? 'No Project' : (sessions[0].projectName ?? k),
      sessions,
    }));
  })();

  return (
    <div className="flex gap-5 h-full">

      {/* ── Left panel: session list ── */}
      <div
        className="w-72 shrink-0 flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden"
        style={{ height: 'calc(100vh - 230px)' }}
      >
        {/* Group-by filter */}
        <div className="p-2.5 border-b border-gray-100 shrink-0">
          <div className="flex gap-1">
            {(['all', 'user', 'client', 'project'] as const).map((id) => (
              <button
                key={id}
                onClick={() => setGroupBy(id)}
                className="flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors"
                style={groupBy === id
                  ? { background: '#2a5f6f', color: 'white' }
                  : { background: '#f3f4f6', color: '#6b7280' }}
              >
                {id === 'all' ? 'All' : id.charAt(0).toUpperCase() + id.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-2 text-gray-400">
              <FontAwesomeIcon icon={faSpinner} className="text-2xl animate-spin text-gray-300" />
              <p className="text-sm font-medium">Loading conversations…</p>
            </div>
          ) : visibleSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-2 text-gray-400">
              <FontAwesomeIcon icon={faComments} className="text-4xl text-gray-200" />
              <p className="text-sm font-medium">No conversations to review</p>
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.key}>
                {groupBy !== 'all' && (
                  <div
                    className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide sticky top-0 z-10"
                    style={{ background: '#f9fafb', color: '#9ca3af', borderBottom: '1px solid #f3f4f6' }}
                  >
                    {group.label}
                  </div>
                )}
                {group.sessions.map((session) => (
                  <ChatSessionItem
                    key={session.id}
                    session={session}
                    selected={selectedSession?.id === session.id}
                    groupBy={groupBy}
                    onClick={() => handleSelect(session)}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Right panel: conversation detail ── */}
      <div
        className="flex-1 flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden"
        style={{ height: 'calc(100vh - 230px)' }}
      >
        {selectedSession ? (
          <ChatSessionDetail session={selectedSession} loadingMessages={loadingMessages} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3 px-8">
            <FontAwesomeIcon icon={faComments} className="text-5xl text-gray-200" />
            <p className="text-base font-medium text-gray-500">Select a conversation</p>
            <p className="text-sm text-center leading-relaxed">
              Choose a session from the list to review the conversation thread, ACLX labels,
              and clinical context.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Chat session list item ────────────────────────────────────────────────────

function ChatSessionItem({
  session, selected, groupBy, onClick,
}: {
  session: StubChatSession;
  selected: boolean;
  groupBy: ChatGroupBy;
  onClick: () => void;
}) {
  const avatarColor = CHAT_USER_COLORS[session.userRole] ?? '#6b7280';
  const roleChip    = CHAT_ROLE_CHIP[session.userRole] ?? { bg: '#f3f4f6', text: '#374151' };

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-3 flex items-start gap-2.5 transition-colors"
      style={{
        borderBottom: '1px solid #f3f4f6',
        background: selected ? '#f0f9fb' : 'white',
        borderLeft: selected ? '3px solid #2a5f6f' : '3px solid transparent',
      }}
    >
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5"
        style={{ background: avatarColor }}
      >
        {toInitials(session.userName)}
      </div>

      <div className="flex-1 min-w-0">
        {/* Name + role */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-gray-800 truncate">{session.userName}</span>
          <span
            className="text-xs px-1.5 py-0 rounded font-medium shrink-0 leading-5"
            style={{ background: roleChip.bg, color: roleChip.text }}
          >
            {CHAT_ROLE_LABELS[session.userRole] ?? session.userRole}
          </span>
        </div>

        {/* Topic */}
        <p className="text-xs text-gray-600 truncate mt-0.5">{session.topic}</p>

        {/* Client / project context (hide in the matching group-by mode to avoid duplication) */}
        {groupBy !== 'client' && session.clientName && (
          <p className="text-xs text-gray-400 truncate">Client: {session.clientName}</p>
        )}
        {groupBy !== 'project' && session.projectName && (
          <p className="text-xs text-gray-400 truncate">Project: {session.projectName}</p>
        )}

        {/* Time + ACLX badges */}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className="text-xs text-gray-400">{fmtRelative(session.lastActivity)}</span>
          {session.aclxLabels.map((lbl) => {
            const meta = ACLX_LABEL_META[lbl];
            if (!meta) return null;
            return (
              <span key={lbl} className="text-xs px-1.5 rounded font-semibold leading-5"
                style={{ background: meta.bg, color: meta.text }}>
                {meta.label}
              </span>
            );
          })}
        </div>
      </div>
    </button>
  );
}

// ── Chat session detail ───────────────────────────────────────────────────────

function ChatSessionDetail({ session, loadingMessages }: { session: StubChatSession; loadingMessages: boolean }) {
  const avatarColor = CHAT_USER_COLORS[session.userRole] ?? '#6b7280';
  const roleChip    = CHAT_ROLE_CHIP[session.userRole] ?? { bg: '#f3f4f6', text: '#374151' };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 shrink-0 bg-white">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
            style={{ background: avatarColor }}
          >
            {toInitials(session.userName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900">{session.userName}</span>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: roleChip.bg, color: roleChip.text }}
              >
                {CHAT_ROLE_LABELS[session.userRole] ?? session.userRole}
              </span>
              {session.clientName && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  Client: {session.clientName}
                </span>
              )}
              {session.projectName && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  Project: {session.projectName}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{session.topic}</p>
          </div>
        </div>

        {/* ACLX label strip */}
        {session.aclxLabels.length > 0 && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-400">ACLX labels:</span>
            {session.aclxLabels.map((lbl) => {
              const meta = ACLX_LABEL_META[lbl];
              if (!meta) return null;
              return (
                <span key={lbl}
                  className="text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: meta.bg, color: meta.text }}
                >
                  {meta.label}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-gray-50">
        {loadingMessages && session.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
            <FontAwesomeIcon icon={faSpinner} className="text-2xl animate-spin text-gray-300" />
            <p className="text-sm">Loading messages…</p>
          </div>
        ) : session.messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            No messages in this conversation yet.
          </div>
        ) : (
          session.messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Chat bubble ───────────────────────────────────────────────────────────────

function ChatBubble({ message }: { message: StubChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>

      {/* Avatar */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mb-0.5"
        style={{ background: isUser ? '#DCE7EE' : '#e8f4f8' }}
      >
        {isUser
          ? <FontAwesomeIcon icon={faUser} style={{ fontSize: 11, color: '#2a5f6f' }} />
          : <span className="text-xs font-bold" style={{ color: '#2a5f6f' }}>AI</span>
        }
      </div>

      <div className={`max-w-[78%] space-y-1`}>
        {/* Bubble */}
        <div
          className="px-4 py-3 text-sm leading-relaxed"
          style={isUser
            ? { background: '#f3f4f6', color: '#111827', borderRadius: '18px 18px 4px 18px' }
            : { background: 'white',   color: '#111827', border: '1px solid #e5e7eb', borderRadius: '18px 18px 18px 4px' }
          }
        >
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{message.content}</pre>
        </div>

        {/* Meta: timestamp + ACLX labels */}
        <div className={`flex items-center gap-2 flex-wrap ${isUser ? 'justify-end' : 'justify-start'}`}>
          <span className="text-xs text-gray-400">{fmtTime(message.timestamp)}</span>
          {message.aclxLabel && ACLX_LABEL_META[message.aclxLabel] && (() => {
            const meta = ACLX_LABEL_META[message.aclxLabel!]!;
            return (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ background: meta.bg, color: meta.text }}>
                {meta.label}
              </span>
            );
          })()}
          {message.aclxSensitivity && (() => {
            const sc = SENSITIVITY_COLORS[message.aclxSensitivity!] ?? { bg: '#f3f4f6', text: '#374151' };
            return (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ background: sc.bg, color: sc.text }}>
                {message.aclxSensitivity}
              </span>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ── History card ──────────────────────────────────────────────────────────────

function HistoryCard({ item }: { item: ReviewQueueItem }) {
  const [expanded, setExpanded] = useState(false);
  const sensColors = SENSITIVITY_COLORS[item.aclxSensitivity ?? ''] ?? { bg: '#f3f4f6', text: '#374151' };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-4 flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold text-gray-800">
              {EVENT_LABELS[item.eventType] ?? item.eventType}
            </span>
            {statusChip(item.status)}
            {item.aclxSensitivity && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{ background: sensColors.bg, color: sensColors.text }}>
                {item.aclxSensitivity}
              </span>
            )}
          </div>
          {item.reviewerNotes && (
            <p className="text-xs text-gray-500 line-clamp-1 italic">"{item.reviewerNotes}"</p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            Reviewed {fmtDate(item.reviewedAt)} &middot; Flagged {fmtDate(item.createdAt)}
          </p>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 shrink-0"
        >
          <FontAwesomeIcon icon={expanded ? faChevronUp : faChevronDown} className="text-sm" />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-3 bg-gray-50">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Flagged Output</p>
            <pre className="text-xs text-gray-700 bg-white border border-gray-200 rounded-lg p-3 whitespace-pre-wrap font-mono leading-relaxed max-h-40 overflow-y-auto">
              {item.rawContent}
            </pre>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-gray-400 font-medium">ACLX reason: </span>
              <span className="text-gray-700">{item.aclxReason ?? '--'}</span>
            </div>
            <div>
              <span className="text-gray-400 font-medium">Reviewed by: </span>
              <span className="text-gray-700 font-mono">{item.reviewedBy ?? '--'}</span>
            </div>
            {item.authDenyReason && (
              <div className="col-span-2">
                <span className="text-gray-400 font-medium">Auth check result: </span>
                <span className="text-amber-700 font-semibold">
                  {AUTH_DENY_LABELS[item.authDenyReason]?.label ?? item.authDenyReason}
                </span>
              </div>
            )}
          </div>
          {item.reviewerNotes && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm text-gray-700 leading-relaxed">{item.reviewerNotes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
