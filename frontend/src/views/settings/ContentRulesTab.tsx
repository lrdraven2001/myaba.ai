import { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faRightLeft, faUser, faPlus, faTrash, faShieldHalved,
  faMagnifyingGlass, faCircleInfo,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../../lib/api';
import {
  SettingsCard, Badge, Toggle, SettingRow, PrimaryButton, SecondaryButton, SectionHeading,
} from '../../components/settings/primitives';

type Rule = {
  id: string; type: string; slug: string; description: string;
  addedAt?: string; addedBy?: string;
};

export default function ContentRulesTab({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const [preferNames, setPreferNames] = useState(false);
  const [reportOnly, setReportOnly]   = useState(false);
  const [allow, setAllow]   = useState<Rule[]>([]);
  const [block, setBlock]   = useState<Rule[]>([]);
  const [query, setQuery]   = useState('');
  const [scope, setScope]   = useState<'all' | 'allowed' | 'restricted'>('all');
  const [adding, setAdding] = useState(false);

  const loadPolicy = () => {
    api.getOrgAclxPolicy(orgId).then((p) => {
      setAllow((p?.allowRules as Rule[]) ?? []);
      setBlock((p?.blockRules as Rule[]) ?? []);
    }).catch(() => {});
  };

  useEffect(() => {
    if (!orgId) return;
    api.getOrg(orgId).then((o) => {
      setPreferNames(o.settings?.preferClientDisplayName ?? false);
      setReportOnly(o.settings?.aclxReportOnly ?? false);
    }).catch(() => {});
    loadPolicy();
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePreferNames = async (next: boolean) => {
    setPreferNames(next);
    await api.updateOrgSettings(orgId, { preferClientDisplayName: next }).catch(() => {});
  };

  const toggleReportOnly = async (next: boolean) => {
    setReportOnly(next);
    await api.updateOrgSettings(orgId, { aclxReportOnly: next }).catch(() => setReportOnly(!next));
  };

  const removeRule = async (id: string) => {
    setAllow((r) => r.filter((x) => x.id !== id));
    setBlock((r) => r.filter((x) => x.id !== id));
    await api.deleteOrgPolicyRule(orgId, id).catch(loadPolicy);
  };

  const rows = useMemo(() => {
    const all = [
      ...allow.map((r) => ({ ...r, kind: 'allowed' as const })),
      ...block.map((r) => ({ ...r, kind: 'restricted' as const })),
    ];
    return all
      .filter((r) => scope === 'all' || r.kind === scope)
      .filter((r) => !query.trim() || (r.description + r.slug).toLowerCase().includes(query.toLowerCase()));
  }, [allow, block, scope, query]);

  return (
    <div className="max-w-6xl space-y-6">
      <SectionHeading
        title="Content Governance Rules"
        description="Define what content is always permitted or always restricted for your organization, beyond the default compliance baseline."
        action={isAdmin ? <PrimaryButton icon={faPlus} onClick={() => setAdding(true)}>Add Rule</PrimaryButton> : undefined}
      />

      {/* Enforcement mode */}
      <SettingsCard icon={faShieldHalved} title="Compliance Enforcement" subtitle="How flagged AI responses are handled.">
        <div className="border-t border-gray-100">
          <SettingRow
            icon={faCircleInfo}
            title="Report-only mode"
            description="When on, responses flagged for review are DELIVERED immediately and logged to the Review screen, where reviewers can still submit approve/deny feedback (which trains the compliance engine). Hard blocks — missing authorizations, security violations — are always enforced regardless. Intended for pilot/feedback phases; turn off for full enforcement."
            control={
              <div className="flex items-center gap-2.5">
                <Badge tone={reportOnly ? 'amber' : 'green'}>{reportOnly ? 'Report-only' : 'Enforcing'}</Badge>
                <Toggle checked={reportOnly} onChange={toggleReportOnly} disabled={!isAdmin} label="Report-only mode" />
              </div>
            }
          />
        </div>
      </SettingsCard>

      {/* Output Formatting */}
      <SettingsCard icon={faRightLeft} title="Output Formatting" subtitle="Control how client names are handled in AI-generated outputs.">
        <div className="border-t border-gray-100">
          <SettingRow
            icon={faUser}
            title="Use client preferred names in output"
            description="When on, generated chats and documents always refer to a client by their preferred/display name and never their legal name — enforced by both a model instruction and a deterministic rewrite pass before the response is shown."
            control={<Toggle checked={preferNames} onChange={togglePreferNames} disabled={!isAdmin} label="Use client preferred names" />}
          />
        </div>
      </SettingsCard>

      {/* Organization Rules */}
      <div>
        <h3 className="text-base font-bold text-gray-900">Organization Rules</h3>
        <p className="text-sm text-gray-500 mb-3">Set rules to always allow or restrict specific topics, content types, or behaviors.</p>

        <div className="flex items-center gap-3 mb-3">
          <div className="relative flex-1 max-w-md">
            <FontAwesomeIcon icon={faMagnifyingGlass} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search rules…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
            aria-label="Scope filter"
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
          >
            <option value="all">Scope: All</option>
            <option value="allowed">Allowed</option>
            <option value="restricted">Restricted</option>
          </select>
        </div>

        <SettingsCard>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="font-semibold px-5 py-3">Rule Name</th>
                <th className="font-semibold px-3 py-3">Scope</th>
                <th className="font-semibold px-3 py-3">Type</th>
                <th className="font-semibold px-3 py-3">Status</th>
                <th className="font-semibold px-3 py-3">Updated</th>
                <th className="font-semibold px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">No rules yet. Add a rule to define org-specific governance.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <FontAwesomeIcon icon={faShieldHalved} style={{ color: r.kind === 'restricted' ? '#dc2626' : '#16a34a', fontSize: 14 }} />
                      <div>
                        <div className="font-semibold text-gray-900">{r.description}</div>
                        <div className="text-xs text-gray-400">{r.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-gray-500">All Content</td>
                  <td className="px-3 py-3.5"><Badge tone={r.kind === 'restricted' ? 'red' : 'blue'}>{r.kind === 'restricted' ? 'Restricted' : 'Allowed'}</Badge></td>
                  <td className="px-3 py-3.5"><Badge tone="green">Active</Badge></td>
                  <td className="px-3 py-3.5 text-gray-500 text-xs">
                    {r.addedAt ? new Date(r.addedAt).toLocaleDateString() : '—'}
                    {r.addedBy ? <div className="text-gray-400">by {r.addedBy}</div> : null}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {isAdmin && (
                      <button onClick={() => removeRule(r.id)} aria-label="Delete rule" className="text-gray-400 hover:text-red-600 w-8 h-8 rounded-lg hover:bg-red-50">
                        <FontAwesomeIcon icon={faTrash} className="text-sm" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SettingsCard>
      </div>

      {/* Exceptions */}
      <SettingsCard icon={faCircleInfo} iconColor="#1E88FF" title="Exceptions" subtitle="Add exceptions to override a rule for specific contexts or content types."
        action={isAdmin ? <SecondaryButton icon={faPlus} disabled>Add Exception</SecondaryButton> : undefined}>
        <div className="px-5 sm:px-6 pb-5 text-sm text-gray-400 italic">No exceptions configured.</div>
      </SettingsCard>

      {adding && (
        <AddRuleModal orgId={orgId} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); loadPolicy(); }} />
      )}
    </div>
  );
}

// ── Add rule modal ───────────────────────────────────────────────────────────
function AddRuleModal({ orgId, onClose, onAdded }: { orgId: string; onClose: () => void; onAdded: () => void }) {
  const [type, setType] = useState<'BLOCK' | 'ALLOW'>('BLOCK');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!desc.trim()) return;
    setBusy(true);
    const slug = desc.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60);
    try {
      await api.addOrgPolicyRule(orgId, { type, slug, description: desc.trim() });
      onAdded();
    } catch { onClose(); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(15,35,45,0.45)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Add content rule" className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900">Add Content Rule</h3>
        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            {(['BLOCK', 'ALLOW'] as const).map((t) => (
              <button key={t} onClick={() => setType(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border ${type === t ? 'text-white border-transparent' : 'text-gray-600 border-gray-300 bg-white'}`}
                style={type === t ? { background: t === 'BLOCK' ? '#dc2626' : '#16a34a' } : {}}>
                {t === 'BLOCK' ? 'Restrict' : 'Allow'}
              </button>
            ))}
          </div>
          <textarea
            value={desc} onChange={(e) => setDesc(e.target.value)} rows={3}
            placeholder="Describe what this rule allows or restricts (e.g. Never provide ABA therapy scripts)"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={busy || !desc.trim()}>{busy ? 'Adding…' : 'Add Rule'}</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
