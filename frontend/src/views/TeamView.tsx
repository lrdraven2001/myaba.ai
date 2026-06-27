import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUserPlus, faEnvelope, faToggleOn, faToggleOff,
  faArrowLeft, faChevronRight, faTimes, faMailBulk,
  faUsers, faHistory, faUserCog, faCommentDots, faFileAlt,
  faLink, faCheck, faCopy,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

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

const ROLE_LABELS: Record<string, string> = {
  ORG_SUPER_ADMIN:   'Clinical Director',
  CLINICAL_DIRECTOR: 'Clinical Director',
  ORG_ADMIN:         'Practice Administrator',
  TREATING_BCBA:     'Treating BCBA',
  SUPERVISING_BCBA:  'Clinical Supervisor',
  BCBA_STUDENT:      'BCBA Student',
  RBT:               'Behavior Technician',
  GENERAL_STAFF:     'General Staff',
  SCHEDULING_ADMIN:  'Scheduling Admin',
  BILLING_ADMIN:     'Billing Admin',
};

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

// Stub members — replace with api.getOrgMembers()
const STUB_MEMBERS: TeamMember[] = [
  { id: 'u-001', name: 'Chris Hunt',    email: 'chris@myaba.ai',  role: 'ORG_SUPER_ADMIN',  active: true  },
  { id: 'u-002', name: 'Sarah Johnson', email: 'sarah@myaba.ai',  role: 'SUPERVISING_BCBA', active: true  },
  { id: 'u-003', name: 'Mike Torres',   email: 'mike@myaba.ai',   role: 'RBT',              active: true,  supervisorId: 'u-002' },
  { id: 'u-004', name: 'Lisa Chen',     email: 'lisa@myaba.ai',   role: 'SUPERVISING_BCBA', active: false },
];

const STUB_ASSIGNED_CLIENTS: Record<string, Array<{ id: string; name: string; diagnosis: string }>> = {
  'u-002': [
    { id: 'c-001', name: 'Alex Johnson', diagnosis: 'ASD Level 2' },
    { id: 'c-003', name: 'Sam Rivera',   diagnosis: 'ADHD'        },
  ],
  'u-003': [
    { id: 'c-001', name: 'Alex Johnson', diagnosis: 'ASD Level 2' },
  ],
  'u-004': [
    { id: 'c-002', name: 'Jordan Lee',   diagnosis: 'ASD Level 1' },
    { id: 'c-003', name: 'Sam Rivera',   diagnosis: 'ADHD'        },
    { id: 'c-004', name: 'Casey Morgan', diagnosis: 'ASD Level 3' },
  ],
};

const STUB_USAGE: Record<string, Array<{ date: string; type: 'Chat' | 'Document' | 'Search'; detail: string; tokens: number }>> = {
  'u-001': [
    { date: '2026-05-25', type: 'Chat',     detail: 'Session: Behavior plan for Alex Johnson',   tokens: 1240 },
    { date: '2026-05-24', type: 'Document', detail: 'Generated: Monthly Progress Report',         tokens: 2100 },
    { date: '2026-05-23', type: 'Chat',     detail: 'Session: Insurance authorization question',  tokens: 680  },
    { date: '2026-05-21', type: 'Search',   detail: 'Resource search: reinforcement schedules',   tokens: 320  },
  ],
  'u-002': [
    { date: '2026-05-25', type: 'Chat',     detail: 'Session: DTT strategies for Sam Rivera',    tokens: 890  },
    { date: '2026-05-24', type: 'Document', detail: 'Generated: Session Note — Alex Johnson',     tokens: 1560 },
    { date: '2026-05-22', type: 'Chat',     detail: 'Session: ABA data collection methods',       tokens: 1120 },
    { date: '2026-05-20', type: 'Search',   detail: 'Resource search: reinforcement schedules',   tokens: 320  },
  ],
  'u-003': [
    { date: '2026-05-24', type: 'Chat',     detail: 'Session: RBT supervision question',          tokens: 445  },
    { date: '2026-05-21', type: 'Document', detail: 'Generated: Data sheet — Alex Johnson',        tokens: 780  },
  ],
  'u-004': [],
};

