import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import {
  faLock, faShieldHalved, faClock, faDatabase, faMobileScreen,
} from '@fortawesome/free-solid-svg-icons';
import {
  SettingsCard, Badge, Toggle, SelectPill, SettingRow, SectionHeading,
} from '../../components/settings/primitives';

const TIMEOUT_OPTIONS = [
  { value: '5', label: '5 minutes' }, { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' }, { value: '60', label: '60 minutes' },
];

// Data-retention window options (days). Minimum 30 days; longest aligns with the HIPAA-required period.
const RETENTION_OPTIONS = [
  { value: '30',   label: '30 days' },
  { value: '90',   label: '90 days' },
  { value: '180',  label: '6 months' },
  { value: '365',  label: '1 year' },
  { value: '730',  label: '2 years' },
  { value: '2190', label: '6 years' },
  { value: '2555', label: '7 years (HIPAA)' },
];

/**
 * Security & Identity — single sign-in pool (no multi-tenancy offered yet).
 * Only surfaces controls that are actually real today:
 *  - Google sign-in (centralized), MFA enrollment (TOTP), session timeout (app-enforced).
 * Per-org SSO connections / IdP role-mapping / provisioning / domain restrictions are
 * deliberately NOT shown — they imply multi-tenant capability we don't offer. The
 * role-config backend keeps persisting that data so the move to tenants stays mechanical.
 */
export default function SecurityIdentityTab({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const [timeout, setTimeoutMin] = useState('15');
  const [mfaEnforced, setMfaEnforced] = useState(false);
  const [retentionDays, setRetentionDays] = useState('2555');

  useEffect(() => {
    if (!orgId) return;
    api.getOrg(orgId).then((o) => {
      setTimeoutMin(String(o.settings?.sessionTimeoutMinutes ?? 15));
      setMfaEnforced(Boolean(o.settings?.mfaEnforced));
      setRetentionDays(String(o.settings?.retentionDays ?? 2555));
    }).catch(() => {});
  }, [orgId]);

  const changeTimeout = async (v: string) => {
    setTimeoutMin(v);
    await api.updateOrgSettings(orgId, { sessionTimeoutMinutes: Number(v) }).catch(() => {});
  };

  const changeRetention = async (v: string) => {
    const prev = retentionDays;
    setRetentionDays(v);
    await api.updateOrgSettings(orgId, { retentionDays: Number(v) }).catch(() => setRetentionDays(prev));
  };

  const toggleMfaEnforced = async (next: boolean) => {
    setMfaEnforced(next);
    await api.updateOrgSettings(orgId, { mfaEnforced: next }).catch(() => setMfaEnforced(!next));
  };

  return (
    <div className="max-w-4xl">
      <SectionHeading title="Security & Identity" description="Manage how users sign in, verify their identity, and how long sessions stay active." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
        <SettingsCard
          icon={faLock}
          title="Authentication"
          subtitle="Members sign in with Google (Single Sign-On)."
          action={<Badge tone="green">SSO Enabled</Badge>}
        >
          <div className="divide-y divide-gray-100">
            <SettingRow
              icon={faMobileScreen} iconColor="#16a34a"
              title="Multi-Factor Authentication"
              description={mfaEnforced
                ? 'Required — every member must enroll an authenticator (TOTP) before accessing the app.'
                : 'Authenticator-app (TOTP) two-factor is available. Turn on to require it for all members.'}
              control={
                <div className="flex items-center gap-2.5">
                  <Badge tone={mfaEnforced ? 'green' : 'neutral'}>{mfaEnforced ? 'Required' : 'Available'}</Badge>
                  <Toggle checked={mfaEnforced} onChange={toggleMfaEnforced} disabled={!isAdmin} label="Require MFA for all members" />
                </div>
              }
            />
            <SettingRow
              icon={faClock} iconColor="#F5A623"
              title="Session Timeout"
              description="Automatically sign out inactive users."
              control={<SelectPill ariaLabel="Session timeout" tone="neutral" value={timeout} options={TIMEOUT_OPTIONS} onChange={changeTimeout} disabled={!isAdmin} />}
            />
          </div>
        </SettingsCard>

        <SettingsCard icon={faDatabase} iconColor="#1E88FF" title="Data Retention" subtitle="How long data is retained before permanent deletion.">
          <div className="divide-y divide-gray-100">
            <SettingRow
              icon={faShieldHalved} iconColor="#64748B"
              title="Retention Policy"
              description="How long this organization's records are kept before permanent deletion."
              control={<SelectPill ariaLabel="Data retention period" tone="neutral" value={retentionDays} options={RETENTION_OPTIONS} onChange={changeRetention} disabled={!isAdmin} />}
            />
          </div>
          <div className="px-5 sm:px-6 py-3 text-xs text-gray-400 bg-gray-50 border-t border-gray-100 rounded-b-2xl">
            Minimum 30 days. Audit &amp; compliance logs are always retained for the HIPAA-required 6-year minimum, regardless of this setting.
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}
