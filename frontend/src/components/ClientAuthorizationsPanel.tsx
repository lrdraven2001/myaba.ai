import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faShieldAlt, faPlus, faBan, faCheckCircle,
  faClock, faSpinner, faExclamationTriangle, faInfoCircle,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type { SubjectAuthorization } from '../types';
import { HIPAA_AUTH_TYPES, HIPAA_SCOPES } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso?: string | null) {
  if (!iso || iso === '') return '--';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function statusChip(status: SubjectAuthorization['status']) {
  if (status === 'ACTIVE') return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
      <FontAwesomeIcon icon={faCheckCircle} className="text-xs" /> Active
    </span>
  );
  if (status === 'EXPIRED') return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
      <FontAwesomeIcon icon={faClock} className="text-xs" /> Expired
    </span>
  );
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
      <FontAwesomeIcon icon={faBan} className="text-xs" /> Revoked
    </span>
  );
}

/** Returns true when any scope in the list is a super-PHI category. */
function hasSuperPhiScope(scope: string[]): boolean {
  const superPhi = HIPAA_SCOPES.filter((s) => s.isSuperPhi).map((s) => s.value);
  return scope.some((s) => superPhi.includes(s));
}

// ── Panel ─────────────────────────────────────────────────────────────────────

interface Props {
  clientId: string;
  clientDiagnosis?: string;
}

