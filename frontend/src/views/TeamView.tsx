import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUserPlus, faEnvelope, faToggleOn, faToggleOff,
  faArrowLeft, faChevronRight, faTimes, faMailBulk,
  faUsers, faHistory, faUserCog, faCommentDots, faFileAlt,
  faLink, faCheck, faCopy, faSpinner,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { api } from '../lib/api';
import { ALL_ROLE_LABELS as ROLE_LABELS, ASSIGNABLE_ROLES, canSupervise } from '../types';

// ── Types & constants ─────────────────────────────────────────────────────────

type UserDetailTab = 'profile' | 'clients' | 'usage';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  supervisorId?: string;
}


const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  ORG_SUPER_ADMIN:   { bg: '#ede9fe', text: '#6d28d9' },
  CLINICAL_DIRECTOR: { bg: '#ede9fe', text: '#6d28d9' },
  ORG_ADMIN:         { bg: '#fef3c7', text: '#92400e' },
  TREATING_BCBA:     { bg: '#d1fae5', text: '#065f46' },
  SUPERVISING_BCBA:  { bg: '#d1fae5', text: '#065f46' },
  BCBA_STUDENT:      { bg: '#ede9fe', text: '#5b21b6' },
  RBT:               { bg: '#EEF4FF', text: '#1E88FF' },
  GENERAL_STAFF:     { bg: '#f3f4f6', text: '#374151' },
  SCHEDULING_ADMIN:  { bg: '#f0fdf4', text: '#166534' },
  BILLING_ADMIN:     { bg: '#fff7ed', text: '#92400e' },
};

const AVATAR_COLORS = ['#3F9B2F', '#1E88FF', '#F5A623', '#9c27b0', '#e91e63'];

