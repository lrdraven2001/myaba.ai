import { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUser, faUserTie, faUserShield, faUserGear, faUserClock,
  faPlus, faTrash, faChevronRight, faUsers, faDiagramProject, faFileLines,
  faBookOpen, faPeopleGroup, faWandMagicSparkles, faGear,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { api } from '../../lib/api';
import type {
  RoleConfig, CustomRole, PermissionCategory, PermissionLevel,
} from '../../types';
import {
  SettingsCard, Badge, SelectPill, PrimaryButton, SecondaryButton,
} from '../../components/settings/primitives';

// ── Canonical roles ─────────────────────────────────────────────────────────────
type CanonRole = {
  key: string; label: string; blurb: string;
  badge?: { tone: 'neutral' | 'amber' | 'purple'; text: string };
  icon: IconDefinition; color: string; system?: boolean;
};

const CANON_ROLES: CanonRole[] = [
  { key: 'ORG_SUPER_ADMIN',   label: 'Practice Administrator', blurb: 'Full system access', badge: { tone: 'neutral', text: 'System' }, icon: faUser, color: '#1E88FF', system: true },
  { key: 'CLINICAL_DIRECTOR', label: 'Clinical Director',      blurb: 'Manage clinical operations', icon: faUserTie, color: '#3F9B2F' },
  { key: 'SUPERVISING_BCBA',  label: 'Clinical Supervisor',    blurb: 'Oversee clinical staff and cases', badge: { tone: 'purple', text: 'Baseline' }, icon: faUserShield, color: '#7C3AED' },
  { key: 'RBT',               label: 'Behavior Technician',    blurb: 'Provide direct client services', badge: { tone: 'purple', text: 'Baseline' }, icon: faUserGear, color: '#F5A623' },
  { key: 'GENERAL_STAFF',     label: 'General Staff',          blurb: 'Limited non-clinical access', badge: { tone: 'amber', text: 'Restricted · Non-HIPAA' }, icon: faUserClock, color: '#CA8A04' },
];

// ── Permission categories ───────────────────────────────────────────────────────
const CATEGORIES: { key: PermissionCategory; label: string; desc: string; icon: IconDefinition; color: string }[] = [
  { key: 'clients',        label: 'Clients',        desc: 'View, create, edit, and manage clients and guardians.', icon: faUsers, color: '#1E88FF' },
  { key: 'projects',       label: 'Projects',       desc: 'View, create, edit, and manage projects and cases.', icon: faDiagramProject, color: '#3F9B2F' },
  { key: 'documents',      label: 'Documents',      desc: 'View, create, edit, and manage documents and reports.', icon: faFileLines, color: '#7C3AED' },
  { key: 'resources',      label: 'Resources',      desc: 'Access and manage templates and resource library.', icon: faBookOpen, color: '#F5A623' },
  { key: 'team',           label: 'Team',           desc: 'Manage team members, roles, and permissions.', icon: faPeopleGroup, color: '#1E88FF' },
  { key: 'ai_features',    label: 'AI Features',    desc: 'Use AI chat, document generation, and smart tools.', icon: faWandMagicSparkles, color: '#7C3AED' },
  { key: 'administration', label: 'Administration', desc: 'Manage organization settings, billing, and integrations.', icon: faGear, color: '#64748B' },
];

const LEVEL_OPTIONS = [
  { value: 'all',    label: 'All Access' },
  { value: 'custom', label: 'Custom' },
  { value: 'none',   label: 'No Access' },
];

const ALL: Record<PermissionCategory, PermissionLevel> = {
  clients: 'all', projects: 'all', documents: 'all', resources: 'all', team: 'all', ai_features: 'all', administration: 'all',
};

// Sensible default permission matrix per canonical role (starting point; editable).
const DEFAULTS: Record<string, Partial<Record<PermissionCategory, PermissionLevel>>> = {
  ORG_SUPER_ADMIN:   { ...ALL, resources: 'custom' },
  CLINICAL_DIRECTOR: { clients: 'all', projects: 'all', documents: 'all', resources: 'all', team: 'all', ai_features: 'all', administration: 'custom' },
  SUPERVISING_BCBA:  { clients: 'all', projects: 'all', documents: 'all', resources: 'custom', team: 'none', ai_features: 'all', administration: 'none' },
  RBT:               { clients: 'none', projects: 'all', documents: 'custom', resources: 'none', team: 'none', ai_features: 'all', administration: 'none' },
  GENERAL_STAFF:     { clients: 'none', projects: 'none', documents: 'none', resources: 'custom', team: 'none', ai_features: 'custom', administration: 'none' },
};

const EMPTY_CONFIG: RoleConfig = { roles: {}, customRoles: [], idpRoleMappings: [] };

export default function RolesPermissionsTab({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const [config, setConfig]   = useState<RoleConfig>(EMPTY_CONFIG);
  const [dirty, setDirty]     = useState(false);
  const [saving, setSaving]   = useState(false);
  const [selectedKey, setSelectedKey] = useState('ORG_SUPER_ADMIN');
  const [expandAll, setExpandAll]     = useState(false);

  useEffect(() => {
    if (!orgId) return;
    api.getRoleConfig(orgId)
      .then((c) => setConfig({ roles: c.roles ?? {}, customRoles: c.customRoles ?? [], idpRoleMappings: c.idpRoleMappings ?? [] }))
      .catch(() => {});
  }, [orgId]);

  // All roles = canonical + custom
  const allRoles = useMemo(() => {
    const customs = (config.customRoles ?? []).map((r) => ({
      key: r.key, label: r.label, blurb: r.description ?? 'Custom role',
      badge: { tone: 'neutral' as const, text: 'Custom' }, icon: faUser, color: '#2a5f6f', system: false, custom: true,
    }));
    return [...CANON_ROLES.map((r) => ({ ...r, custom: false })), ...customs];
  }, [config.customRoles]);

  const selected = allRoles.find((r) => r.key === selectedKey) ?? allRoles[0];

  // Effective permission level for a role+category (stored override → default → 'none')
  const levelFor = (roleKey: string, cat: PermissionCategory): PermissionLevel => {
    const stored = config.roles?.[roleKey]?.[cat];
    if (stored) return stored;
    const custom = config.customRoles?.find((r) => r.key === roleKey);
    if (custom) return custom.permissions?.[cat] ?? DEFAULTS[custom.baseline ?? '']?.[cat] ?? 'none';
    return DEFAULTS[roleKey]?.[cat] ?? 'none';
  };

  const setLevel = (roleKey: string, cat: PermissionCategory, level: PermissionLevel) => {
    setConfig((c) => ({
      ...c,
      roles: { ...c.roles, [roleKey]: { ...(c.roles?.[roleKey] ?? {}), [cat]: level } },
    }));
    setDirty(true);
  };

  const addRole = () => {
    const name = window.prompt('Name for the new role:')?.trim();
    if (!name) return;
    const key = `custom_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Math.random().toString(36).slice(2, 6)}`;
    const role: CustomRole = { key, label: name, description: 'Custom role', baseline: 'GENERAL_STAFF', permissions: { ...DEFAULTS.GENERAL_STAFF } };
    setConfig((c) => ({ ...c, customRoles: [...(c.customRoles ?? []), role] }));
    setSelectedKey(key);
    setDirty(true);
  };

  const deleteRole = (key: string) => {
    setConfig((c) => {
      const { [key]: _drop, ...roles } = c.roles ?? {};
      return { ...c, roles, customRoles: (c.customRoles ?? []).filter((r) => r.key !== key) };
    });
    if (selectedKey === key) setSelectedKey('ORG_SUPER_ADMIN');
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.saveRoleConfig(orgId, config);
      setConfig({ roles: saved.roles ?? {}, customRoles: saved.customRoles ?? [], idpRoleMappings: saved.idpRoleMappings ?? config.idpRoleMappings });
      setDirty(false);
    } catch { /* keep dirty */ } finally { setSaving(false); }
  };

  const levelTone = (l: PermissionLevel) => (l === 'all' ? 'green' : l === 'custom' ? 'blue' : 'neutral') as 'green' | 'blue' | 'neutral';

  return (
    <div className="max-w-6xl">
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
        {/* Roles list */}
        <SettingsCard
          title="Roles"
          subtitle="Manage roles and their permissions."
          action={isAdmin ? <SecondaryButton icon={faPlus} onClick={addRole}>New Role</SecondaryButton> : undefined}
        >
          <div className="px-3 pb-3 space-y-1.5">
            {allRoles.map((r) => {
              const active = r.key === selectedKey;
              return (
                <button
                  key={r.key}
                  onClick={() => setSelectedKey(r.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors border ${active ? 'border-teal-300 bg-teal-50/60' : 'border-transparent hover:bg-gray-50'}`}
                >
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${r.color}1A` }}>
                    <FontAwesomeIcon icon={r.icon} style={{ color: r.color, fontSize: 15 }} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 truncate">{r.label}</span>
                      {r.badge && <Badge tone={r.badge.tone}>{r.badge.text}</Badge>}
                    </span>
                    <span className="block text-xs text-gray-500 truncate">{r.blurb}</span>
                  </span>
                  <FontAwesomeIcon icon={faChevronRight} className="text-gray-300 shrink-0" style={{ fontSize: 12 }} />
                </button>
              );
            })}
          </div>
          <div className="mx-3 mb-3 rounded-xl bg-gray-50 border border-gray-100 px-3.5 py-3 text-xs text-gray-500 leading-relaxed">
            <span className="font-semibold text-gray-600">System roles cannot be deleted.</span> You can create custom roles to fit your organization's needs.
          </div>
        </SettingsCard>

        {/* Role detail */}
        <SettingsCard
          icon={selected?.icon}
          iconColor={selected?.color}
          title={<span className="flex items-center gap-2">{selected?.label}{selected?.badge && <Badge tone={selected.badge.tone}>{selected.badge.text}</Badge>}</span>}
          subtitle={selected?.system ? 'Full system access with all permissions enabled.' : selected?.blurb}
          action={
            <div className="flex items-center gap-2">
              <button onClick={() => setExpandAll((v) => !v)} className="text-sm font-semibold text-teal-700 hover:underline">
                {expandAll ? 'Collapse All' : 'Expand All'}
              </button>
              {selected && !selected.system && isAdmin && (
                <SecondaryButton icon={faTrash} onClick={() => deleteRole(selected.key)}>Delete</SecondaryButton>
              )}
            </div>
          }
        >
          <div className="px-5 sm:px-6 pb-2">
            <h4 className="text-sm font-semibold text-gray-900">Permissions</h4>
            <p className="text-xs text-gray-500 mb-1">Configure what this role can access and manage.</p>
          </div>
          <div className="divide-y divide-gray-100">
            {CATEGORIES.map((cat) => {
              const lvl = selected ? levelFor(selected.key, cat.key) : 'none';
              return (
                <div key={cat.key} className="px-5 sm:px-6 py-3.5">
                  <div className="flex items-center gap-3.5">
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${cat.color}1A` }}>
                      <FontAwesomeIcon icon={cat.icon} style={{ color: cat.color, fontSize: 15 }} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900">{cat.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{cat.desc}</div>
                    </div>
                    <SelectPill
                      ariaLabel={`${cat.label} access for ${selected?.label}`}
                      tone={levelTone(lvl)}
                      value={lvl}
                      options={LEVEL_OPTIONS}
                      onChange={(v) => selected && setLevel(selected.key, cat.key, v as PermissionLevel)}
                      disabled={!isAdmin}
                    />
                  </div>
                  {expandAll && (
                    <div className="mt-2 ml-12 text-xs text-gray-400">
                      Fine-grained actions (view · create · edit · delete) inherit from the level above.
                      Per-action control is part of Advanced Permissions.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="px-5 sm:px-6 py-4 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-900">Advanced Permissions</div>
                <div className="text-xs text-gray-500">Fine-grained permissions for specific actions and data.</div>
              </div>
              <Badge tone="amber">Enforcement coming soon</Badge>
            </div>
          </div>
        </SettingsCard>
      </div>

      {/* Save bar */}
      {dirty && (
        <div className="sticky bottom-0 mt-6 -mx-8 px-8 py-3 bg-white/90 backdrop-blur-sm border-t border-gray-200 flex items-center gap-3">
          <PrimaryButton onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</PrimaryButton>
          <SecondaryButton onClick={() => { setDirty(false); api.getRoleConfig(orgId).then((c) => setConfig({ roles: c.roles ?? {}, customRoles: c.customRoles ?? [], idpRoleMappings: c.idpRoleMappings ?? [] })).catch(() => {}); }}>Cancel</SecondaryButton>
          <span className="text-xs text-gray-400">Permission changes are saved to your organization. Cross-app enforcement is a follow-on.</span>
        </div>
      )}
    </div>
  );
}
