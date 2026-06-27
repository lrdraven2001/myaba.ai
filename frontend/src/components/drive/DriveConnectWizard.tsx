import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSpinner, faTimes, faFile, faFolder, faLock, faLockOpen,
  faCheckCircle, faExclamationTriangle, faLink,
} from '@fortawesome/free-solid-svg-icons';
import { faGoogle, faMicrosoft } from '@fortawesome/free-brands-svg-icons';
import { api } from '../../lib/api';
import type { Client, DriveConnection, DriveVerifyResult } from '../../types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  provider: 'google' | 'microsoft';
  onClose: () => void;
  onLinked: (connection: DriveConnection) => void;
  /** When set, the wizard is pre-scoped to this client: permissions default to
   *  client-inherited and the connection is linked to the client record. */
  clientId?: string;
  clientName?: string;
}

type PermissionType = 'org_roles' | 'individual' | 'client_inherited';

const CLINICAL_ROLES: { value: string; label: string }[] = [
  { value: 'TREATING_BCBA',    label: 'Treating BCBA' },
  { value: 'SUPERVISING_BCBA', label: 'Supervising BCBA' },
  { value: 'BCBA_STUDENT',     label: 'BCBA Student' },
  { value: 'RBT',              label: 'RBT' },
];

const ADMIN_ROLES: { value: string; label: string }[] = [
  { value: 'SCHEDULING_ADMIN', label: 'Scheduling Admin' },
  { value: 'BILLING_ADMIN',    label: 'Billing Admin' },
  { value: 'ORG_ADMIN',        label: 'Org Admin' },
  { value: 'ORG_SUPER_ADMIN',  label: 'Super Admin' },
];

const DEFAULT_CLINICAL_ROLES = new Set(['TREATING_BCBA', 'SUPERVISING_BCBA', 'BCBA_STUDENT', 'RBT']);

// ── Step indicator ────────────────────────────────────────────────────────────

