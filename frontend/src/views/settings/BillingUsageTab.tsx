import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faDownload, faStar, faCircleInfo, faUsers, faFileLines,
  faComments, faBolt, faCreditCard, faPlus, faLock,
  faGem, faBell, faSlidersH, faCircleQuestion, faChartColumn,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { api } from '../../lib/api';
import type { UsageSummary, UsageHistoryEntry, BillingSummary } from '../../types';
import {
  SettingsCard, Badge, SectionHeading, SecondaryButton,
} from '../../components/settings/primitives';

const PLAN_LABEL: Record<string, string> = {
  solo: 'Solo', team: 'Team', enterprise: 'Enterprise', dev: 'Dev', free: 'Free',
};

/** Format a Stripe amount (minor units, e.g. cents) as a currency string. */
function formatMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('default', { style: 'currency', currency: (currency || 'usd').toUpperCase() })
      .format((amountMinor ?? 0) / 100);
  } catch {
    return `${((amountMinor ?? 0) / 100).toFixed(2)} ${(currency || '').toUpperCase()}`;
  }
}
const SEAT_LIMIT: Record<string, number> = { solo: 3, team: 15, enterprise: 100, dev: 99 };

export default function BillingUsageTab({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const [usage, setUsage]     = useState<UsageSummary | null>(null);
  const [members, setMembers] = useState<number>(0);
  const [history, setHistory] = useState<UsageHistoryEntry[]>([]);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingMsg, setBillingMsg]   = useState<string | null>(null);

  useEffect(() => {
    api.getUsage().then(setUsage).catch(() => {});
    api.getUsageHistory(12).then((r) => setHistory(r.history ?? [])).catch(() => {});
    api.getBillingSummary().then(setBilling).catch(() => {});
    if (orgId) api.getOrgMembers(orgId).then((m) => setMembers(Array.isArray(m) ? m.length : 0)).catch(() => {});
  }, [orgId]);

  const stripeReady   = billing?.stripeConfigured ?? false;
  const hasSub        = billing?.hasSubscription ?? false;
  const subStatus     = billing?.subscriptionStatus ?? usage?.subscriptionStatus;

  // Manage Plan / Add Payment Method → Billing Portal when subscribed, else Checkout.
  const manageBilling = async (planForCheckout?: string) => {
    if (!isAdmin || billingBusy) return;
    setBillingBusy(true);
    setBillingMsg(null);
    try {
      const res = hasSub
        ? await api.openBillingPortal()
        : await api.startCheckout(planForCheckout || (plan && plan !== 'free' ? plan : 'team'));
      if (res.url) window.location.assign(res.url); // full-page redirect to Stripe (hosted)
      else setBillingMsg('Could not open billing.');
    } catch (e) {
      setBillingMsg(e instanceof Error ? e.message : 'Billing is not available right now.');
    } finally {
      setBillingBusy(false);
    }
  };

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

  // Subscription status → badge tone + label. Unbilled/never-subscribed orgs
  // (no status) read as "Active" so nothing regresses before Stripe is live.
  const statusInfo: { tone: 'green' | 'amber' | 'red' | 'neutral'; label: string } = (() => {
    const s = subStatus;
    if (!s || s === 'active') return { tone: 'green',   label: 'Active' };
    if (s === 'trialing')     return { tone: 'green',   label: 'Trial' };
    if (s === 'past_due' || s === 'unpaid') return { tone: 'amber', label: 'Past due' };
    if (s === 'canceled')     return { tone: 'neutral', label: 'Canceled' };
    if (s === 'incomplete' || s === 'incomplete_expired') return { tone: 'amber', label: 'Incomplete' };
    return { tone: 'neutral', label: s };
  })();

  const renewLabel = billing?.currentPeriodEnd
    ? new Date(billing.currentPeriodEnd * 1000).toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const downloadReport = () => {
    const rows: string[][] = [
      ['Metric', 'Value', 'Limit'],
      ['Period', usage?.period ?? '', ''],
      ['Plan', planLabel, ''],
      ['AI requests', String(requests), unlimited ? 'Unlimited' : String(effLimit)],
      ['Documents generated', String(docs), ''],
      ['Chat messages', String(chats), ''],
      ['Team members', String(members), String(seatLimit)],
    ];
    if (history.length) {
      rows.push([], ['Monthly History'], ['Period', 'Documents', 'Chats', 'Total Requests']);
      for (const h of history) {
        rows.push([h.period, String(h.documentCount), String(h.chatCount), String(h.requestCount)]);
      }
    }
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
                  <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                </div>
                <div className="text-sm text-gray-500 mt-0.5">{unlimited ? 'Unlimited usage' : `${effLimit.toLocaleString()} requests / month`}</div>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">Billing period: {periodLabel}</p>
            {isAdmin ? (
              <button
                className="mt-3 text-sm font-semibold text-teal-700 hover:underline disabled:opacity-50 disabled:no-underline"
                onClick={() => manageBilling()}
                disabled={billingBusy || !stripeReady}
                title={stripeReady ? (hasSub ? 'Manage or change your plan' : 'Choose a plan and subscribe') : 'Billing isn’t set up yet'}
              >
                {billingBusy ? 'Opening…' : hasSub ? 'Manage Plan' : 'Choose a Plan'}
              </button>
            ) : (
              <p className="mt-3 text-xs text-gray-400">Contact an administrator to change the plan.</p>
            )}
            {billingMsg && <p className="mt-2 text-xs text-red-500">{billingMsg}</p>}
            {!stripeReady && isAdmin && (
              <p className="mt-2 text-xs text-gray-400">Billing isn’t set up yet.</p>
            )}
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

        {/* Subscription / next renewal */}
        <SettingsCard title={<span className="flex items-center gap-1.5">Subscription <FontAwesomeIcon icon={faCircleInfo} className="text-gray-300" style={{ fontSize: 12 }} /></span>}>
          <div className="px-5 sm:px-6 pb-5">
            {hasSub ? (
              <>
                <div className="text-2xl font-bold text-gray-900">{planLabel}</div>
                <div className="text-sm text-gray-500 mt-1 flex items-center gap-2">
                  <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                  {renewLabel && (
                    <span>{subStatus === 'canceled' ? 'Ends' : 'Renews'} {renewLabel}</span>
                  )}
                </div>
                <div className="border-t border-gray-100 my-4" />
                <p className="text-xs text-gray-400 leading-relaxed">
                  Manage your plan, payment method, and invoices in the billing portal.
                </p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-gray-900">No active subscription</div>
                <div className="text-sm text-gray-500 mt-1">{stripeReady ? 'Choose a plan to get started.' : 'Billing isn’t set up yet.'}</div>
                <div className="border-t border-gray-100 my-4" />
                <p className="text-xs text-gray-400 leading-relaxed">
                  Subscribe to unlock your plan’s full monthly usage. Cancel anytime.
                </p>
              </>
            )}
          </div>
        </SettingsCard>
      </div>

      {/* Agency usage trend */}
      <SettingsCard
        title={<span className="flex items-center gap-1.5">Usage Trend <FontAwesomeIcon icon={faChartColumn} className="text-gray-300" style={{ fontSize: 12 }} /></span>}
        subtitle="AI activity over the last 12 months"
      >
        <div className="px-5 sm:px-6 pb-6 pt-1">
          <UsageTrend history={history} />
        </div>
      </SettingsCard>

      {/* Invoices · Payment method */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SettingsCard title="Recent Invoices">
          {billing && billing.invoices.length > 0 ? (
            <div className="px-5 sm:px-6 pb-5 pt-1 divide-y divide-gray-100">
              {billing.invoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">
                      {inv.number || inv.id}
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(inv.created * 1000).toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold text-gray-800">
                      {formatMoney(inv.amountPaid || inv.amountDue, inv.currency)}
                    </span>
                    <Badge tone={inv.status === 'paid' ? 'green' : inv.status === 'open' ? 'amber' : 'neutral'}>
                      {inv.status ?? '—'}
                    </Badge>
                    {inv.hostedInvoiceUrl && (
                      <a href={inv.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer"
                         className="text-gray-400 hover:text-teal-600" title="View invoice">
                        <FontAwesomeIcon icon={faFileLines} />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 sm:px-6 pb-6 pt-2 text-center">
              <FontAwesomeIcon icon={faFileLines} className="text-gray-300 text-3xl mb-3" />
              <p className="text-sm font-medium text-gray-600">No invoices yet</p>
              <p className="text-xs text-gray-400 mt-1">
                {stripeReady ? 'Invoices appear here after your first payment.' : 'Invoices will appear here once billing is set up.'}
              </p>
            </div>
          )}
        </SettingsCard>

        <SettingsCard title="Payment Method">
          <div className="px-5 sm:px-6 pb-5">
            <button
              disabled={!isAdmin || billingBusy || !stripeReady}
              onClick={() => manageBilling()}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-gray-300 text-sm font-medium text-gray-500 hover:border-gray-400 disabled:opacity-50"
            >
              <FontAwesomeIcon icon={hasSub ? faCreditCard : faPlus} />
              {billingBusy ? 'Opening…' : hasSub ? 'Manage Payment Method' : 'Add Payment Method'}
            </button>
            <p className="text-xs text-gray-400 mt-3 flex items-center gap-1.5">
              <FontAwesomeIcon icon={faLock} />
              {stripeReady
                ? 'Cards are handled securely by Stripe — your card details never touch our servers.'
                : 'Your payment information is securely encrypted. Requires billing to be set up.'}
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

// ── Usage trend chart ───────────────────────────────────────────────────────
function UsageTrend({ history }: { history: UsageHistoryEntry[] }) {
  if (!history.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <FontAwesomeIcon icon={faChartColumn} className="text-gray-300 text-2xl mb-2" />
        <p className="text-sm font-medium text-gray-600">No usage recorded yet</p>
        <p className="text-xs text-gray-400 mt-1">Monthly AI activity will appear here as your team generates documents and chats.</p>
      </div>
    );
  }
  const max = Math.max(1, ...history.map((h) => h.documentCount + h.chatCount));
  const monthLabel = (p: string, opts: Intl.DateTimeFormatOptions) => {
    const d = new Date(p + '-01');
    return isNaN(d.getTime()) ? p : d.toLocaleString('default', opts);
  };
  return (
    <div>
      <div className="flex items-end gap-1.5 sm:gap-3" style={{ height: 160 }}>
        {history.map((h) => {
          const total   = h.documentCount + h.chatCount;
          const barPct  = (total / max) * 100;
          const chatPct = total ? (h.chatCount / total) * 100 : 0;
          return (
            <div key={h.period} className="flex-1 flex flex-col items-center justify-end gap-1.5 min-w-0 h-full">
              <div
                className="w-full max-w-[42px] rounded-t-md overflow-hidden flex flex-col bg-gray-50"
                style={{ height: `${Math.max(barPct, total > 0 ? 4 : 1.5)}%` }}
                title={`${monthLabel(h.period, { month: 'long', year: 'numeric' })} — ${h.documentCount.toLocaleString()} documents, ${h.chatCount.toLocaleString()} chats`}
              >
                <div style={{ height: `${chatPct}%`, background: '#3F9B2F' }} />
                <div style={{ flex: 1, background: '#7C3AED' }} />
              </div>
              <span className="text-[10px] text-gray-400 w-full text-center truncate">{monthLabel(h.period, { month: 'short' })}</span>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#7C3AED' }} /> Documents</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#3F9B2F' }} /> Chats</span>
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
