import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faDownload, faStar, faCircleInfo, faUsers, faFileLines,
  faComments, faBolt, faCreditCard, faPlus, faLock,
  faGem, faBell, faSlidersH, faCircleQuestion,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { api } from '../../lib/api';
import type { UsageSummary } from '../../types';
import {
  SettingsCard, Badge, SectionHeading, SecondaryButton,
} from '../../components/settings/primitives';

const PLAN_LABEL: Record<string, string> = {
  solo: 'Solo', team: 'Team', enterprise: 'Enterprise', dev: 'Dev',
};
const SEAT_LIMIT: Record<string, number> = { solo: 3, team: 15, enterprise: 100, dev: 99 };

export default function BillingUsageTab({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const [usage, setUsage]     = useState<UsageSummary | null>(null);
  const [members, setMembers] = useState<number>(0);

  useEffect(() => {
    api.getUsage().then(setUsage).catch(() => {});
    if (orgId) api.getOrgMembers(orgId).then((m) => setMembers(Array.isArray(m) ? m.length : 0)).catch(() => {});
  }, [orgId]);

  const plan        = usage?.plan ?? '';
  const planLabel   = PLAN_LABEL[plan] ?? (plan || '—');
  const effLimit    = usage?.effectiveLimit ?? -1;
  const unlimited   = usage?.unlimited || effLimit < 0;
  const requests    = usage?.requestCount ?? 0;
  const docs        = usage?.documentCount ?? 0;
  const chats       = usage?.chatCount ?? 0;
  const seatLimit   = SEAT_LIMIT[plan] ?? 15;
  const periodLabel = usage?.period
    ? new Date(usage.period + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })
    : '—';

  const downloadReport = () => {
    const rows = [
      ['Metric', 'Value', 'Limit'],
      ['Period', usage?.period ?? '', ''],
      ['Plan', planLabel, ''],
      ['AI requests', String(requests), unlimited ? 'Unlimited' : String(effLimit)],
      ['Documents generated', String(docs), ''],
      ['Chat messages', String(chats), ''],
      ['Team members', String(members), String(seatLimit)],
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `myaba-usage-${usage?.period ?? 'report'}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl space-y-6">
      <SectionHeading
        title="Billing & Usage"
        description="View your plan, usage, invoices, and payment methods."
        action={<SecondaryButton icon={faDownload} onClick={downloadReport}>Download Usage Report</SecondaryButton>}
      />

      {/* Top row: Plan · Usage · Estimated */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Current Plan */}
        <SettingsCard title="Current Plan">
          <div className="px-5 sm:px-6 pb-5">
            <div className="flex items-start gap-3">
              <span className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: '#eff6ff' }}>
                <FontAwesomeIcon icon={faStar} style={{ color: '#1E88FF', fontSize: 18 }} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-gray-900">{planLabel}</span>
                  <Badge tone="green">Active</Badge>
                </div>
                <div className="text-sm text-gray-500 mt-0.5">{unlimited ? 'Unlimited usage' : `${effLimit.toLocaleString()} requests / month`}</div>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">Billing period: {periodLabel}</p>
            <button className="mt-3 text-sm font-semibold text-teal-700 hover:underline" onClick={() => {}}>Manage Plan</button>
          </div>
        </SettingsCard>

        {/* Usage This Month */}
        <SettingsCard
          title={<span className="flex items-center gap-1.5">Usage This Month <FontAwesomeIcon icon={faCircleInfo} className="text-gray-300" style={{ fontSize: 12 }} /></span>}
          subtitle={periodLabel}
        >
          <div className="px-5 sm:px-6 pb-5 space-y-3.5">
            <UsageBar icon={faBolt}      color="#1E88FF" label="AI Requests"        used={requests} limit={unlimited ? null : effLimit} />
            <UsageBar icon={faFileLines} color="#7C3AED" label="Documents Generated" used={docs} limit={null} />
            <UsageBar icon={faComments}  color="#3F9B2F" label="Chat Messages"       used={chats} limit={null} />
            <UsageBar icon={faUsers}     color="#F5A623" label="Team Members"         used={members} limit={seatLimit} />
          </div>
        </SettingsCard>

        {/* Estimated Charges */}
        <SettingsCard title={<span className="flex items-center gap-1.5">Estimated Charges <FontAwesomeIcon icon={faCircleInfo} className="text-gray-300" style={{ fontSize: 12 }} /></span>}>
          <div className="px-5 sm:px-6 pb-5">
            <div className="text-3xl font-bold text-gray-900">—</div>
            <div className="text-sm text-gray-500 mt-1">{periodLabel}</div>
            <div className="border-t border-gray-100 my-4" />
            <p className="text-xs text-gray-400 leading-relaxed">
              Plan, overage, and add-on charges appear here once a billing provider is connected.
            </p>
          </div>
        </SettingsCard>
      </div>

      {/* Invoices · Payment method */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SettingsCard title="Recent Invoices">
          <div className="px-5 sm:px-6 pb-6 pt-2 text-center">
            <FontAwesomeIcon icon={faFileLines} className="text-gray-300 text-3xl mb-3" />
            <p className="text-sm font-medium text-gray-600">No invoices yet</p>
            <p className="text-xs text-gray-400 mt-1">Invoices will appear here once a billing provider (e.g. Stripe) is connected.</p>
          </div>
        </SettingsCard>

        <SettingsCard title="Payment Method">
          <div className="px-5 sm:px-6 pb-5">
            <button disabled={!isAdmin} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-gray-300 text-sm font-medium text-gray-500 hover:border-gray-400 disabled:opacity-50">
              <FontAwesomeIcon icon={faPlus} /> Add Payment Method
            </button>
            <p className="text-xs text-gray-400 mt-3 flex items-center gap-1.5">
              <FontAwesomeIcon icon={faLock} /> Your payment information is securely encrypted. Requires a connected billing provider.
            </p>
          </div>
        </SettingsCard>
      </div>

      {/* Info band */}
      <div className="rounded-2xl border border-gray-200 bg-white px-6 py-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <InfoItem icon={faGem}            color="#1E88FF" title="Transparent Pricing" body="No hidden fees. Overage rates are always shown upfront." />
        <InfoItem icon={faBell}           color="#3F9B2F" title="Usage Alerts"        body="Get notified when you're approaching your limits." />
        <InfoItem icon={faSlidersH}       color="#7C3AED" title="Flexible Plans"      body="Upgrade, downgrade, or cancel anytime." />
        <InfoItem icon={faCircleQuestion} color="#F5A623" title="Need Help?"          body={<>Contact our billing team <a href="mailto:billing@myaba.ai" className="text-teal-700 font-medium">billing@myaba.ai</a></>} />
      </div>
    </div>
  );
}

// ── Usage bar row ───────────────────────────────────────────────────────────
function UsageBar({ icon, color, label, used, limit }: {
  icon: IconDefinition; color: string; label: string; used: number; limit: number | null;
}) {
  const pct = limit && limit > 0 ? Math.min(100, (used / limit) * 100) : (used > 0 ? 100 : 6);
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <FontAwesomeIcon icon={icon} style={{ color, fontSize: 13 }} className="w-4" />
        <span className="text-sm text-gray-700 flex-1">{label}</span>
        <span className="text-sm font-medium text-gray-900">
          {used.toLocaleString()}{limit != null ? <span className="text-gray-400 font-normal"> / {limit.toLocaleString()}</span> : null}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ── Info band item ──────────────────────────────────────────────────────────
function InfoItem({ icon, color, title, body }: {
  icon: IconDefinition; color: string; title: string; body: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}1A` }}>
        <FontAwesomeIcon icon={icon} style={{ color, fontSize: 14 }} />
      </span>
      <div>
        <div className="text-sm font-semibold text-gray-900">{title}</div>
        <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{body}</div>
      </div>
    </div>
  );
}
