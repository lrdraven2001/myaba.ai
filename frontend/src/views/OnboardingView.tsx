import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBrain, faBuilding, faCopy, faCheck, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import type { OrgPlan, UserRole } from '../types';

const PLANS: { value: OrgPlan; label: string; description: string }[] = [
  { value: 'solo',       label: 'Solo',       description: 'One practitioner, unlimited clients' },
  { value: 'team',       label: 'Team',       description: 'Up to 25 staff members' },
  { value: 'enterprise', label: 'Enterprise', description: 'Unlimited staff + SSO federation' },
];

const INVITE_ROLES: { value: UserRole; label: string }[] = [
  { value: 'TREATING_BCBA',    label: 'Treating BCBA' },
  { value: 'SUPERVISING_BCBA', label: 'Supervising BCBA' },
  { value: 'RBT',              label: 'RBT' },
  { value: 'BCBA_STUDENT',     label: 'BCBA Student' },
  { value: 'SCHEDULING_ADMIN', label: 'Scheduling Admin' },
  { value: 'BILLING_ADMIN',    label: 'Billing Admin' },
  { value: 'ORG_ADMIN',        label: 'Org Admin' },
];

type Step = 'org' | 'invite' | 'done';

interface Props {
  /** Called with the new orgId so App can refresh auth + transition to main UI. */
  onComplete: (orgId: string) => void;
}

export default function OnboardingView({ onComplete }: Props) {
  const [step, setStep]           = useState<Step>('org');
  const [orgName, setOrgName]     = useState('');
  const [plan, setPlan]           = useState<OrgPlan>('team');
  const [saving, setSaving]       = useState(false);
  const [orgId, setOrgId]         = useState('');
  const [error, setError]         = useState('');

  // Invite step
  const [inviteRole, setInviteRole]   = useState<UserRole>('TREATING_BCBA');
  const [inviteUrl, setInviteUrl]     = useState('');
  const [generating, setGenerating]   = useState(false);
  const [copied, setCopied]           = useState(false);
  const [inviteError, setInviteError] = useState('');

  // ── Step 1: Create org ─────────────────────────────────────────────────────

  const handleCreateOrg = async () => {
    if (!orgName.trim()) return;
    setSaving(true);
    setError('');
    try {
      const { orgId: newOrgId } = await api.createOrg({ name: orgName.trim(), plan });
      setOrgId(newOrgId);
      setStep('invite');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create organization');
    } finally {
      setSaving(false);
    }
  };

  // ── Step 2: Invite teammates ───────────────────────────────────────────────

  const handleGenerateInvite = async () => {
    setGenerating(true);
    setInviteError('');
    setCopied(false);
    try {
      const { inviteUrl: url } = await api.generateInvite(orgId, inviteRole);
      setInviteUrl(url);
    } catch (e: unknown) {
      setInviteError(e instanceof Error ? e.message : 'Failed to generate invite');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFinish = () => {
    onComplete(orgId);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
         style={{ background: 'linear-gradient(135deg, #1e4d5c 0%, #2a5f6f 60%, #3a7d94 100%)' }}>

      {/* Logo */}
      <div className="flex flex-col items-center mb-10">
        <div className="flex items-center justify-center rounded-2xl mb-3"
             style={{ background: 'white', width: 72, height: 72 }}>
          <FontAwesomeIcon icon={faBrain} style={{ fontSize: 40, color: '#2a5f6f' }} />
        </div>
        <div className="text-white font-bold text-2xl tracking-tight">myABA.ai</div>
        <div className="text-white/70 text-sm mt-1">Clinical AI for ABA therapy</div>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8">

        {/* Steps indicator */}
        <div className="flex items-center gap-2 mb-8">
          {(['org', 'invite', 'done'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  background: step === s ? '#2a5f6f' : (i < ['org','invite','done'].indexOf(step) ? '#5fb3d0' : '#e5e7eb'),
                  color: step === s || i < ['org','invite','done'].indexOf(step) ? 'white' : '#9ca3af',
                }}
              >
                {i + 1}
              </div>
              {i < 2 && <div className="h-px flex-1 min-w-[24px]"
                             style={{ background: i < ['org','invite','done'].indexOf(step) ? '#5fb3d0' : '#e5e7eb' }} />}
            </div>
          ))}
          <div className="ml-auto text-xs text-gray-400">
            {step === 'org' && 'Set up your organization'}
            {step === 'invite' && 'Invite your team'}
            {step === 'done' && 'All set!'}
          </div>
        </div>

        {/* ── Step: org ── */}
        {step === 'org' && (
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                   style={{ background: '#e8f4f8' }}>
                <FontAwesomeIcon icon={faBuilding} style={{ color: '#2a5f6f', fontSize: 20 }} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Create your organization</h2>
                <p className="text-sm text-gray-500">This is the workspace all your team members will share.</p>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Organization Name
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                  placeholder="e.g. Sunrise ABA Therapy"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateOrg(); }}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Plan
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PLANS.map((p) => (
                    <button
                      key={p.value}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        plan === p.value ? 'border-teal-600' : 'border-gray-200 hover:border-gray-300'
                      }`}
                      style={plan === p.value ? { background: '#e8f4f8' } : {}}
                      onClick={() => setPlan(p.value)}
                    >
                      <div className="font-semibold text-sm text-gray-800">{p.label}</div>
                      <div className="text-xs text-gray-400 mt-0.5 leading-snug">{p.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <button
                className="w-full py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-opacity"
                style={{ background: orgName.trim() ? '#2a5f6f' : '#9ca3af' }}
                disabled={!orgName.trim() || saving}
                onClick={handleCreateOrg}
              >
                {saving ? 'Creating…' : (
                  <>Create Organization <FontAwesomeIcon icon={faArrowRight} /></>
                )}
              </button>
            </div>
          </>
        )}

        {/* ── Step: invite ── */}
        {step === 'invite' && (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Invite your team</h2>
              <p className="text-sm text-gray-500 mt-1">
                Generate invite links for each role. Links are single-use and expire in 7 days.
              </p>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Role to invite
                </label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                  value={inviteRole}
                  onChange={(e) => { setInviteRole(e.target.value as UserRole); setInviteUrl(''); }}
                >
                  {INVITE_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              <button
                className="w-full py-2.5 rounded-lg text-white font-medium text-sm transition-opacity"
                style={{ background: '#2a5f6f' }}
                disabled={generating}
                onClick={handleGenerateInvite}
              >
                {generating ? 'Generating…' : 'Generate Invite Link'}
              </button>

              {inviteError && <p className="text-sm text-red-500">{inviteError}</p>}

              {inviteUrl && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Invite URL
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={inviteUrl}
                      className="flex-1 text-xs text-gray-700 bg-transparent border-none outline-none truncate"
                    />
                    <button
                      onClick={handleCopy}
                      className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-white flex items-center gap-1.5"
                      style={{ background: copied ? '#16a34a' : '#2a5f6f' }}
                    >
                      <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-gray-100 flex gap-3">
                <button
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50"
                  onClick={handleFinish}
                >
                  Skip for now
                </button>
                <button
                  className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2"
                  style={{ background: '#2a5f6f' }}
                  onClick={handleFinish}
                >
                  Enter myABA <FontAwesomeIcon icon={faArrowRight} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
