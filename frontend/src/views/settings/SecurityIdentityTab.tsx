import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import {
  faLock, faShieldHalved, faClock, faRightToBracket, faDatabase, faMobileScreen,
} from '@fortawesome/free-solid-svg-icons';
import {
  SettingsCard, Badge, Toggle, SelectPill, SettingRow, SectionHeading,
} from '../../components/settings/primitives';

const TIMEOUT_OPTIONS = [
  { value: '5', label: '5 minutes' }, { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' }, { value: '60', label: '60 minutes' },
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

  useEffect(() => {
    if (!orgId) return;
    api.getOrg(orgId).then((o) => {
      setTimeoutMin(String(o.settings?.sessionTimeoutMinutes ?? 15));
      setMfaEnforced(Boolean(o.settings?.mfaEnforced));
    }).catch(() => {});
  }, [orgId]);

  const changeTimeout = async (v: string) => {
    setTimeoutMin(v);
    await api.updateOrgSettings(orgId, { sessionTimeoutMinutes: Number(v) }).catch(() => {});
  };

  const toggleMfaEnforced = async (next: boolean) => {
    setMfaEnforced(next);
    await api.updateOrgSettings(orgId, { mfaEnforced: next }).catch(() => setMfaEnforced(!next));
  };

  return (
    <div className="max-w-4xl">
      <SectionHeading title="Security & Identity" description="Manage how users sign in, verify their identity, and how long sessions stay active." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
        <SettingsCard icon={faLock} title="Authentication" subtitle="How users sign in and verify their identity.">
          <div className="divide-y divide-gray-100">
            <SettingRow
              icon={faRightToBracket} iconColor="#1E88FF"
              title="Single Sign-On"
              description="Users sign in with Google via Firebase Authentication."
              control={<Badge tone="green">Enabled</Badge>}
            />
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
              description="Records are retained for the HIPAA-required period."
              control={<span className="text-sm text-gray-500">7 years</span>}
            />
          </div>
          <div className="px-5 sm:px-6 py-3 text-xs text-gray-400 bg-gray-50 border-t border-gray-100 rounded-b-2xl">
            Data retention applies platform-wide and cannot be overridden per organization.
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}