export default function ClientAuthorizationsPanel({ clientId, clientDiagnosis = '' }: Props) {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ORG_ADMIN' || currentUser?.role === 'ORG_SUPER_ADMIN';

  const [records, setRecords]     = useState<SubjectAuthorization[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [showForm, setShowForm]   = useState(false);

  // Add form state
  const [addType, setAddType]           = useState('');
  const [addScope, setAddScope]         = useState<string[]>([]);
  const [addExpiry, setAddExpiry]       = useState('');
  const [addEvidence, setAddEvidence]   = useState('');
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState('');

  const load = () => {
    setLoading(true);
    api.getClientAuthorizations(clientId)
      .then(setRecords)
      .catch(() => setError('Failed to load authorization records.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [clientId]);

  const handleAdd = async () => {
    if (!addType) { setSaveError('Authorization type is required.'); return; }
    if (addScope.length === 0) { setSaveError('At least one scope category is required.'); return; }
    setSaving(true); setSaveError('');
    try {
      await api.addClientAuthorization(clientId, {
        type: addType,
        scope: addScope,
        expiry: addExpiry || undefined,
        evidenceRef: addEvidence || undefined,
      });
      setShowForm(false);
      setAddType(''); setAddScope([]); setAddExpiry(''); setAddEvidence('');
      load();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save authorization.');
    } finally { setSaving(false); }
  };

  const handleRevoke = async (authId: string) => {
    try {
      await api.revokeClientAuthorization(clientId, authId);
      load();
    } catch {
      setError('Failed to revoke authorization.');
    }
  };

  const toggleScope = (s: string) => {
    setAddScope((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  };

  // Does this client's diagnosis suggest any super-PHI category?
  const diagnosisKeywords = ['substance use', 'substance abuse', 'sud', 'opioid', 'alcohol use disorder',
                             'psychotherapy', 'hiv', 'genetic'];
  const dx = clientDiagnosis.toLowerCase();
  const hasHardBlockDiagnosis = diagnosisKeywords.some((kw) => dx.includes(kw));

  const activeRecords = records.filter((r) => r.status === 'ACTIVE');
  const inactiveRecords = records.filter((r) => r.status !== 'ACTIVE');

  return (
    <div className="space-y-5">

      {/* Super-PHI warning banner */}
      {hasHardBlockDiagnosis && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-800">Hard-block category detected</p>
            <p className="text-xs text-red-700 mt-0.5 leading-relaxed">
              This client's diagnosis indicates a protected category (SUD, psychotherapy, HIV, or genetic).
              AI document generation and chat are hard-blocked until an active written authorization exists.
              Add a <strong>42 CFR Part 2 Consent</strong> or <strong>HIPAA Authorization</strong> below.
            </p>
          </div>
        </div>
      )}

      {/* No active authorization warning */}
      {hasHardBlockDiagnosis && activeRecords.length === 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-500 shrink-0" />
          <p className="text-xs text-amber-800 font-medium">
            No active authorization on record. AI features are blocked for this client.
          </p>
        </div>
      )}

      {/* Info for non-hard-block clients */}
      {!hasHardBlockDiagnosis && (
        <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl p-3">
          <FontAwesomeIcon icon={faInfoCircle} className="mt-0.5 shrink-0" />
          <span>
            Authorization records are sent to ACLX with every AI evaluation call.
            Required for research purposes or any data use outside standard treatment/payment/operations.
          </span>
        </div>
      )}

      {/* Active records */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Active Authorizations
          </h4>
          {isAdmin && !showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
              style={{ background: '#2a5f6f' }}
            >
              <FontAwesomeIcon icon={faPlus} className="text-xs" />
              Add Authorization
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
            <FontAwesomeIcon icon={faSpinner} className="animate-spin" /> Loading...
          </div>
        ) : error ? (
          <p className="text-xs text-red-500">{error}</p>
        ) : activeRecords.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-2">No active authorizations on record.</p>
        ) : (
          <div className="space-y-2">
            {activeRecords.map((r) => (
              <AuthorizationCard
                key={r.authId}
                record={r}
                isAdmin={isAdmin}
                onRevoke={handleRevoke}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add form */}
      {showForm && isAdmin && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            New Authorization Record
          </p>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              Authorization Type <span className="text-red-400">*</span>
            </label>
            <select
              value={addType}
              onChange={(e) => setAddType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              <option value="">Select type...</option>
              {HIPAA_AUTH_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            {addType && (
              <p className="text-xs text-gray-400 mt-1">
                {HIPAA_AUTH_TYPES.find((t) => t.value === addType)?.description}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2">
              Data Scope <span className="text-red-400">*</span>
              <span className="font-normal text-gray-400 ml-1">(select all that apply)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {HIPAA_SCOPES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => toggleScope(s.value)}
                  className="px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors"
                  style={addScope.includes(s.value)
                    ? s.isSuperPhi
                      ? { borderColor: '#dc2626', background: '#fef2f2', color: '#dc2626' }
                      : { borderColor: '#2a5f6f', background: '#e8f4f8', color: '#2a5f6f' }
                    : { borderColor: '#e5e7eb', background: 'white', color: '#6b7280' }}
                >
                  {s.isSuperPhi && <FontAwesomeIcon icon={faShieldAlt} className="mr-1 text-xs" />}
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Expiry Date <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="date"
                value={addExpiry}
                onChange={(e) => setAddExpiry(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Evidence Reference <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={addEvidence}
                onChange={(e) => setAddEvidence(e.target.value)}
                placeholder="IRB filing ID, consent form ref..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>

          {saveError && <p className="text-xs text-red-500">{saveError}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50"
              style={{ background: '#2a5f6f' }}
            >
              {saving ? 'Saving...' : 'Save Authorization'}
            </button>
            <button
              onClick={() => { setShowForm(false); setSaveError(''); }}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Historical records */}
      {inactiveRecords.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            History (Expired / Revoked)
          </h4>
          <div className="space-y-2">
            {inactiveRecords.map((r) => (
              <AuthorizationCard key={r.authId} record={r} isAdmin={false} onRevoke={() => {}} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Authorization card ─────────────────────────────────────────────────────────

function AuthorizationCard({
  record, isAdmin, onRevoke,
}: {
  record: SubjectAuthorization;
  isAdmin: boolean;
  onRevoke: (authId: string) => void;
}) {
  const typeLabel = HIPAA_AUTH_TYPES.find((t) => t.value === record.type)?.label ?? record.type;
  const superPhi  = hasSuperPhiScope(record.scope);

  return (
    <div
      className="rounded-xl border p-3 flex items-start gap-3"
      style={
        record.status === 'ACTIVE'
          ? { background: superPhi ? '#fef2f2' : '#f0fdf4', borderColor: superPhi ? '#fecaca' : '#bbf7d0' }
          : { background: '#f9fafb', borderColor: '#e5e7eb' }
      }
    >
      <FontAwesomeIcon
        icon={faShieldAlt}
        className="mt-0.5 shrink-0"
        style={{ color: record.status === 'ACTIVE' ? (superPhi ? '#dc2626' : '#16a34a') : '#9ca3af' }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-sm font-semibold text-gray-800">{typeLabel}</span>
          {statusChip(record.status)}
          {superPhi && record.status === 'ACTIVE' && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
              Super PHI
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1 mb-1">
          {record.scope.map((s) => (
            <span key={s} className="text-xs px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-600">
              {s}
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          Issued {fmtDate(record.issuedAt)}
          {record.expiry ? ` · Expires ${fmtDate(record.expiry)}` : ' · No expiry'}
          {record.evidenceRef ? ` · Ref: ${record.evidenceRef}` : ''}
        </p>
        {record.revokedAt && (
          <p className="text-xs text-red-400 mt-0.5">
            Revoked {fmtDate(record.revokedAt)}
          </p>
        )}
      </div>
      {isAdmin && record.status === 'ACTIVE' && (
        <button
          onClick={() => onRevoke(record.authId)}
          className="px-2.5 py-1 rounded-lg border border-red-200 text-xs text-red-600 hover:bg-red-50 shrink-0 font-medium"
        >
          Revoke
        </button>
      )}
    </div>
  );
}