function toInitials(name: string | undefined | null) {
  return (name ?? '').split(/\s+/).map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 2) || '?';
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function TeamView() {
  const { currentUser } = useAuth();
  const { can } = usePermissions();
  const isAdmin = can('ADMIN_MANAGE');
  const orgId   = currentUser?.orgId ?? '';

  const [members, setMembers]             = useState<TeamMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showInvite, setShowInvite]       = useState(false);
  const [showManageInvites, setShowManageInvites] = useState(false);
  const [inviteRole, setInviteRole]       = useState('RBT');
  const [inviteEmail, setInviteEmail]     = useState('');
  const [inviteUrl, setInviteUrl]         = useState('');
  const [inviteGenerating, setInviteGenerating] = useState(false);
  const [inviteError, setInviteError]     = useState('');
  const [inviteCopied, setInviteCopied]   = useState(false);
  // Org-defined custom roles (from the Roles & Permissions matrix) — assignable alongside
  // the built-in roles. Practice Administrator stays creator-only, not in this list.
  const [customRoles, setCustomRoles]     = useState<{ key: string; label: string }[]>([]);
  const [inviteEmailStatus, setInviteEmailStatus] = useState<'idle' | 'sent' | 'error'>('idle');
  const [inviteEmailErr, setInviteEmailErr]       = useState('');

  // Load real members
  useEffect(() => {
    if (!orgId) return;
    api.getOrgMembers(orgId)
      .then((data) => {
        const mapped: TeamMember[] = data.map((m) => ({
          id:          m.id,
          name:        m.displayName,
          email:       m.email,
          role:        m.role,
          active:      m.active,
        }));
        setMembers(mapped);
      })
      .catch(() => setMembers([]))
      .finally(() => setLoadingMembers(false));
  }, [orgId]);

  // Load the org's custom roles so they can be assigned on invite.
  useEffect(() => {
    if (!orgId) return;
    api.getRoleConfig(orgId)
      .then((c) => setCustomRoles((c.customRoles ?? []).map((r) => ({ key: r.key, label: r.label }))))
      .catch(() => {});
  }, [orgId]);

  // Assignable roles = built-in assignable + org custom roles. {key,label} for the dropdowns.
  const assignableOptions = [
    ...ASSIGNABLE_ROLES.map((k) => ({ key: k, label: ROLE_LABELS[k] ?? k })),
    ...customRoles,
  ];
  const roleLabelOf = (role: string) =>
    ROLE_LABELS[role] ?? customRoles.find((r) => r.key === role)?.label ?? role;

  const handleOpenInvite = () => {
    setInviteRole('RBT');
    setInviteEmail('');
    setInviteUrl('');
    setInviteError('');
    setInviteCopied(false);
    setInviteEmailStatus('idle');
    setInviteEmailErr('');
    setShowInvite(true);
  };

  const handleEmailInvite = () => {
    const roleLabel = roleLabelOf(inviteRole);
    const subject = encodeURIComponent('Your invitation to MyABA.ai');
    const body = encodeURIComponent(
      `You've been invited to join your organization on MyABA.ai as a ${roleLabel}.\n\n` +
      `Click this single-use link to set up your account:\n${inviteUrl}\n\n` +
      `This link can only be used once and expires in 7 days.`,
    );
    window.location.href = `mailto:${inviteEmail.trim()}?subject=${subject}&body=${body}`;
  };

  const handleGenerateInviteLink = async () => {
    setInviteGenerating(true);
    setInviteError('');
    setInviteUrl('');
    setInviteCopied(false);
    setInviteEmailStatus('idle');
    setInviteEmailErr('');
    try {
      const to = inviteEmail.trim();
      // When a recipient email is supplied, the backend emails the link server-side.
      const res = await api.generateInvite(orgId, inviteRole, to || undefined, roleLabelOf(inviteRole));
      setInviteUrl(res.inviteUrl);
      if (to) {
        if (res.emailSent) {
          setInviteEmailStatus('sent');
        } else {
          setInviteEmailStatus('error');
          setInviteEmailErr(res.emailError || 'Email could not be sent — copy the link and send it manually.');
        }
      }
    } catch (e: unknown) {
      setInviteError(e instanceof Error ? e.message : 'Failed to generate invite link');
    } finally {
      setInviteGenerating(false);
    }
  };

  const handleCopyInvite = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  const handleCloseInvite = () => {
    setShowInvite(false);
    setInviteEmail('');
    setInviteUrl('');
    setInviteError('');
    setInviteCopied(false);
    setInviteEmailStatus('idle');
    setInviteEmailErr('');
  };

  // ── User detail view ──────────────────────────────────────────────────────

  if (selectedMember) {
    return (
      <UserDetailView
        member={selectedMember}
        isAdmin={isAdmin}
        allMembers={members}
        roleOptions={assignableOptions}
        onBack={() => setSelectedMember(null)}
        onUpdate={(updated) => {
          setMembers((prev) => prev.map((m) => m.id === updated.id ? updated : m));
          setSelectedMember(updated);
        }}
      />
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <h1 className="text-base font-semibold text-gray-900">Team Members</h1>
        <div className="flex-1" />
        <span className="text-sm text-gray-400">
          {loadingMembers ? 'Loading…' : `${members.length} member${members.length !== 1 ? 's' : ''}`}
        </span>
        {isAdmin && (
          <>
            <button
              onClick={() => setShowManageInvites(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
              style={{ borderColor: '#2a5f6f', color: '#2a5f6f', background: 'white' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#e8f4f8')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
            >
              <FontAwesomeIcon icon={faMailBulk} className="text-xs" />
              Manage Invites
            </button>
            <button
              onClick={handleOpenInvite}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold transition-colors"
              style={{ background: '#2a5f6f' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#1e4a56')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#2a5f6f')}
            >
              <FontAwesomeIcon icon={faUserPlus} className="text-xs" />
              Invite Member
            </button>
          </>
        )}
      </div>

      {/* Member list */}
      <div className="flex-1 overflow-y-auto bg-gray-50 px-6 py-5">
        {loadingMembers ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
            <FontAwesomeIcon icon={faSpinner} className="text-2xl animate-spin text-gray-300" />
            <p className="text-sm font-medium">Loading team…</p>
          </div>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
            <FontAwesomeIcon icon={faUsers} className="text-4xl text-gray-300" />
            <p className="text-base font-medium">No team members yet</p>
            <p className="text-sm text-center max-w-sm">
              Use <strong>Invite Member</strong> to generate an invite link and add your first staff member.
            </p>
          </div>
        ) : (
        <div className="space-y-2">
          {members.map((m, i) => {
            const colors   = ROLE_COLORS[m.role] ?? { bg: '#f3f4f6', text: '#374151' };
            const avatarBg = AVATAR_COLORS[i % AVATAR_COLORS.length];
            return (
              <div
                key={m.id}
                className="bg-white rounded-xl px-5 py-4 flex items-center gap-4 cursor-pointer group transition-all"
                style={{ border: '2px solid #DCE7EE', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', opacity: m.active ? 1 : 0.6 }}
                onClick={() => setSelectedMember(m)}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = '#F5A623';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(245,166,35,0.12)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = '#DCE7EE';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)';
                }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                  style={{ background: avatarBg }}
                >
                  {toInitials(m.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-sm">{m.name}</span>
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: colors.bg, color: colors.text }}
                    >
                      {ROLE_LABELS[m.role] ?? m.role}
                    </span>
                    {!m.active && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-400">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="flex items-center gap-1.5 text-xs text-gray-400">
                      <FontAwesomeIcon icon={faEnvelope} className="text-xs" />
                      {m.email}
                    </span>
                    {/* RBT — show supervisor name */}
                    {m.role === 'RBT' && (() => {
                      const sup = members.find((s) => s.id === m.supervisorId);
                      return sup ? (
                        <span className="text-xs text-gray-400">
                          Supervisor: <span className="font-medium text-gray-600">{sup.name}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-amber-500 font-medium">No supervisor assigned</span>
                      );
                    })()}
                    {/* Clinical Supervisor — show supervisee count */}
                    {m.role === 'SUPERVISING_BCBA' && (() => {
                      const count = members.filter((s) => s.supervisorId === m.id).length;
                      return count > 0 ? (
                        <span className="text-xs text-gray-400">
                          <span className="font-medium text-gray-600">{count}</span> supervisee{count !== 1 ? 's' : ''}
                        </span>
                      ) : null;
                    })()}
                  </div>
                </div>
                <FontAwesomeIcon
                  icon={faChevronRight}
                  className="text-gray-300 group-hover:text-yellow-400 transition-colors text-xs shrink-0"
                />
              </div>
            );
          })}
        </div>
        )}
      </div>

      {/* ── Invite modal ── */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Invite Team Member</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Generate a single-use link — share it however you like. Expires in 7 days.
                </p>
              </div>
              <button onClick={handleCloseInvite} className="text-gray-400 hover:text-gray-600">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Role
                </label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                  value={inviteRole}
                  onChange={(e) => { setInviteRole(e.target.value); setInviteUrl(''); setInviteError(''); }}
                  disabled={!!inviteUrl}
                >
                  {/* Built-in assignable roles + the org's custom roles. Practice
                      Administrator (ORG_SUPER_ADMIN) is creator-only, not offered here. */}
                  {assignableOptions.map((r) => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Recipient Email <span className="text-gray-400 normal-case font-normal">(optional — for emailing the link)</span>
                </label>
                <input
                  type="email"
                  placeholder="name@example.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>

              {/* Generated link */}
              {inviteUrl && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Invite Link — copy, share, or email
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={inviteUrl}
                      className="flex-1 text-xs text-gray-700 bg-transparent border-none outline-none truncate font-mono"
                    />
                    <button
                      onClick={handleCopyInvite}
                      className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-white flex items-center gap-1.5 transition-colors"
                      style={{ background: inviteCopied ? '#16a34a' : '#2a5f6f' }}
                    >
                      <FontAwesomeIcon icon={inviteCopied ? faCheck : faCopy} />
                      {inviteCopied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  {inviteEmailStatus === 'sent' && (
                    <p className="mt-2 text-xs font-medium text-green-700 flex items-center gap-1.5">
                      <FontAwesomeIcon icon={faCheck} /> Invitation emailed to {inviteEmail.trim()}
                    </p>
                  )}
                  {inviteEmailStatus === 'error' && (
                    <p className="mt-2 text-xs text-amber-700">{inviteEmailErr}</p>
                  )}
                  {/* Local mail-client draft — fallback when server email isn't configured. */}
                  {inviteEmailStatus !== 'sent' && (
                    <button
                      onClick={handleEmailInvite}
                      className="mt-2 w-full px-3 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 border transition-colors"
                      style={{ borderColor: '#2a5f6f', color: '#2a5f6f', background: 'white' }}
                    >
                      <FontAwesomeIcon icon={faEnvelope} />
                      {inviteEmail.trim() ? `Open email draft to ${inviteEmail.trim()}` : 'Open email draft with link'}
                    </button>
                  )}
                </div>
              )}

              {inviteError && (
                <p className="text-sm text-red-500">{inviteError}</p>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCloseInvite}
                className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                {inviteUrl ? 'Done' : 'Cancel'}
              </button>
              {!inviteUrl ? (
                <button
                  onClick={handleGenerateInviteLink}
                  disabled={inviteGenerating}
                  className="flex-1 py-2.5 rounded-lg text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                  style={{ background: '#2a5f6f' }}
                  onMouseEnter={(e) => { if (!inviteGenerating) (e.currentTarget as HTMLButtonElement).style.background = '#1e4a56'; }}
                  onMouseLeave={(e) => { if (!inviteGenerating) (e.currentTarget as HTMLButtonElement).style.background = '#2a5f6f'; }}
                >
                  {inviteGenerating ? (inviteEmail.trim() ? 'Sending…' : 'Generating…') : (
                    inviteEmail.trim()
                      ? <><FontAwesomeIcon icon={faEnvelope} className="text-xs" /> Send Invitation</>
                      : <><FontAwesomeIcon icon={faLink} className="text-xs" /> Generate Link</>
                  )}
                </button>
              ) : (
                <button
                  onClick={() => { setInviteUrl(''); setInviteError(''); setInviteCopied(false); }}
                  className="flex-1 py-2.5 rounded-lg text-white text-sm font-semibold transition-colors"
                  style={{ background: '#2a5f6f' }}
                  onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.background = '#1e4a56'}
                  onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.background = '#2a5f6f'}
                >
                  Generate Another
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Manage Invites modal ── */}
      {showManageInvites && (
        <ManageInvitesModal orgId={orgId} onClose={() => setShowManageInvites(false)} />
      )}
    </div>
  );
}

// ── User detail view ──────────────────────────────────────────────────────────

function UserDetailView({
  member, isAdmin, allMembers, roleOptions, onBack, onUpdate,
}: {
  member: TeamMember;
  isAdmin: boolean;
  allMembers: TeamMember[];
  roleOptions: { key: string; label: string }[];
  onBack: () => void;
  onUpdate: (m: TeamMember) => void;
}) {
  const { currentUser } = useAuth();
  const orgId = currentUser?.orgId ?? '';
  const [activeTab, setActiveTab] = useState<UserDetailTab>('profile');
  const memberIndex = allMembers.findIndex((m) => m.id === member.id);
  const avatarBg    = AVATAR_COLORS[memberIndex % AVATAR_COLORS.length];
  const colors      = ROLE_COLORS[member.role] ?? { bg: '#f3f4f6', text: '#374151' };

  const tabs: { key: UserDetailTab; label: string; icon: typeof faUserCog }[] = [
    { key: 'profile', label: 'Profile',          icon: faUserCog    },
    { key: 'clients', label: 'Assigned Clients',  icon: faUsers      },
    { key: 'usage',   label: 'Activity',          icon: faHistory    },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors shrink-0"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="text-xs" />
          Team
        </button>
        <span className="text-gray-300">/</span>
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ background: avatarBg }}
          >
            {toInitials(member.name)}
          </div>
          <span className="font-semibold text-gray-900 text-sm truncate">{member.name}</span>
          <span
            className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0"
            style={{ background: colors.bg, color: colors.text }}
          >
            {ROLE_LABELS[member.role] ?? member.role}
          </span>
          {!member.active && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-400 shrink-0">
              Inactive
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6 flex gap-0">
        {tabs.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2"
            style={{
              borderBottomColor: activeTab === key ? '#F5A623' : 'transparent',
              color: activeTab === key ? '#F5A623' : '#6b7280',
            }}
          >
            <FontAwesomeIcon icon={icon} className="text-xs" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
        {activeTab === 'profile' && (
          <UserProfileTab member={member} isAdmin={isAdmin} allMembers={allMembers} roleOptions={roleOptions} onUpdate={onUpdate} />
        )}
        {activeTab === 'clients' && (
          <UserClientsTab memberId={member.id} memberName={member.name} />
        )}
        {activeTab === 'usage' && (
          <UserUsageTab memberId={member.id} memberName={member.name} orgId={orgId} />
        )}
      </div>
    </div>
  );
}

// ── Profile tab ───────────────────────────────────────────────────────────────

function UserProfileTab({
  member, isAdmin, allMembers, roleOptions, onUpdate,
}: {
  member: TeamMember;
  isAdmin: boolean;
  allMembers: TeamMember[];
  roleOptions: { key: string; label: string }[];
  onUpdate: (m: TeamMember) => void;
}) {
  const orgId = (useAuth().currentUser as any)?.orgId ?? '';

  const [role, setRole]               = useState(member.role);
  const [active, setActive]           = useState(member.active);
  const [supervisorId, setSupervisorId] = useState(member.supervisorId ?? '');
  const [saved, setSaved]             = useState(false);
  const [supSaving, setSupSaving]     = useState(false);
  const [roleError, setRoleError]     = useState('');

  // Active supervisors available for RBT assignment (Supervising BCBA, Clinical
  // Director, or Practice Administrator — see canSupervise).
  const activeSupervisors = allMembers.filter(
    (m) => canSupervise(m.role) && m.active && m.id !== member.id,
  );

  // Supervisees if this member is a Clinical Supervisor
  const supervisees = allMembers.filter((m) => m.supervisorId === member.id);

  const handleRoleChange = (newRole: string) => {
    setRole(newRole);
    setSaved(false);
    // Clear supervisor assignment when user is no longer an RBT
    if (newRole !== 'RBT') setSupervisorId('');
  };

  const handleSave = async () => {
    setRoleError('');
    // Persist a role change through the sanctioned admin endpoint (re-mints the member's
    // claims + phiAccess). Invites never re-role — this is the one place roles change.
    if (role !== member.role) {
      try {
        await api.changeMemberRole(orgId, member.id, role);
      } catch (e) {
        setRole(member.role); // revert the dropdown to reality
        setRoleError(e instanceof Error ? e.message : 'Could not change this member’s role.');
        return; // don't report success or persist the rest
      }
    }
    // Persist supervisor assignment if it changed
    if (role === 'RBT' && supervisorId !== (member.supervisorId ?? '')) {
      setSupSaving(true);
      try {
        await api.setMemberSupervisor(orgId, member.id, supervisorId);
      } catch {
        // Non-fatal in dev mode — update local state anyway
      } finally {
        setSupSaving(false);
      }
    }
    onUpdate({ ...member, role, active, supervisorId: supervisorId || undefined });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="max-w-lg space-y-5">
      {/* Identity card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h4 className="font-semibold text-gray-800">User Information</h4>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Display Name
          </label>
          <input
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500"
            value={member.name}
            readOnly
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Email Address
          </label>
          <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
            <FontAwesomeIcon icon={faEnvelope} className="text-gray-400 text-xs shrink-0" />
            <span className="text-sm text-gray-500">{member.email}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            User ID
          </label>
          <input
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 font-mono"
            value={member.id}
            readOnly
          />
        </div>
      </div>

      {/* Role & status */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h4 className="font-semibold text-gray-800">Role & Access</h4>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Role
            </label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              value={role}
              onChange={(e) => handleRoleChange(e.target.value)}
              disabled={member.role === 'ORG_SUPER_ADMIN'}
            >
              {/* Same assignable list as the invite dropdown. If the member's
                  current role isn't assignable (creator = ORG_SUPER_ADMIN, or a
                  legacy role), show it too so it displays and isn't silently
                  overwritten — the select is disabled for ORG_SUPER_ADMIN anyway. */}
              {/* Built-in assignable roles + the org's custom roles. If the member's current
                  role isn't in the assignable set (creator = ORG_SUPER_ADMIN, or a legacy role),
                  show it too so it displays and isn't silently overwritten. */}
              {(roleOptions.some((r) => r.key === member.role)
                ? roleOptions
                : [{ key: member.role, label: ROLE_LABELS[member.role] ?? member.role }, ...roleOptions]
              ).map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
            {member.role === 'ORG_SUPER_ADMIN' && (
              <p className="text-xs text-gray-400 mt-1">Super Admin role cannot be changed.</p>
            )}
            {roleError && <p className="text-xs text-red-500 mt-1">{roleError}</p>}
          </div>

          <div className="flex items-center justify-between py-2 border-t border-gray-100">
            <div>
              <p className="text-sm font-medium text-gray-800">Account Active</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Inactive users cannot sign in but their data is preserved.
              </p>
            </div>
            <button
              onClick={() => { setActive((v) => !v); setSaved(false); }}
              style={{ color: active ? '#3F9B2F' : '#d1d5db' }}
              disabled={member.role === 'ORG_SUPER_ADMIN'}
            >
              <FontAwesomeIcon icon={active ? faToggleOn : faToggleOff} style={{ fontSize: 26 }} />
            </button>
          </div>

          <button
            onClick={handleSave}
            disabled={supSaving}
            className="px-5 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
            style={{ background: saved ? '#16a34a' : '#F5A623' }}
            onMouseEnter={(e) => { if (!saved) (e.currentTarget as HTMLButtonElement).style.background = '#d48f10'; }}
            onMouseLeave={(e) => { if (!saved) (e.currentTarget as HTMLButtonElement).style.background = '#F5A623'; }}
          >
            {saved ? '✓ Saved' : supSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}

      {/* Supervision card — RBT or Clinical Supervisor only */}
      {isAdmin && (role === 'RBT' || role === 'SUPERVISING_BCBA') && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faLink} className="text-gray-400 text-sm" />
            <h4 className="font-semibold text-gray-800">Supervision</h4>
          </div>

          {/* RBT: assign a supervisor */}
          {role === 'RBT' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Assigned Supervisor
              </label>
              {activeSupervisors.length === 0 ? (
                <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  No active Clinical Supervisors found. Add a supervisor to the team first.
                </p>
              ) : (
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  value={supervisorId}
                  onChange={(e) => { setSupervisorId(e.target.value); setSaved(false); }}
                >
                  <option value="">— Not assigned —</option>
                  {activeSupervisors.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
              {!supervisorId && (
                <p className="text-xs text-amber-500 mt-1">
                  Behavior Technicians should have a Clinical Supervisor assigned.
                </p>
              )}
            </div>
          )}

          {/* Clinical Supervisor: show supervisee list */}
          {role === 'SUPERVISING_BCBA' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Assigned Technicians
              </label>
              {supervisees.length === 0 ? (
                <p className="text-sm text-gray-400">
                  No Behavior Technicians are currently assigned to {member.name}.
                  Assign supervisors from each technician's profile.
                </p>
              ) : (
                <div className="space-y-2">
                  {supervisees.map((s) => {
                    const colors = ROLE_COLORS[s.role] ?? { bg: '#f3f4f6', text: '#374151' };
                    return (
                      <div
                        key={s.id}
                        className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5"
                      >
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ background: '#2a5f6f' }}
                        >
                          {toInitials(s.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
                          <p className="text-xs text-gray-400 truncate">{s.email}</p>
                        </div>
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0"
                          style={{ background: colors.bg, color: colors.text }}
                        >
                          {ROLE_LABELS[s.role] ?? s.role}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Assigned Clients tab ──────────────────────────────────────────────────────

function UserClientsTab({ memberId, memberName }: { memberId: string; memberName: string }) {
  const [clients, setClients] = useState<Array<{ id: string; name: string; diagnosis: string }>>([]);
  const [loading, setLoading] = useState(true);

  // Real assignments: a client is assigned to this member if they're anywhere on its care team.
  useEffect(() => {
    setLoading(true);
    api.getClients()
      .then((all) => {
        const mine = all
          .filter((c) =>
            c.treatingBcbaId === memberId ||
            c.supervisingBcbaId === memberId ||
            (c.supervisorIds ?? []).includes(memberId) ||
            (c.rbtIds ?? []).includes(memberId) ||
            (c.viewerIds ?? []).includes(memberId) ||
            (c.memberIds ?? []).includes(memberId))
          .map((c) => ({
            id: c.id,
            name: c.preferredName || [c.firstName, c.lastName].filter(Boolean).join(' ') || c.legalName || 'Client',
            diagnosis: c.diagnosis,
          }));
        setClients(mine);
      })
      .catch(() => setClients([]))
      .finally(() => setLoading(false));
  }, [memberId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <FontAwesomeIcon icon={faSpinner} className="animate-spin text-2xl" />
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
        <FontAwesomeIcon icon={faUsers} className="text-4xl text-gray-300" />
        <p className="text-base font-medium">No clients assigned</p>
        <p className="text-sm text-center">
          {memberName} has no clients assigned yet. Client assignments are managed from the
          Clients section.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg">
      <p className="text-sm text-gray-500 mb-4">
        {clients.length} client{clients.length !== 1 ? 's' : ''} assigned to {memberName}
      </p>
      <div className="space-y-2">
        {clients.map((c) => (
          <div
            key={c.id}
            className="bg-white rounded-xl px-5 py-4 flex items-center gap-4"
            style={{ border: '2px solid #DCE7EE', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
              style={{ background: '#3F9B2F' }}
            >
              {toInitials(c.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{c.name}</p>
              {c.diagnosis && (
                <span
                  className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ background: '#EEF4FF', color: '#1E88FF' }}
                >
                  {c.diagnosis}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Activity tab ──────────────────────────────────────────────────────────────

interface ActivityEntry { eventType: string; clientId?: string; documentId?: string; decision?: string; timestamp: string }

const ACTIVITY_STYLES: Record<string, { bg: string; color: string; icon: typeof faCommentDots }> = {
  Chat:     { bg: '#EEF7EA', color: '#3F9B2F', icon: faCommentDots },
  Document: { bg: '#EEF4FF', color: '#1E88FF', icon: faFileAlt },
  Other:    { bg: '#fef3c7', color: '#92400e', icon: faHistory },
};

function eventCategory(e: string): 'Chat' | 'Document' | 'Other' {
  if (/CHAT/i.test(e)) return 'Chat';
  if (/DOC/i.test(e))  return 'Document';
  return 'Other';
}

function humanizeEvent(e: string): string {
  const s = (e || 'Activity').replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function UserUsageTab({ memberId, memberName, orgId }: { memberId: string; memberName: string; orgId: string }) {
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    api.getMemberActivity(orgId, memberId)
      .then(setActivity)
      .catch(() => setActivity([]))
      .finally(() => setLoading(false));
  }, [orgId, memberId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <FontAwesomeIcon icon={faSpinner} className="animate-spin text-2xl" />
      </div>
    );
  }

  if (activity.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
        <FontAwesomeIcon icon={faHistory} className="text-4xl text-gray-300" />
        <p className="text-base font-medium">No recorded activity</p>
        <p className="text-sm">{memberName} has no logged AI activity yet.</p>
      </div>
    );
  }

  const chatCount = activity.filter((a) => eventCategory(a.eventType) === 'Chat').length;
  const docCount  = activity.filter((a) => eventCategory(a.eventType) === 'Document').length;

  return (
    <div className="max-w-lg space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-gray-800">{activity.length}</div>
          <div className="text-xs text-gray-400 mt-0.5">Events</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold" style={{ color: '#3F9B2F' }}>{chatCount}</div>
          <div className="text-xs text-gray-400 mt-0.5">Chats</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold" style={{ color: '#1E88FF' }}>{docCount}</div>
          <div className="text-xs text-gray-400 mt-0.5">Documents</div>
        </div>
      </div>

      {/* Activity log (from the audit trail) */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h4 className="text-sm font-semibold text-gray-700">Recent Activity</h4>
        </div>
        <div className="divide-y divide-gray-50">
          {activity.map((a, i) => {
            const cat = eventCategory(a.eventType);
            const style = ACTIVITY_STYLES[cat] ?? ACTIVITY_STYLES.Other;
            return (
              <div key={i} className="px-5 py-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: style.bg }}>
                  <FontAwesomeIcon icon={style.icon} style={{ color: style.color, fontSize: 13 }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 leading-snug">{humanizeEvent(a.eventType)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(a.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    {a.decision ? <> · <span className="font-medium">{a.decision}</span></> : null}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0 mt-1" style={{ background: style.bg, color: style.color }}>
                  {cat}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Manage Invites modal ──────────────────────────────────────────────────────

interface PendingInvite { id: string; token: string; role: string; createdBy: string; expiresAt: string; inviteUrl: string }

function ManageInvitesModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    api.listInvites(orgId)
      .then(setInvites)
      .catch(() => setInvites([]))
      .finally(() => setLoading(false));
  }, [orgId]);

  const revoke = async (token: string) => {
    setRevoking(token);
    try {
      await api.revokeInvite(orgId, token);
      setInvites((prev) => prev.filter((i) => i.token !== token));
    } catch { /* row stays */ }
    finally { setRevoking(null); }
  };

  const copyLink = async (inv: PendingInvite) => {
    await navigator.clipboard.writeText(inv.inviteUrl);
    setCopiedId(inv.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Manage Invites</h2>
            <p className="text-xs text-gray-400 mt-0.5">Pending invitations — each link expires after 7 days.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* Invite list */}
        <div className="px-6 py-4 space-y-3 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              <FontAwesomeIcon icon={faSpinner} className="animate-spin mr-2" /> Loading invites…
            </div>
          ) : invites.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              No pending invites. Use <strong>Invite Member</strong> to create one.
            </div>
          ) : (
            invites.map((inv) => {
              const roleColors = ROLE_COLORS[inv.role] ?? { bg: '#f3f4f6', text: '#374151' };
              return (
                <div
                  key={inv.id}
                  className="flex items-center gap-4 p-4 rounded-xl"
                  style={{ border: '2px solid #DCE7EE', background: '#fafafa' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0"
                        style={{ background: roleColors.bg, color: roleColors.text }}
                      >
                        {ROLE_LABELS[inv.role] ?? inv.role}
                      </span>
                      <span className="text-xs text-gray-400">invite link</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Expires {new Date(inv.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <button
                    onClick={() => copyLink(inv)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0"
                    style={{ borderColor: '#2a5f6f', color: '#2a5f6f', background: 'white' }}
                  >
                    <FontAwesomeIcon icon={copiedId === inv.id ? faCheck : faCopy} className="text-xs" />
                    {copiedId === inv.id ? 'Copied' : 'Copy link'}
                  </button>
                  <button
                    onClick={() => revoke(inv.token)}
                    disabled={revoking === inv.token}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0 disabled:opacity-50"
                    style={{ borderColor: '#fca5a5', color: '#dc2626', background: 'white' }}
                  >
                    {revoking === inv.token ? <FontAwesomeIcon icon={faSpinner} className="animate-spin text-xs" /> : 'Revoke'}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
