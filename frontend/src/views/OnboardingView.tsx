import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBrain, faBuilding, faCopy, faCheck, faArrowRight, faFileContract, faShieldAlt, faFlask, faEnvelope, faSignOutAlt } from '@fortawesome/free-solid-svg-icons';
import { auth } from '../lib/firebase';
import { api } from '../lib/api';
import { BAA_TEXT } from '../lib/baaText';
import type { OrgPlan, UserRole } from '../types';

const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === 'true';

/**
 * Set to true during the pathfinder early-access period.
 * Flip to false when self-service sign-up is open to the public.
 */
const CLOSED_BETA = true;


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

type Step = 'org' | 'baa' | 'invite' | 'done';

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

  // BAA step
  const [signerName, setSignerName]   = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [baaChecked, setBaaChecked]   = useState(false);
  const [baaLoading, setBaaLoading]   = useState(false);
  const [baaError, setBaaError]       = useState('');

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
      // Force token refresh so new orgId/role claims are ready for the BAA call
      if (!DEV_AUTH) {
        try { await auth.currentUser?.getIdToken(true); } catch { /* non-fatal */ }
      }
      setStep('baa');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create organization');
    } finally {
      setSaving(false);
    }
  };

  // ── Step 2: Accept BAA ────────────────────────────────────────────────────

  const handleAcceptBaa = async () => {
    if (!signerName.trim() || !signerTitle.trim() || !baaChecked) return;
    setBaaLoading(true);
    setBaaError('');
    try {
      await api.acceptBaa(orgId, { signerName: signerName.trim(), signerTitle: signerTitle.trim() });
      setStep('invite');
    } catch (e: unknown) {
      setBaaError(e instanceof Error ? e.message : 'Failed to record BAA acceptance');
    } finally {
      setBaaLoading(false);
    }
  };

  // ── Step 3: Invite teammates ───────────────────────────────────────────────

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

  // ── Closed-beta gate ──────────────────────────────────────────────────────
  // During the pathfinder period, self-service org creation is disabled.
  // Anyone who signs in without a pre-provisioned org sees this screen.

  if (CLOSED_BETA) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #F0F7FA 0%, #E8F4FF 100%)',
          padding: 24,
        }}
      >
        <div style={{
          width: '100%',
          maxWidth: 480,
          background: 'white',
          borderRadius: 24,
          boxShadow: '0 8px 40px rgba(0,0,0,0.10)',
          padding: '48px 40px 36px',
          border: '1px solid #E4EEF3',
          textAlign: 'center',
        }}>
          {/* Logo */}
          <div style={{
            width: 72, height: 72, borderRadius: 18,
            background: 'white', boxShadow: '0 4px 14px rgba(0,0,0,0.10)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', overflow: 'hidden',
          }}>
            <img
              src="/app-icon.png"
              alt="myABA.ai"
              style={{ width: 58, height: 58, objectFit: 'contain' }}
              onError={(e) => { (e.target as HTMLImageElement).src = '/favicon.svg'; }}
            />
          </div>

          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 6 }}>
            <span style={{ color: '#1E3347' }}>my</span>
            <span style={{ color: '#1E88FF' }}>ABA</span>
            <span style={{ color: '#3F9B2F' }}>.ai</span>
          </div>

          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'linear-gradient(135deg, #EEF7EA, #E6F4FF)',
            border: '1px solid #B9DEB0', borderRadius: 20,
            padding: '5px 14px', marginBottom: 28,
          }}>
            <FontAwesomeIcon icon={faFlask} style={{ color: '#3F9B2F', fontSize: 11 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#2E6B20', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Pathfinder Early Access
            </span>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1E3347', marginBottom: 12 }}>
            We're not quite open yet
          </h2>

          <p style={{ fontSize: 14, color: '#4A5568', lineHeight: 1.65, marginBottom: 10 }}>
            myABA.ai is currently running a <strong>closed early-access program</strong> with a
            select group of pathfinder agencies — the real-world partners helping us shape the
            platform before we open more broadly.
          </p>

          <p style={{ fontSize: 14, color: '#4A5568', lineHeight: 1.65, marginBottom: 28 }}>
            If you're part of a pathfinder agency, your administrator should have sent you an
            invitation link. If you believe this is a mistake, reach out to your org admin or
            contact us directly.
          </p>

          {/* CTA buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <a
              href="mailto:hello@myaba.ai?subject=Pathfinder%20Waitlist%20Interest"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px 0',
                background: 'linear-gradient(135deg, #1E88FF, #1565C0)',
                borderRadius: 10, color: 'white',
                fontSize: 14, fontWeight: 700, textDecoration: 'none',
                boxShadow: '0 2px 8px rgba(30,136,255,0.30)',
              }}
            >
              <FontAwesomeIcon icon={faEnvelope} style={{ fontSize: 13 }} />
              Join the Waitlist
            </a>

            <button
              onClick={() => auth.signOut()}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '11px 0',
                background: 'transparent', border: '1.5px solid #DCE7EE',
                borderRadius: 10, color: '#6B7B88',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F4F7F9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <FontAwesomeIcon icon={faSignOutAlt} style={{ fontSize: 13 }} />
              Sign Out
            </button>
          </div>

          <p style={{ fontSize: 11, color: '#A8B4BF', marginTop: 24, lineHeight: 1.6 }}>
            HIPAA-compliant platform &nbsp;·&nbsp; All data encrypted in transit
            <br />
            &copy; {new Date().getFullYear()} myABA.ai &nbsp;·&nbsp; All rights reserved
          </p>
        </div>
      </div>
    );
  }

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
          {(['org', 'baa', 'invite'] as Step[]).map((s, i) => {
            const ORDER: Step[] = ['org', 'baa', 'invite', 'done'];
            const cur  = ORDER.indexOf(step);
            const idx  = ORDER.indexOf(s);
            const past = cur > idx;
            return (
              <div key={s} className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background: step === s ? '#2a5f6f' : past ? '#5fb3d0' : '#e5e7eb',
                    color: step === s || past ? 'white' : '#9ca3af',
                  }}
                >
                  {past ? <FontAwesomeIcon icon={faCheck} style={{ fontSize: 11 }} /> : i + 1}
                </div>
                {i < 2 && (
                  <div className="h-px flex-1 min-w-[20px]"
                       style={{ background: past ? '#5fb3d0' : '#e5e7eb' }} />
                )}
              </div>
            );
          })}
          <div className="ml-auto text-xs text-gray-400">
            {step === 'org'    && 'Set up your organization'}
            {step === 'baa'    && 'Review & sign BAA'}
            {step === 'invite' && 'Invite your team'}
            {step === 'done'   && 'All set!'}
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

        {/* ── Step: baa ── */}
        {step === 'baa' && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                   style={{ background: '#e8f4f8' }}>
                <FontAwesomeIcon icon={faFileContract} style={{ color: '#2a5f6f', fontSize: 18 }} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Business Associate Agreement</h2>
                <p className="text-sm text-gray-500">Required under HIPAA before your organization may process PHI.</p>
              </div>
            </div>

            {/* BAA text scroll box */}
            <div
              className="rounded-xl border border-gray-200 bg-gray-50 p-4 mb-4 overflow-y-auto text-xs text-gray-600 leading-relaxed whitespace-pre-wrap font-mono"
              style={{ maxHeight: 220 }}
            >
              {BAA_TEXT}
            </div>

            {/* Signer fields */}
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Full Legal Name
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                  placeholder="e.g. Jane Smith"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Title / Position
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                  placeholder="e.g. Executive Director"
                  value={signerTitle}
                  onChange={(e) => setSignerTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && baaChecked) handleAcceptBaa(); }}
                />
              </div>
            </div>

            {/* Authority checkbox */}
            <label className="flex items-start gap-3 cursor-pointer mb-4 group">
              <input
                type="checkbox"
                className="mt-0.5 shrink-0 accent-teal-700"
                checked={baaChecked}
                onChange={(e) => setBaaChecked(e.target.checked)}
              />
              <span className="text-xs text-gray-600 leading-relaxed">
                I have read the Business Associate Agreement above and have authority to bind
                my organization to these terms. I accept this BAA on behalf of my organization.
              </span>
            </label>

            {/* HIPAA notice */}
            <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 mb-4">
              <FontAwesomeIcon icon={faShieldAlt} style={{ color: '#1d4ed8', fontSize: 12, marginTop: 2, flexShrink: 0 }} />
              <p className="text-xs text-blue-700 leading-relaxed">
                A signed BAA is required by 45 C.F.R. § 164.504(e) before a Business Associate
                may create, receive, maintain, or transmit PHI on your behalf.
              </p>
            </div>

            {baaError && <p className="text-sm text-red-500 mb-3">{baaError}</p>}

            <button
              className="w-full py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-opacity"
              style={{
                background: (signerName.trim() && signerTitle.trim() && baaChecked) ? '#2a5f6f' : '#9ca3af',
              }}
              disabled={!signerName.trim() || !signerTitle.trim() || !baaChecked || baaLoading}
              onClick={handleAcceptBaa}
            >
              {baaLoading ? 'Recording acceptance…' : (
                <>Accept BAA &amp; Continue <FontAwesomeIcon icon={faArrowRight} /></>
              )}
            </button>
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
