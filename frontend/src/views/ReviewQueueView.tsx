import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faShieldAlt, faSpinner, faCheckCircle, faBan, faClock,
  faChevronDown, faChevronUp, faInfoCircle,
  faChartBar, faListAlt, faTag, faPlus, faTrash, faLock,
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
  return (
    <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
      <FontAwesomeIcon icon={faBan} className="text-xs" /> Denied
    </span>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────

type TabId = 'pending' | 'history' | 'analytics' | 'policy';

export default function ReviewQueueView() {
  const { currentUser } = useAuth();
  const [items, setItems]     = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<TabId>('pending');

  const orgId = currentUser?.orgId ?? '';

  const load = () => {
    setLoading(true);
    api.getReviewQueue()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const pending  = items.filter((i) => i.status === 'PENDING');
  const history  = items.filter((i) => i.status !== 'PENDING');

  const handleReviewed = (updated: ReviewQueueItem) => {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  };

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
          <h1 className="text-lg font-semibold text-gray-900">ACLX Review Queue</h1>
          <p className="text-xs text-gray-500">
            AI outputs flagged by ACLX for human compliance review
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {pending.length > 0 && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500 text-white">
              {pending.length} pending
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-8 flex gap-0">
        {([
          { id: 'pending',   label: 'Pending Review',      icon: faClock,    count: pending.length },
          { id: 'history',   label: 'Decision History',    icon: faListAlt,  count: history.length },
          { id: 'analytics', label: 'Patterns & Insights', icon: faChartBar, count: null           },
          { id: 'policy',    label: 'Org Policy',          icon: faTag,      count: null           },
        ] as const).map(({ id, label, icon, count }) => (
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
                  id === 'pending' && count > 0
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

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-4xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <FontAwesomeIcon icon={faSpinner} className="animate-spin text-gray-400 text-2xl" />
            </div>
          ) : (
            <>
              {tab === 'pending'   && <PendingTab   items={pending} orgId={orgId} onReviewed={handleReviewed} />}
              {tab === 'history'   && <HistoryTab   items={history} />}
              {tab === 'analytics' && <AnalyticsTab items={items}   />}
              {tab === 'policy'    && <OrgPolicyTab orgId={orgId}   />}
            </>
          )}
        </div>
      </div>
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
        optionally promote a decision to an org policy rule so ACLX learns from it.
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

// ── Analytics tab ─────────────────────────────────────────────────────────────

function AnalyticsTab({ items }: { items: ReviewQueueItem[] }) {
  const total    = items.length;
  const pending  = items.filter((i) => i.status === 'PENDING').length;
  const approved = items.filter((i) => i.status === 'APPROVED').length;
  const denied   = items.filter((i) => i.status === 'DENIED').length;
  const reviewed = approved + denied;
  const approvalRate = reviewed > 0 ? Math.round((approved / reviewed) * 100) : null;

  const byType: Record<string, { total: number; approved: number; denied: number }> = {};
  items.forEach((i) => {
    if (!byType[i.eventType]) byType[i.eventType] = { total: 0, approved: 0, denied: 0 };
    byType[i.eventType].total++;
    if (i.status === 'APPROVED') byType[i.eventType].approved++;
    if (i.status === 'DENIED')   byType[i.eventType].denied++;
  });

  const bySensitivity: Record<string, number> = {};
  items.forEach((i) => {
    const s = i.aclxSensitivity ?? 'UNKNOWN';
    bySensitivity[s] = (bySensitivity[s] ?? 0) + 1;
  });

  const reasons = items
    .map((i) => i.aclxReason?.split('.')[0]?.trim())
    .filter(Boolean) as string[];
  const reasonCounts: Record<string, number> = {};
  reasons.forEach((r) => { reasonCounts[r] = (reasonCounts[r] ?? 0) + 1; });
  const topReasons = Object.entries(reasonCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Escalations" value={total} />
        <StatCard label="Pending Review"    value={pending}  accent="amber" />
        <StatCard label="Approved"          value={approved} accent="green" />
        <StatCard label="Denied"            value={denied}   accent="red"   />
      </div>

      {approvalRate !== null && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Approval Rate</h3>
          <div className="flex items-center gap-4">
            <div className="text-3xl font-bold" style={{ color: '#2a5f6f' }}>
              {approvalRate}%
            </div>
            <div className="flex-1">
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${approvalRate}%`, background: '#2a5f6f' }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {approved} approved, {denied} denied out of {reviewed} reviewed items
              </p>
            </div>
          </div>
          {approvalRate > 80 && (
            <div className="mt-3 flex items-start gap-2 text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded-lg p-3">
              <FontAwesomeIcon icon={faInfoCircle} className="mt-0.5 shrink-0" />
              High approval rate may indicate ACLX thresholds are too sensitive for this content
              type. Consider adding ALLOW rules in the Org Policy tab for frequently approved patterns.
            </div>
          )}
          {approvalRate < 30 && reviewed >= 3 && (
            <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <FontAwesomeIcon icon={faInfoCircle} className="mt-0.5 shrink-0" />
              High denial rate suggests the AI is regularly generating content that conflicts
              with HIPAA policy. Review system prompt guidance and document generation templates.
            </div>
          )}
        </div>
      )}

      {Object.keys(byType).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Escalations by Content Type</h3>
          <div className="space-y-3">
            {Object.entries(byType).map(([type, counts]) => (
              <div key={type} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-40 shrink-0">
                  {EVENT_LABELS[type] ?? type}
                </span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden flex">
                  {counts.approved > 0 && (
                    <div className="h-full bg-green-400"
                      style={{ width: `${(counts.approved / counts.total) * 100}%` }} />
                  )}
                  {counts.denied > 0 && (
                    <div className="h-full bg-red-400"
                      style={{ width: `${(counts.denied / counts.total) * 100}%` }} />
                  )}
                  {(counts.total - counts.approved - counts.denied) > 0 && (
                    <div className="h-full bg-amber-300"
                      style={{ width: `${((counts.total - counts.approved - counts.denied) / counts.total) * 100}%` }} />
                  )}
                </div>
                <span className="text-xs text-gray-400 w-10 text-right shrink-0">
                  {counts.total}
                </span>
              </div>
            ))}
            <div className="flex gap-4 text-xs text-gray-400 pt-1">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Approved</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Denied</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-300 inline-block" /> Pending</span>
            </div>
          </div>
        </div>
      )}

      {Object.keys(bySensitivity).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">ACLX Sensitivity Breakdown</h3>
          <div className="flex gap-4 flex-wrap">
            {Object.entries(bySensitivity).map(([s, count]) => {
              const colors = SENSITIVITY_COLORS[s] ?? { bg: '#f3f4f6', text: '#374151' };
              return (
                <div key={s} className="px-4 py-3 rounded-xl text-center min-w-[80px]"
                  style={{ background: colors.bg }}>
                  <div className="text-2xl font-bold" style={{ color: colors.text }}>{count}</div>
                  <div className="text-xs font-semibold mt-0.5" style={{ color: colors.text }}>{s}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {topReasons.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Most Common Flag Reasons</h3>
          <p className="text-xs text-gray-400 mb-3">
            Use these patterns to add BLOCK rules in the Org Policy tab and reduce future escalations.
          </p>
          <div className="space-y-2">
            {topReasons.map(([reason, count], i) => (
              <div key={i} className="flex items-start gap-3">
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                  style={{ background: '#e8f4f8', color: '#2a5f6f' }}
                >
                  {count}
                </span>
                <p className="text-sm text-gray-600 leading-snug">{reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: 'amber' | 'green' | 'red' }) {
  const color = accent === 'amber' ? '#92400e' : accent === 'green' ? '#166534' : accent === 'red' ? '#991b1b' : '#1f2937';
  const bg    = accent === 'amber' ? '#fef9c3' : accent === 'green' ? '#dcfce7' : accent === 'red' ? '#fee2e2'  : '#f9fafb';
  return (
    <div className="rounded-xl border border-gray-200 p-4" style={{ background: bg }}>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

// ── Org Policy tab ────────────────────────────────────────────────────────────

function OrgPolicyTab({ orgId }: { orgId: string }) {
  const [policy, setPolicy]         = useState<OrgAclxPolicy | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  // Add-rule form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addType, setAddType]       = useState<OrgPolicyRuleType>('BLOCK');
  const [addSlug, setAddSlug]       = useState('');
  const [addDesc, setAddDesc]       = useState('');
  const [addSaving, setAddSaving]   = useState(false);
  const [addError, setAddError]     = useState('');

  // Sensitivity
  const [sensEdit, setSensEdit]     = useState(false);
  const [sensitivity, setSensitivity] = useState('');
  const [sensSaving, setSensSaving] = useState(false);

  const loadPolicy = () => {
    if (!orgId) return;
    setLoading(true);
    api.getOrgAclxPolicy(orgId)
      .then((p) => {
        setPolicy(p);
        setSensitivity(p.escalateAtSensitivity ?? '');
      })
      .catch(() => setError('Failed to load org policy.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadPolicy(); }, [orgId]);

  const handleDelete = async (ruleId: string) => {
    try {
      await api.deleteOrgPolicyRule(orgId, ruleId);
      loadPolicy();
    } catch {
      setError('Failed to delete rule.');
    }
  };

  const handleAddRule = async () => {
    if (!addSlug.trim()) { setAddError('Slug is required.'); return; }
    if (!addDesc.trim()) { setAddError('Description is required.'); return; }
    setAddSaving(true); setAddError('');
    try {
      await api.addOrgPolicyRule(orgId, { type: addType, slug: addSlug.trim(), description: addDesc.trim() });
      setShowAddForm(false);
      setAddSlug('');
      setAddDesc('');
      loadPolicy();
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : 'Failed to add rule.');
    } finally { setAddSaving(false); }
  };

  const handleSaveSensitivity = async () => {
    if (!sensitivity) return;
    setSensSaving(true);
    try {
      await api.setOrgPolicySensitivity(orgId, sensitivity);
      setSensEdit(false);
      loadPolicy();
    } catch {
      // ignore
    } finally { setSensSaving(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <FontAwesomeIcon icon={faSpinner} className="animate-spin text-gray-400 text-2xl" />
    </div>
  );

  const allowRules = policy?.allowRules ?? [];
  const blockRules = policy?.blockRules ?? [];

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Intro */}
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-sm text-teal-800">
        <p className="font-semibold mb-1">What is the Org Policy?</p>
        <p className="text-xs leading-relaxed">
          These rules are sent to ACLX on every evaluation call. <strong>ALLOW rules</strong> tell
          ACLX that your org has reviewed and approved certain content patterns, reducing unnecessary
          escalations. <strong>BLOCK rules</strong> add stricter-than-baseline restrictions specific
          to your organisation. You can add rules manually or promote them directly from a review decision.
        </p>
      </div>

      {/* Escalation sensitivity */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-gray-700">Escalation Sensitivity Threshold</h3>
          {!sensEdit && (
            <button
              onClick={() => { setSensEdit(true); setSensitivity(policy?.escalateAtSensitivity ?? ''); }}
              className="text-xs text-teal-700 hover:underline"
            >
              Change
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Only escalate AI outputs at or above this sensitivity level.
          "HIGH" means MEDIUM-sensitivity content is auto-allowed rather than escalated.
          Leave unset to use ACLX defaults (escalate at MEDIUM+).
        </p>
        {!sensEdit ? (
          <span className="px-3 py-1 rounded-full text-xs font-bold"
            style={policy?.escalateAtSensitivity
              ? { background: SENSITIVITY_COLORS[policy.escalateAtSensitivity]?.bg, color: SENSITIVITY_COLORS[policy.escalateAtSensitivity]?.text }
              : { background: '#f3f4f6', color: '#6b7280' }}>
            {policy?.escalateAtSensitivity ?? 'ACLX default (MEDIUM+)'}
          </span>
        ) : (
          <div className="flex items-center gap-3">
            <select
              value={sensitivity}
              onChange={(e) => setSensitivity(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              <option value="">ACLX default</option>
              <option value="HIGH">HIGH only</option>
              <option value="MEDIUM">MEDIUM+</option>
              <option value="LOW">LOW+ (all)</option>
            </select>
            <button
              onClick={handleSaveSensitivity}
              disabled={sensSaving}
              className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold disabled:opacity-50"
              style={{ background: '#2a5f6f' }}
            >
              {sensSaving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => setSensEdit(false)} className="text-xs text-gray-400 hover:underline">
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Allow rules */}
      <RuleSection
        title="ALLOW Rules"
        subtitle="Patterns your org has explicitly approved — ACLX will reduce escalation likelihood for matching content."
        rules={allowRules}
        type="ALLOW"
        onDelete={handleDelete}
      />

      {/* Block rules */}
      <RuleSection
        title="BLOCK Rules"
        subtitle="Patterns your org has explicitly blocked — stricter than the HIPAA baseline. ACLX will always block matching content."
        rules={blockRules}
        type="BLOCK"
        onDelete={handleDelete}
      />

      {/* Add rule */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Add New Rule</h3>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
              style={{ background: '#2a5f6f' }}
            >
              <FontAwesomeIcon icon={faPlus} className="text-xs" />
              Add Rule
            </button>
          )}
        </div>

        {showAddForm && (
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Rule Type</label>
                <div className="flex gap-2">
                  {(['ALLOW', 'BLOCK'] as OrgPolicyRuleType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setAddType(t)}
                      className="flex-1 py-2 rounded-lg border-2 text-xs font-semibold transition-colors"
                      style={addType === t
                        ? t === 'ALLOW'
                          ? { borderColor: '#16a34a', background: '#f0fdf4', color: '#16a34a' }
                          : { borderColor: '#dc2626', background: '#fef2f2', color: '#dc2626' }
                        : { borderColor: '#e5e7eb', background: 'white', color: '#6b7280' }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Slug <span className="normal-case font-normal text-gray-400">(machine-readable, no spaces)</span>
              </label>
              <input
                type="text"
                value={addSlug}
                onChange={(e) => setAddSlug(slugify(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-600"
                placeholder="e.g. progress_data_without_direct_phi"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</label>
              <textarea
                rows={2}
                value={addDesc}
                onChange={(e) => setAddDesc(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                placeholder="Explain what content pattern this rule covers..."
              />
            </div>

            {addError && <p className="text-xs text-red-500">{addError}</p>}

            <div className="flex gap-2">
              <button
                onClick={handleAddRule}
                disabled={addSaving}
                className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50"
                style={{ background: '#2a5f6f' }}
              >
                {addSaving ? 'Saving...' : 'Add Rule'}
              </button>
              <button
                onClick={() => { setShowAddForm(false); setAddSlug(''); setAddDesc(''); setAddError(''); }}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {!showAddForm && (
          <p className="text-xs text-gray-400">
            You can add rules manually here, or use "Promote to Rule" after reviewing an escalated item.
          </p>
        )}
      </div>
    </div>
  );
}

function RuleSection({
  title, subtitle, rules, type, onDelete,
}: {
  title: string;
  subtitle: string;
  rules: OrgPolicyRule[];
  type: OrgPolicyRuleType;
  onDelete: (id: string) => void;
}) {
  const isAllow = type === 'ALLOW';
  const accentColor = isAllow ? '#16a34a' : '#dc2626';
  const accentBg    = isAllow ? '#f0fdf4' : '#fef2f2';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-0.5">{title}</h3>
      <p className="text-xs text-gray-400 mb-4">{subtitle}</p>

      {rules.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No {type.toLowerCase()} rules defined yet.</p>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id}
              className="flex items-start gap-3 p-3 rounded-lg border"
              style={{ background: accentBg, borderColor: isAllow ? '#bbf7d0' : '#fecaca' }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <code className="text-xs font-bold" style={{ color: accentColor }}>{rule.slug}</code>
                  {rule.sourceReviewItemId && (
                    <span className="text-xs text-gray-400 italic">from review</span>
                  )}
                </div>
                <p className="text-xs text-gray-600 leading-snug">{rule.description}</p>
                <p className="text-xs text-gray-400 mt-1">Added {fmtDate(rule.addedAt)}</p>
              </div>
              <button
                onClick={() => onDelete(rule.id)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-100 text-gray-400 hover:text-red-500 shrink-0 transition-colors"
                title="Remove rule"
              >
                <FontAwesomeIcon icon={faTrash} className="text-xs" />
              </button>
            </div>
          ))}
        </div>
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