const STEP_LABELS = ['Select', 'Verify', 'Permissions', 'Confirm'];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-6">
      {STEP_LABELS.map((label, idx) => {
        const stepNum = idx + 1;
        const done    = stepNum < current;
        const active  = stepNum === current;
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors"
                style={
                  done
                    ? { background: '#2a5f6f', borderColor: '#2a5f6f', color: 'white' }
                    : active
                    ? { background: 'white', borderColor: '#2a5f6f', color: '#2a5f6f' }
                    : { background: 'white', borderColor: '#d1d5db', color: '#9ca3af' }
                }
              >
                {done ? <FontAwesomeIcon icon={faCheckCircle} /> : stepNum}
              </div>
              <span
                className="text-xs mt-1 font-medium"
                style={{ color: active ? '#2a5f6f' : done ? '#2a5f6f' : '#9ca3af' }}
              >
                {label}
              </span>
            </div>
            {idx < STEP_LABELS.length - 1 && (
              <div
                className="w-12 h-0.5 mb-4 mx-1 transition-colors"
                style={{ background: done ? '#2a5f6f' : '#e5e7eb' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Select Document ───────────────────────────────────────────────────

interface Step1State {
  baaConfirmed: boolean;
  driveUrl: string;
  displayName: string;
  itemType: 'file' | 'folder';
}

function Step1Select({
  provider,
  state,
  onChange,
}: {
  provider: 'google' | 'microsoft';
  state: Step1State;
  onChange: (s: Step1State) => void;
}) {
  const providerFull = provider === 'google' ? 'Google Workspace' : 'Microsoft 365';
  const placeholder  = provider === 'google'
    ? 'https://drive.google.com/file/d/…/view'
    : 'https://onedrive.live.com/…';

  return (
    <div className="space-y-4">
      {/* HIPAA notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-sm font-semibold text-amber-800 mb-1">HIPAA Compliance Notice</p>
        <p className="text-xs text-amber-700">
          Documents linked from Drive may contain PHI. A BAA must be in place with {providerFull}.
          Access is governed by the permissions you set in the next step.
        </p>
      </div>

      {/* BAA checkbox */}
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 accent-teal-700"
          checked={state.baaConfirmed}
          onChange={(e) => onChange({ ...state, baaConfirmed: e.target.checked })}
        />
        <span className="text-sm text-gray-700">
          I confirm a BAA is in place with {providerFull}.
        </span>
      </label>

      {/* Drive URL */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Drive Link
        </label>
        <input
          type="url"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
          placeholder={placeholder}
          value={state.driveUrl}
          onChange={(e) => onChange({ ...state, driveUrl: e.target.value })}
        />
      </div>

      {/* Display name */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Display Name
        </label>
        <input
          type="text"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
          placeholder="e.g. HIPAA Policy Manual"
          value={state.displayName}
          onChange={(e) => onChange({ ...state, displayName: e.target.value })}
        />
      </div>

      {/* File / Folder */}
      <div className="flex gap-4">
        {(['file', 'folder'] as const).map((t) => (
          <label key={t} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
            <input
              type="radio"
              name="itemType"
              className="accent-teal-700"
              checked={state.itemType === t}
              onChange={() => onChange({ ...state, itemType: t })}
            />
            <FontAwesomeIcon icon={t === 'file' ? faFile : faFolder} className="text-gray-400" />
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Step 2: HIPAA Verification ────────────────────────────────────────────────

function Step2Verify({
  provider,
  driveUrl,
  result,
  loading,
  acknowledged,
  onAcknowledge,
}: {
  provider: 'google' | 'microsoft';
  driveUrl: string;
  result: DriveVerifyResult | null;
  loading: boolean;
  acknowledged: boolean;
  onAcknowledge: (v: boolean) => void;
}) {
  const driveName = provider === 'google' ? 'Google Drive' : 'OneDrive';

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <FontAwesomeIcon icon={faSpinner} className="animate-spin text-teal-600 text-3xl" />
        <p className="text-sm text-gray-500">Checking HIPAA labels in {driveName}…</p>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 break-all">
        Checking: <span className="font-mono">{driveUrl}</span>
      </p>

      {result.verified ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
          <FontAwesomeIcon icon={faCheckCircle} className="text-green-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-800">HIPAA label found</p>
            <p className="text-xs text-green-700 mt-0.5">{result.labelName}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  No HIPAA label detected in {driveName}
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  This document has not been classified as PHI/restricted in {driveName}.
                  Before linking:
                </p>
                <ul className="text-xs text-amber-700 mt-2 space-y-1 list-disc list-inside">
                  <li>Apply a &lsquo;PHI &ndash; Restricted&rsquo; or equivalent label in {driveName}</li>
                  <li>Confirm this document has been reviewed under your organization&rsquo;s HIPAA privacy policies</li>
                  <li>Ensure only authorized staff have Drive-level access</li>
                </ul>
              </div>
            </div>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 accent-teal-700"
              checked={acknowledged}
              onChange={(e) => onAcknowledge(e.target.checked)}
            />
            <span className="text-sm text-gray-700">
              I acknowledge this document contains PHI and my organization is responsible for its
              proper classification and access controls.
            </span>
          </label>
        </div>
      )}
    </div>
  );
}

// ── Role checkboxes sub-form ──────────────────────────────────────────────────

function RoleCheckboxes({
  selected,
  onChange,
}: {
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const toggle = (role: string) => {
    const next = new Set(selected);
    next.has(role) ? next.delete(role) : next.add(role);
    onChange(next);
  };

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-2">
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Clinical Staff</p>
        {CLINICAL_ROLES.map((r) => (
          <label key={r.value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer py-0.5">
            <input
              type="checkbox"
              className="accent-teal-700"
              checked={selected.has(r.value)}
              onChange={() => toggle(r.value)}
            />
            {r.label}
          </label>
        ))}
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Administrative</p>
        {ADMIN_ROLES.map((r) => (
          <label key={r.value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer py-0.5">
            <input
              type="checkbox"
              className="accent-teal-700"
              checked={selected.has(r.value)}
              onChange={() => toggle(r.value)}
            />
            {r.label}
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Step 3: Permissions ───────────────────────────────────────────────────────

interface Step3State {
  permissionType: PermissionType;
  // org_roles
  selectedRoles: Set<string>;
  // individual
  userEmails: string[];
  emailInput: string;
  // client_inherited
  clientId: string;
  clientName: string;
  inheritPermissions: boolean;
  inheritedRoles: Set<string>;
}

function Step3Permissions({
  state,
  onChange,
}: {
  state: Step3State;
  onChange: (s: Step3State) => void;
}) {
  const [clients, setClients]           = useState<Client[]>([]);
  const [clientLoading, setClientLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  useEffect(() => {
    setClientLoading(true);
    api.getClients()
      .then(setClients)
      .catch(() => setClients([]))
      .finally(() => setClientLoading(false));
  }, []);

  useEffect(() => {
    if (state.clientId) {
      const c = clients.find((cl) => cl.id === state.clientId) ?? null;
      setSelectedClient(c);
    } else {
      setSelectedClient(null);
    }
  }, [state.clientId, clients]);

  const handleClientSelect = (clientId: string) => {
    const c = clients.find((cl) => cl.id === clientId) ?? null;
    setSelectedClient(c);
    const clientFullName = c ? [c.firstName, c.lastName].filter(Boolean).join(' ') || c.legalName || '' : '';
    onChange({ ...state, clientId, clientName: clientFullName });
  };

  const addEmail = () => {
    const email = state.emailInput.trim();
    if (!email || state.userEmails.includes(email)) return;
    onChange({ ...state, userEmails: [...state.userEmails, email], emailInput: '' });
  };

  const removeEmail = (email: string) => {
    onChange({ ...state, userEmails: state.userEmails.filter((e) => e !== email) });
  };

  const cardBase =
    'border-2 rounded-xl p-4 cursor-pointer transition-colors select-none';
  const cardActive = { borderColor: '#2a5f6f', background: '#f0f9fb' };
  const cardInactive = { borderColor: '#e5e7eb', background: 'white' };

  return (
    <div className="space-y-3">
      {/* Card A: Org Roles */}
      <div
        className={cardBase}
        style={state.permissionType === 'org_roles' ? cardActive : cardInactive}
        onClick={() => onChange({ ...state, permissionType: 'org_roles' })}
      >
        <div className="flex items-center gap-2">
          <input
            type="radio"
            className="accent-teal-700"
            checked={state.permissionType === 'org_roles'}
            onChange={() => onChange({ ...state, permissionType: 'org_roles' })}
            onClick={(e) => e.stopPropagation()}
          />
          <span className="font-semibold text-gray-800 text-sm">Organizational (Role-based)</span>
        </div>
        {state.permissionType === 'org_roles' && (
          <div onClick={(e) => e.stopPropagation()}>
            <RoleCheckboxes
              selected={state.selectedRoles}
              onChange={(s) => onChange({ ...state, selectedRoles: s })}
            />
            <p className="text-xs text-gray-400 mt-3">
              All users with the selected roles in your organization can access this document.
            </p>
          </div>
        )}
      </div>

      {/* Card B: Individual Users */}
      <div
        className={cardBase}
        style={state.permissionType === 'individual' ? cardActive : cardInactive}
        onClick={() => onChange({ ...state, permissionType: 'individual' })}
      >
        <div className="flex items-center gap-2">
          <input
            type="radio"
            className="accent-teal-700"
            checked={state.permissionType === 'individual'}
            onChange={() => onChange({ ...state, permissionType: 'individual' })}
            onClick={(e) => e.stopPropagation()}
          />
          <span className="font-semibold text-gray-800 text-sm">Individual Users</span>
        </div>
        {state.permissionType === 'individual' && (
          <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-2">
              <input
                type="email"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                placeholder="user@example.com"
                value={state.emailInput}
                onChange={(e) => onChange({ ...state, emailInput: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
              />
              <button
                type="button"
                onClick={addEmail}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-white"
                style={{ background: '#2a5f6f' }}
              >
                Add
              </button>
            </div>
            {state.userEmails.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {state.userEmails.map((email) => (
                  <span
                    key={email}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200"
                  >
                    {email}
                    <button
                      type="button"
                      onClick={() => removeEmail(email)}
                      className="hover:text-red-500 transition-colors"
                    >
                      <FontAwesomeIcon icon={faTimes} className="text-xs" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400">
              Only these specific users can access this document.
            </p>
          </div>
        )}
      </div>

      {/* Card C: Linked to Client */}
      <div
        className={cardBase}
        style={state.permissionType === 'client_inherited' ? cardActive : cardInactive}
        onClick={() => onChange({ ...state, permissionType: 'client_inherited' })}
      >
        <div className="flex items-center gap-2">
          <input
            type="radio"
            className="accent-teal-700"
            checked={state.permissionType === 'client_inherited'}
            onChange={() => onChange({ ...state, permissionType: 'client_inherited' })}
            onClick={(e) => e.stopPropagation()}
          />
          <span className="font-semibold text-gray-800 text-sm">Linked to Client</span>
        </div>
        {state.permissionType === 'client_inherited' && (
          <div className="mt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
            {clientLoading ? (
              <FontAwesomeIcon icon={faSpinner} className="animate-spin text-gray-400" />
            ) : (
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                value={state.clientId}
                onChange={(e) => handleClientSelect(e.target.value)}
              >
                <option value="">Select a client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{[c.firstName, c.lastName].filter(Boolean).join(' ') || c.legalName}</option>
                ))}
              </select>
            )}

            {selectedClient && (
              <>
                {/* Inherited permissions summary */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                  <p className="font-semibold text-gray-700 mb-1">
                    Inheriting access from {[selectedClient.firstName, selectedClient.lastName].filter(Boolean).join(' ') || selectedClient.legalName}&rsquo;s record:
                  </p>
                  {selectedClient.treatingBcbaId && (
                    <p>Treating BCBA &middot; {selectedClient.treatingBcbaId}</p>
                  )}
                  {selectedClient.supervisingBcbaId && (
                    <p>Supervising BCBA &middot; {selectedClient.supervisingBcbaId}</p>
                  )}
                  {(selectedClient.rbtIds?.length ?? 0) > 0 && (
                    <p>RBTs &middot; {selectedClient.rbtIds!.length} assigned</p>
                  )}
                  {(selectedClient.viewerIds?.length ?? 0) > 0 && (
                    <p>Viewers &middot; {selectedClient.viewerIds!.length} assigned</p>
                  )}
                </div>

                {/* Inheritance toggle */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onChange({ ...state, inheritPermissions: !state.inheritPermissions })}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors"
                    style={
                      state.inheritPermissions
                        ? { borderColor: '#2a5f6f', color: '#2a5f6f', background: '#f0f9fb' }
                        : { borderColor: '#d1d5db', color: '#6b7280', background: 'white' }
                    }
                  >
                    <FontAwesomeIcon
                      icon={state.inheritPermissions ? faLock : faLockOpen}
                      className="text-xs"
                    />
                    {state.inheritPermissions ? 'Inherit permissions automatically' : 'Manual permissions'}
                  </button>
                </div>

                {!state.inheritPermissions && (
                  <RoleCheckboxes
                    selected={state.inheritedRoles}
                    onChange={(s) => onChange({ ...state, inheritedRoles: s })}
                  />
                )}

                <p className="text-xs text-gray-400">
                  {state.inheritPermissions
                    ? 'When inheritance is enabled, permission changes to the client\'s record automatically apply to this document.'
                    : 'You have disabled automatic inheritance. Set roles manually above.'}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step 4: Review & Link ─────────────────────────────────────────────────────

function Step4Confirm({
  provider,
  step1,
  verifyResult,
  hipaaAcknowledged,
  step3,
  onLink,
  linking,
  linkError,
}: {
  provider: 'google' | 'microsoft';
  step1: Step1State;
  verifyResult: DriveVerifyResult | null;
  hipaaAcknowledged: boolean;
  step3: Step3State;
  onLink: () => void;
  linking: boolean;
  linkError: string;
}) {
  const hipaaVerified = verifyResult?.verified ?? false;

  const permissionSummary = () => {
    if (step3.permissionType === 'org_roles') {
      return `Org roles: ${Array.from(step3.selectedRoles).join(', ') || 'None selected'}`;
    }
    if (step3.permissionType === 'individual') {
      return `Individual: ${step3.userEmails.length} user${step3.userEmails.length !== 1 ? 's' : ''}`;
    }
    return `Client: ${step3.clientName || 'None'} (${step3.inheritPermissions ? 'inherited' : 'manual'})`;
  };

  return (
    <div className="space-y-4">
      <div className="border border-gray-200 rounded-xl p-4 space-y-3">
        {/* Document name + type */}
        <div className="flex items-center gap-3">
          <FontAwesomeIcon
            icon={step1.itemType === 'file' ? faFile : faFolder}
            className="text-gray-400 text-lg"
          />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 truncate">{step1.displayName || 'Unnamed document'}</p>
            <p className="text-xs text-gray-400 truncate">{step1.driveUrl}</p>
          </div>
          <span
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0"
            style={
              provider === 'google'
                ? { background: '#fce8e6', color: '#c5221f' }
                : { background: '#e8f0fe', color: '#1a73e8' }
            }
          >
            <FontAwesomeIcon icon={provider === 'google' ? faGoogle : faMicrosoft} />
            {provider === 'google' ? 'Google Drive' : 'OneDrive'}
          </span>
        </div>

        <hr className="border-gray-100" />

        {/* HIPAA status */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 w-28 shrink-0">HIPAA Status</span>
          {hipaaVerified ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-0.5 rounded-full">
              <FontAwesomeIcon icon={faCheckCircle} /> Verified &mdash; {verifyResult?.labelName}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
              <FontAwesomeIcon icon={faExclamationTriangle} /> Manually acknowledged
            </span>
          )}
        </div>

        {/* Permissions */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 w-28 shrink-0">Permissions</span>
          <span className="text-xs text-gray-700">{permissionSummary()}</span>
        </div>
      </div>

      {linkError && (
        <p className="text-sm text-red-500">{linkError}</p>
      )}

      <button
        type="button"
        onClick={onLink}
        disabled={linking}
        className="w-full py-3 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 transition-opacity"
        style={{ background: linking ? '#9ca3af' : '#2a5f6f' }}
      >
        {linking ? (
          <><FontAwesomeIcon icon={faSpinner} className="animate-spin" /> Linking…</>
        ) : (
          <><FontAwesomeIcon icon={faLink} /> Link Document</>
        )}
      </button>
    </div>
  );
}

// ── Wizard shell ──────────────────────────────────────────────────────────────

export default function DriveConnectWizard({ provider, onClose, onLinked, clientId, clientName }: Props) {
  const [step, setStep] = useState(1);

  // Step 1 state
  const [step1, setStep1] = useState<Step1State>({
    baaConfirmed: false,
    driveUrl:     '',
    displayName:  '',
    itemType:     'file',
  });

  // Step 2 state
  const [verifyLoading,    setVerifyLoading]    = useState(false);
  const [verifyResult,     setVerifyResult]     = useState<DriveVerifyResult | null>(null);
  const [hipaaAcknowledged, setHipaaAcknowledged] = useState(false);

  // Step 3 state — pre-scoped to the client when launched from a client record.
  const [step3, setStep3] = useState<Step3State>({
    permissionType:    clientId ? 'client_inherited' : 'org_roles',
    selectedRoles:     new Set(DEFAULT_CLINICAL_ROLES),
    userEmails:        [],
    emailInput:        '',
    clientId:          clientId ?? '',
    clientName:        clientName ?? '',
    inheritPermissions: true,
    inheritedRoles:    new Set(DEFAULT_CLINICAL_ROLES),
  });

  // Step 4 state
  const [linking,   setLinking]   = useState(false);
  const [linkError, setLinkError] = useState('');

  const providerName = provider === 'google' ? 'Google Drive' : 'OneDrive';
  const providerIcon = provider === 'google' ? faGoogle : faMicrosoft;
  const providerColor = provider === 'google' ? '#ea4335' : '#0078d4';

  // ── Navigation ───────────────────────────────────────────────────────

  const canAdvanceStep1 =
    step1.baaConfirmed && step1.driveUrl.trim() !== '' && step1.displayName.trim() !== '';

  const canAdvanceStep2 =
    verifyResult !== null && (verifyResult.verified || hipaaAcknowledged);

  const canAdvanceStep3 = (() => {
    if (step3.permissionType === 'org_roles')        return step3.selectedRoles.size > 0;
    if (step3.permissionType === 'individual')       return step3.userEmails.length > 0;
    if (step3.permissionType === 'client_inherited') return step3.clientId !== '';
    return false;
  })();

  const goNext = async () => {
    if (step === 1) {
      setStep(2);
      // Trigger verify on entering step 2
      setVerifyLoading(true);
      try {
        const result = await api.verifyHipaaLabels(provider, step1.driveUrl);
        setVerifyResult(result);
      } catch {
        setVerifyResult({
          verified:  false,
          itemId:    '',
          labelName: '',
          message:   'Could not verify HIPAA labels. Please proceed with acknowledgment.',
        });
      } finally {
        setVerifyLoading(false);
      }
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    }
  };

  const goBack = () => setStep((s) => Math.max(1, s - 1));

  // ── Link action ──────────────────────────────────────────────────────

  const handleLink = async () => {
    setLinking(true);
    setLinkError('');
    try {
      const allowedRoles = step3.permissionType === 'org_roles'
        ? Array.from(step3.selectedRoles)
        : step3.permissionType === 'client_inherited' && !step3.inheritPermissions
        ? Array.from(step3.inheritedRoles)
        : [];

      const payload = {
        driveSource:            provider,
        driveItemId:            verifyResult?.itemId ?? '',
        driveItemName:          step1.displayName,
        driveItemUrl:           step1.driveUrl,
        driveItemType:          step1.itemType,
        hipaaVerified:          verifyResult?.verified ?? false,
        hipaaLabelName:         verifyResult?.labelName ?? '',
        hipaaAcknowledged,
        permissionType:         step3.permissionType,
        allowedRoles,
        allowedUserIds:         step3.permissionType === 'individual' ? step3.userEmails : [],
        clientId:               step3.permissionType === 'client_inherited' ? step3.clientId : undefined,
        inheritClientPermissions: step3.permissionType === 'client_inherited' ? step3.inheritPermissions : false,
        notes:                  '',
      };

      const { id } = await api.connectDriveItem(payload);

      const connection: DriveConnection = {
        id,
        orgId:                  '',
        driveSource:            provider,
        driveItemId:            payload.driveItemId,
        driveItemName:          payload.driveItemName,
        driveItemUrl:           payload.driveItemUrl,
        driveItemType:          step1.itemType,
        hipaaVerified:          payload.hipaaVerified,
        hipaaLabelName:         payload.hipaaLabelName || undefined,
        hipaaAcknowledged:      payload.hipaaAcknowledged,
        permissionType:         step3.permissionType,
        allowedRoles:           allowedRoles as DriveConnection['allowedRoles'],
        allowedUserIds:         payload.allowedUserIds,
        clientId:               payload.clientId,
        inheritClientPermissions: payload.inheritClientPermissions,
        linkedBy:               '',
        linkedAt:               new Date().toISOString(),
      };

      onLinked(connection);
    } catch (e: unknown) {
      setLinkError(e instanceof Error ? e.message : 'Failed to link document.');
    } finally {
      setLinking(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <FontAwesomeIcon icon={providerIcon} style={{ color: providerColor, fontSize: 20 }} />
            <h2 className="text-base font-semibold text-gray-900">
              Link {providerName} Document
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 pt-5 pb-4">
          <StepIndicator current={step} />

          {step === 1 && (
            <Step1Select provider={provider} state={step1} onChange={setStep1} />
          )}
          {step === 2 && (
            <Step2Verify
              provider={provider}
              driveUrl={step1.driveUrl}
              result={verifyResult}
              loading={verifyLoading}
              acknowledged={hipaaAcknowledged}
              onAcknowledge={setHipaaAcknowledged}
            />
          )}
          {step === 3 && (
            <Step3Permissions state={step3} onChange={setStep3} />
          )}
          {step === 4 && (
            <Step4Confirm
              provider={provider}
              step1={step1}
              verifyResult={verifyResult}
              hipaaAcknowledged={hipaaAcknowledged}
              step3={step3}
              onLink={handleLink}
              linking={linking}
              linkError={linkError}
            />
          )}
        </div>

        {/* Footer nav (hidden on step 4 — the Link button is inline) */}
        {step < 4 && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
            <button
              onClick={step === 1 ? onClose : goBack}
              className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {step === 1 ? 'Cancel' : 'Back'}
            </button>
            <button
              onClick={goNext}
              disabled={
                (step === 1 && !canAdvanceStep1) ||
                (step === 2 && !canAdvanceStep2) ||
                (step === 3 && !canAdvanceStep3) ||
                verifyLoading
              }
              className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium transition-opacity"
              style={{
                background:
                  (step === 1 && !canAdvanceStep1) ||
                  (step === 2 && (!canAdvanceStep2 || verifyLoading)) ||
                  (step === 3 && !canAdvanceStep3)
                    ? '#9ca3af'
                    : '#2a5f6f',
              }}
            >
              {step === 3 ? 'Review' : 'Next'}
            </button>
          </div>
        )}
        {step === 4 && (
          <div className="px-6 py-4 border-t border-gray-100 shrink-0">
            <button
              onClick={goBack}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              &larr; Back to Permissions
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