// Stub pending invites — replace with api.getOrgInvites()
const STUB_INVITES = [
  { id: 'inv-001', email: 'newbcba@agency.com',  role: 'SUPERVISING_BCBA', sentAt: '2026-05-24', expiresAt: '2026-05-31' },
  { id: 'inv-002', email: 'rbt.hire@agency.com', role: 'RBT',              sentAt: '2026-05-23', expiresAt: '2026-05-30' },
];

const AVATAR_COLORS = ['#3F9B2F', '#1E88FF', '#F5A623', '#9c27b0', '#e91e63'];

function toInitials(name: string) {
  return name.split(/\s+/).map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 2);
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function TeamView() {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ORG_ADMIN' || currentUser?.role === 'ORG_SUPER_ADMIN' || currentUser?.role === 'CLINICAL_DIRECTOR';
  const orgId   = currentUser?.orgId ?? '';

  const [members, setMembers]             = useState<TeamMember[]>(STUB_MEMBERS);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showInvite, setShowInvite]       = useState(false);
  const [showManageInvites, setShowManageInvites] = useState(false);
  const [inviteRole, setInviteRole]       = useState('RBT');
  const [inviteUrl, setInviteUrl]         = useState('');
  const [inviteGenerating, setInviteGenerating] = useState(false);
  const [inviteError, setInviteError]     = useState('');
  const [inviteCopied, setInviteCopied]   = useState(false);

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
        if (mapped.length > 0) setMembers(mapped);
      })
      .catch(() => { /* keep stubs on error */ })
      .finally(() => setLoadingMembers(false));
  }, [orgId]);

  const handleOpenInvite = () => {
    setInviteRole('RBT');
    setInviteUrl('');
    setInviteError('');
    setInviteCopied(false);
    setShowInvite(true);
  };

  const handleGenerateInviteLink = async () => {
    setInviteGenerating(true);
    setInviteError('');
    setInviteUrl('');
    setInviteCopied(false);
    try {
      const { inviteUrl: url } = await api.generateInvite(orgId, inviteRole);
      setInviteUrl(url);
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
    setInviteUrl('');
    setInviteError('');
    setInviteCopied(false);
  };

  // ── User detail view ──────────────────────────────────────────────────────

  if (selectedMember) {
    return (
      <UserDetailView
        member={selectedMember}
        isAdmin={isAdmin}
        allMembers={members}
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
              {STUB_INVITES.length > 0 && (
                <span
                  className="w-4 h-4 rounded-full text-white flex items-center justify-center font-bold"
                  style={{ background: '#2a5f6f', fontSize: 9 }}
                >
                  {STUB_INVITES.length}
                </span>
              )}
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
                  {Object.entries(ROLE_LABELS)
                    .filter(([v]) => v !== 'ORG_SUPER_ADMIN')
                    .map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                </select>
              </div>

              {/* Generated link */}
              {inviteUrl && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Invite Link — copy &amp; share
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
                  {inviteGenerating ? 'Generating…' : (
                    <><FontAwesomeIcon icon={faLink} className="text-xs" /> Generate Link</>
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
        <ManageInvitesModal onClose={() => setShowManageInvites(false)} />
      )}
    </div>
  );
}

// ── User detail view ──────────────────────────────────────────────────────────

function UserDetailView({
  member, isAdmin, allMembers, onBack, onUpdate,
}: {
  member: TeamMember;
  isAdmin: boolean;
  allMembers: TeamMember[];
  onBack: () => void;
  onUpdate: (m: TeamMember) => void;
}) {
  const [activeTab, setActiveTab] = useState<UserDetailTab>('profile');
  const memberIndex = allMembers.findIndex((m) => m.id === member.id);
  const avatarBg    = AVATAR_COLORS[memberIndex % AVATAR_COLORS.length];
  const colors      = ROLE_COLORS[member.role] ?? { bg: '#f3f4f6', text: '#374151' };

  const tabs: { key: UserDetailTab; label: string; icon: typeof faUserCog }[] = [
    { key: 'profile', label: 'Profile',          icon: faUserCog    },
    { key: 'clients', label: 'Assigned Clients',  icon: faUsers      },
    { key: 'usage',   label: 'Service Usage',     icon: faHistory    },
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
          <UserProfileTab member={member} isAdmin={isAdmin} allMembers={allMembers} onUpdate={onUpdate} />
        )}
        {activeTab === 'clients' && (
          <UserClientsTab memberId={member.id} memberName={member.name} />
        )}
        {activeTab === 'usage' && (
          <UserUsageTab memberId={member.id} memberName={member.name} />
        )}
      </div>
    </div>
  );
}

// ── Profile tab ───────────────────────────────────────────────────────────────

function UserProfileTab({
  member, isAdmin, allMembers, onUpdate,
}: {
  member: TeamMember;
  isAdmin: boolean;
  allMembers: TeamMember[];
  onUpdate: (m: TeamMember) => void;
}) {
  const orgId = (useAuth().currentUser as any)?.orgId ?? '';

  const [role, setRole]               = useState(member.role);
  const [active, setActive]           = useState(member.active);
  const [supervisorId, setSupervisorId] = useState(member.supervisorId ?? '');
  const [saved, setSaved]             = useState(false);
  const [supSaving, setSupSaving]     = useState(false);

  // Active Clinical Supervisors available for RBT assignment
  const activeSupervisors = allMembers.filter(
    (m) => m.role === 'SUPERVISING_BCBA' && m.active && m.id !== member.id,
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
              {Object.entries(ROLE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            {member.role === 'ORG_SUPER_ADMIN' && (
              <p className="text-xs text-gray-400 mt-1">Super Admin role cannot be changed.</p>
            )}
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
  const clients = STUB_ASSIGNED_CLIENTS[memberId] ?? [];

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

// ── Service Usage tab ─────────────────────────────────────────────────────────

const USAGE_TYPE_STYLES: Record<string, { bg: string; color: string; icon: typeof faCommentDots }> = {
  Chat:     { bg: '#EEF7EA', color: '#3F9B2F', icon: faCommentDots },
  Document: { bg: '#EEF4FF', color: '#1E88FF', icon: faFileAlt     },
  Search:   { bg: '#fef3c7', color: '#92400e', icon: faHistory      },
};

function UserUsageTab({ memberId, memberName }: { memberId: string; memberName: string }) {
  const usage = STUB_USAGE[memberId] ?? [];

  const totalTokens = usage.reduce((acc, u) => acc + u.tokens, 0);

  if (usage.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
        <FontAwesomeIcon icon={faHistory} className="text-4xl text-gray-300" />
        <p className="text-base font-medium">No usage recorded</p>
        <p className="text-sm">{memberName} has not used AI services yet.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-gray-800">{usage.length}</div>
          <div className="text-xs text-gray-400 mt-0.5">Sessions</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold" style={{ color: '#1E88FF' }}>
            {usage.filter((u) => u.type === 'Document').length}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">Documents</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold" style={{ color: '#3F9B2F' }}>
            {(totalTokens / 1000).toFixed(1)}k
          </div>
          <div className="text-xs text-gray-400 mt-0.5">AI Tokens</div>
        </div>
      </div>

      {/* Activity log */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h4 className="text-sm font-semibold text-gray-700">Recent Activity</h4>
        </div>
        <div className="divide-y divide-gray-50">
          {usage.map((u, i) => {
            const style = USAGE_TYPE_STYLES[u.type] ?? USAGE_TYPE_STYLES.Chat;
            return (
              <div key={i} className="px-5 py-3 flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: style.bg }}
                >
                  <FontAwesomeIcon icon={style.icon} style={{ color: style.color, fontSize: 13 }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 leading-snug">{u.detail}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(u.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    &nbsp;·&nbsp;{u.tokens.toLocaleString()} tokens
                  </p>
                </div>
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0 mt-1"
                  style={{ background: style.bg, color: style.color }}
                >
                  {u.type}
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

function ManageInvitesModal({ onClose }: { onClose: () => void }) {
  const [invites, setInvites] = useState(STUB_INVITES);

  const revoke = (id: string) => setInvites((prev) => prev.filter((i) => i.id !== id));

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
          {invites.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              No pending invites.
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
                      <span className="text-sm font-semibold text-gray-800 truncate">{inv.email}</span>
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0"
                        style={{ background: roleColors.bg, color: roleColors.text }}
                      >
                        {ROLE_LABELS[inv.role] ?? inv.role}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Sent {new Date(inv.sentAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      &nbsp;·&nbsp;Expires {new Date(inv.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <button
                    onClick={() => revoke(inv.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0"
                    style={{ borderColor: '#fca5a5', color: '#dc2626', background: 'white' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#fef2f2')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                  >
                    Revoke
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
