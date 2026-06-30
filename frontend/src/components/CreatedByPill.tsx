/**
 * Small "created by" pill — shows an initials avatar + the creator's display
 * name. Resolves a `createdBy` uid/email against the org member list when
 * provided; otherwise falls back to the email local-part or the raw value.
 *
 * Used in chat/document/client panels per the findings ("show who created … as
 * a pill in the panel").
 */
export interface MemberLike {
  id: string;
  name?: string;
  displayName?: string;
  email?: string;
}

function resolveName(createdBy: string, members?: MemberLike[]): string {
  const m = members?.find((x) => x.id === createdBy || x.email === createdBy);
  const name = m?.name || m?.displayName || m?.email;
  if (name) return name.includes('@') ? name.split('@')[0] : name;
  if (createdBy.includes('@')) return createdBy.split('@')[0];
  return createdBy || 'Unknown';
}

function initials(name: string): string {
  return (name.split(/[\s._-]+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase()) || '??';
}

export default function CreatedByPill({
  createdBy, members, prefix = 'by', className = '',
}: {
  createdBy?: string;
  members?: MemberLike[];
  /** Leading text, e.g. "by". Pass "" to hide. */
  prefix?: string;
  className?: string;
}) {
  if (!createdBy) return null;
  const name = resolveName(createdBy, members);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs whitespace-nowrap ${className}`}
      title={`Created by ${name}`}
    >
      <span
        className="flex items-center justify-center rounded-full text-white"
        style={{ width: 15, height: 15, fontSize: 8, fontWeight: 700, background: '#2a5f6f' }}
      >
        {initials(name)}
      </span>
      {prefix ? `${prefix} ` : ''}{name}
    </span>
  );
}
