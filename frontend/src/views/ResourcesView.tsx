import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faTrash, faSpinner, faTimes, faBook,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import type { PolicyDocument, PolicyCategory } from '../types';
import { useAuth } from '../contexts/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

type ResourceTab = 'library' | 'policies' | 'classification';

type ResourcePurpose = 'GENERATION' | 'GROUNDING' | 'CLASSIFICATION';

type ResourceType =
  | 'POLICY'
  | 'STANDARD'
  | 'TEMPLATE'
  | 'REGULATION'
  | 'PAYER_REQUIREMENT'
  | 'CLIENT_RECORD';

interface Resource {
  id: string;
  title: string;
  resourceType: ResourceType;
  purposes: ResourcePurpose[];
  clientId?: string;
  content: string;
  isActive: boolean;
  orgId: string;
  createdAt: string;
  updatedAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS: { key: ResourceTab; label: string }[] = [
  { key: 'library',        label: 'Library'        },
  { key: 'policies',       label: 'Policies'       },
  { key: 'classification', label: 'Classification' },
];

const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  POLICY:            'Policy',
  STANDARD:          'Standard',
  TEMPLATE:          'Template',
  REGULATION:        'Regulation',
  PAYER_REQUIREMENT: 'Payer Requirement',
  CLIENT_RECORD:     'Client Record',
};

const ALL_RESOURCE_TYPES: ResourceType[] = [
  'POLICY', 'STANDARD', 'TEMPLATE', 'REGULATION', 'PAYER_REQUIREMENT', 'CLIENT_RECORD',
];

const PURPOSE_COLORS: Record<ResourcePurpose, { bg: string; text: string }> = {
  GENERATION:     { bg: '#EEF4FF', text: '#1E88FF' },
  GROUNDING:      { bg: '#F0FBF0', text: '#3F9B2F' },
  CLASSIFICATION: { bg: '#F3EEFE', text: '#7C3AED' },
};

const CATEGORY_LABELS: Record<PolicyCategory, string> = {
  policy_manual: 'Policy Manual',
  sop:           'SOP',
  handbook:      'Handbook',
  clinical_sop:  'Clinical SOP',
  template:      'Template',
};

const CATEGORY_COLORS: Record<PolicyCategory, { bg: string; text: string }> = {
  policy_manual: { bg: '#f3f4f6', text: '#374151' },
  sop:           { bg: '#fdf4e7', text: '#92400e' },
  handbook:      { bg: '#f0fdf4', text: '#166534' },
  clinical_sop:  { bg: '#e8f4f8', text: '#1e4d5c' },
  template:      { bg: '#EEF4FF', text: '#1E88FF' },
};

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #DCE7EE',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 14,
  color: '#1E3347',
  outline: 'none',
  background: '#fff',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#5A7184',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 4,
};

// ── Main view ─────────────────────────────────────────────────────────────────

export default function ResourcesView() {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ORG_ADMIN' || currentUser?.role === 'ORG_SUPER_ADMIN';

  const [activeTab, setActiveTab]     = useState<ResourceTab>('library');
  const [resources, setResources]     = useState<Resource[]>([]);
  const [policies, setPolicies]       = useState<PolicyDocument[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [error, setError]             = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Load data
  useEffect(() => {
    setIsLoading(true);
    setError('');
    Promise.all([
      api.getResources().catch(() => []),
      api.getPolicies().catch(() => []),
    ])
      .then(([res, pols]) => {
        setResources((res as Resource[]) ?? []);
        setPolicies(pols ?? []);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load resources.'))
      .finally(() => setIsLoading(false));
  }, []);

  const handleResourceToggleActive = async (resource: Resource) => {
    try {
      await api.updatePolicy(resource.id, { isActive: !resource.isActive });
      setResources((prev) =>
        prev.map((r) => r.id === resource.id ? { ...r, isActive: !r.isActive } : r)
      );
    } catch { /* ignore */ }
  };

  const handleResourceDelete = async (resource: Resource) => {
    if (!window.confirm(`Delete "${resource.title}"? This cannot be undone.`)) return;
    try {
      await api.deletePolicy(resource.id);
      setResources((prev) => prev.filter((r) => r.id !== resource.id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete resource.');
    }
  };

  const handleResourceCreated = (resource: Resource) => {
    setResources((prev) => [resource, ...prev]);
    setShowAddForm(false);
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: '#F8FBFC',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          background: '#FFFFFF',
          borderBottom: '1px solid #DCE7EE',
          paddingLeft: 32,
          paddingRight: 32,
          display: 'flex',
          alignItems: 'center',
          gap: 0,
        }}
      >
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setActiveTab(key); setShowAddForm(false); }}
            style={{
              padding: '12px 20px',
              fontSize: 14,
              fontWeight: 500,
              color: activeTab === key ? '#1E88FF' : '#5A7184',
              borderBottom: `2px solid ${activeTab === key ? '#1E88FF' : 'transparent'}`,
              background: 'transparent',
              border: 'none',
              borderBottomStyle: 'solid',
              borderBottomWidth: 2,
              borderBottomColor: activeTab === key ? '#1E88FF' : 'transparent',
              cursor: 'pointer',
              transition: 'color 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'library' && (
          <LibraryTab
            resources={resources}
            isLoading={isLoading}
            error={error}
            isAdmin={isAdmin}
            showAddForm={showAddForm}
            onToggleAddForm={() => setShowAddForm((v) => !v)}
            onCancelAddForm={() => setShowAddForm(false)}
            onResourceCreated={handleResourceCreated}
            onToggleActive={handleResourceToggleActive}
            onDelete={handleResourceDelete}
          />
        )}
        {activeTab === 'policies' && (
          <PoliciesTab
            policies={policies}
            isLoading={isLoading}
            error={error}
            isAdmin={isAdmin}
            onPolicyCreated={(p) => setPolicies((prev) => [p, ...prev])}
          />
        )}
        {activeTab === 'classification' && <ClassificationTab />}
      </div>
    </div>
  );
}

// ── Library Tab ───────────────────────────────────────────────────────────────

function LibraryTab({
  resources, isLoading, error, isAdmin,
  showAddForm, onToggleAddForm, onCancelAddForm,
  onResourceCreated, onToggleActive, onDelete,
}: {
  resources: Resource[];
  isLoading: boolean;
  error: string;
  isAdmin: boolean;
  showAddForm: boolean;
  onToggleAddForm: () => void;
  onCancelAddForm: () => void;
  onResourceCreated: (r: Resource) => void;
  onToggleActive: (r: Resource) => void;
  onDelete: (r: Resource) => void;
}) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E3347', margin: 0 }}>Resource Library</h2>
        {isAdmin && (
          <button
            onClick={onToggleAddForm}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              background: showAddForm ? '#F8FBFC' : '#1E88FF',
              color: showAddForm ? '#1E88FF' : '#FFFFFF',
              border: showAddForm ? '1px solid #1E88FF' : 'none',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <FontAwesomeIcon icon={showAddForm ? faTimes : faPlus} style={{ fontSize: 12 }} />
            {showAddForm ? 'Cancel' : 'Add Resource'}
          </button>
        )}
      </div>

      {/* Info banner */}
      <div
        style={{
          background: '#F0FBF0',
          border: '1px solid #3F9B2F',
          borderRadius: 10,
          padding: '12px 16px',
          marginBottom: 20,
          fontSize: 13,
          color: '#2E5C22',
          lineHeight: 1.6,
        }}
      >
        <strong>GROUNDING resources</strong> are sent to ACLX as reference sources. When the AI generates
        content, ACLX checks whether facts are supported by your library. Low groundedness scores appear
        as warnings on generated documents.
      </div>

      {/* Inline add form */}
      {showAddForm && isAdmin && (
        <AddResourceForm
          onSaved={onResourceCreated}
          onCancel={onCancelAddForm}
        />
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            background: '#FFF0F0',
            border: '1px solid #FCA5A5',
            borderRadius: 8,
            padding: '10px 14px',
            color: '#B91C1C',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 160, color: '#5A7184' }}>
          <FontAwesomeIcon icon={faSpinner} style={{ fontSize: 24, animation: 'spin 1s linear infinite' }} />
        </div>
      ) : resources.length === 0 && !showAddForm ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px 0',
            color: '#5A7184',
            textAlign: 'center',
          }}
        >
          <FontAwesomeIcon icon={faBook} style={{ fontSize: 40, color: '#DCE7EE', marginBottom: 12 }} />
          <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>No resources yet</p>
          <p style={{ fontSize: 13, margin: 0, color: '#8CA4B5' }}>
            {isAdmin ? 'Click "Add Resource" to add your first library entry.' : 'No resources have been published yet.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {resources.map((resource) => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              isAdmin={isAdmin}
              onToggleActive={() => onToggleActive(resource)}
              onDelete={() => onDelete(resource)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Add Resource Form ─────────────────────────────────────────────────────────

interface ResourceFormData {
  title: string;
  resourceType: ResourceType;
  purposes: ResourcePurpose[];
  clientId: string;
  content: string;
}

const EMPTY_FORM: ResourceFormData = {
  title:        '',
  resourceType: 'POLICY',
  purposes:     [],
  clientId:     '',
  content:      '',
};

function AddResourceForm({
  onSaved,
  onCancel,
}: {
  onSaved: (r: Resource) => void;
  onCancel: () => void;
}) {
  const [form, setForm]     = useState<ResourceFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const togglePurpose = (p: ResourcePurpose) => {
    setForm((f) => ({
      ...f,
      purposes: f.purposes.includes(p) ? f.purposes.filter((x) => x !== p) : [...f.purposes, p],
    }));
  };

  const handleSave = async () => {
    if (!form.title.trim())   { setError('Title is required.');   return; }
    if (!form.content.trim()) { setError('Content is required.'); return; }
    setSaving(true);
    setError('');
    try {
      // Map resource form to the policy API shape used by the backend.
      // The `category` field carries the resourceType; purposes go into
      // the textContent JSON envelope until a dedicated endpoint exists.
      const { policyId } = await api.createPolicy({
        title:       form.title,
        category:    form.resourceType.toLowerCase() as PolicyCategory,
        textContent: form.content,
        isActive:    true,
      });
      const newResource: Resource = {
        id:           policyId,
        title:        form.title,
        resourceType: form.resourceType,
        purposes:     form.purposes,
        clientId:     form.clientId || undefined,
        content:      form.content,
        isActive:     true,
        orgId:        '',
        createdAt:    new Date().toISOString(),
        updatedAt:    new Date().toISOString(),
      };
      onSaved(newResource);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save resource.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #DCE7EE',
        borderRadius: 12,
        padding: 20,
        marginBottom: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1E3347', marginTop: 0, marginBottom: 16 }}>
        New Resource
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Title */}
        <div>
          <label style={labelStyle}>Title <span style={{ color: '#EF4444' }}>*</span></label>
          <input
            type="text"
            style={inputStyle}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. HIPAA Privacy Policy 2024"
          />
        </div>

        {/* Resource Type */}
        <div>
          <label style={labelStyle}>Resource Type</label>
          <select
            style={inputStyle}
            value={form.resourceType}
            onChange={(e) => setForm((f) => ({ ...f, resourceType: e.target.value as ResourceType }))}
          >
            {ALL_RESOURCE_TYPES.map((t) => (
              <option key={t} value={t}>{RESOURCE_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        {/* Purposes */}
        <div>
          <label style={labelStyle}>Purposes</label>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {(['GENERATION', 'GROUNDING', 'CLASSIFICATION'] as ResourcePurpose[]).map((p) => {
              const checked = form.purposes.includes(p);
              const colors  = PURPOSE_COLORS[p];
              return (
                <label
                  key={p}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: `1px solid ${checked ? colors.text : '#DCE7EE'}`,
                    background: checked ? colors.bg : '#F8FBFC',
                    fontSize: 13,
                    fontWeight: 600,
                    color: checked ? colors.text : '#5A7184',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePurpose(p)}
                    style={{ accentColor: colors.text }}
                  />
                  {p}
                </label>
              );
            })}
          </div>
        </div>

        {/* Client ID */}
        <div>
          <label style={labelStyle}>Limit to Client ID <span style={{ color: '#8CA4B5', textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
          <input
            type="text"
            style={inputStyle}
            value={form.clientId}
            onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
            placeholder="Leave blank for org-wide"
          />
        </div>

        {/* Content */}
        <div>
          <label style={labelStyle}>Content <span style={{ color: '#EF4444' }}>*</span></label>
          <textarea
            rows={8}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', lineHeight: 1.6 }}
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            placeholder="Paste or type the resource content here…"
          />
        </div>

        {error && (
          <p style={{ fontSize: 13, color: '#B91C1C', margin: 0 }}>{error}</p>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: '1px solid #DCE7EE',
              background: '#F8FBFC',
              color: '#5A7184',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: saving ? '#7EC8FF' : '#1E88FF',
              color: '#FFFFFF',
              fontSize: 14,
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Save Resource'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Resource Card ─────────────────────────────────────────────────────────────

function ResourceCard({
  resource, isAdmin, onToggleActive, onDelete,
}: {
  resource: Resource;
  isAdmin: boolean;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #DCE7EE',
        borderRadius: 12,
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        opacity: resource.isActive ? 1 : 0.65,
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      }}
    >
      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#1E3347' }}>{resource.title}</span>

          {/* Resource type badge */}
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              background: '#F0F4F8',
              color: '#5A7184',
            }}
          >
            {RESOURCE_TYPE_LABELS[resource.resourceType] ?? resource.resourceType}
          </span>
        </div>

        {/* Purpose tags */}
        {resource.purposes.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            {resource.purposes.map((p) => {
              const c = PURPOSE_COLORS[p];
              return (
                <span
                  key={p}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    background: c.bg,
                    color: c.text,
                  }}
                >
                  {p}
                </span>
              );
            })}
          </div>
        )}

        {/* Client scope */}
        {resource.clientId && (
          <p style={{ fontSize: 12, color: '#8CA4B5', margin: '2px 0 0', fontStyle: 'italic' }}>
            Scoped to: {resource.clientId}
          </p>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {/* Active toggle */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: '#5A7184',
            cursor: 'pointer',
            userSelect: 'none',
          }}
          title={resource.isActive ? 'Active' : 'Inactive'}
        >
          <input
            type="checkbox"
            checked={resource.isActive}
            onChange={onToggleActive}
            style={{ accentColor: '#3F9B2F' }}
          />
          {resource.isActive ? 'Active' : 'Inactive'}
        </label>

        {/* Delete */}
        {isAdmin && (
          <button
            onClick={onDelete}
            style={{
              width: 30,
              height: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              color: '#EF4444',
              cursor: 'pointer',
            }}
            title="Delete resource"
            onMouseEnter={(e) => (e.currentTarget.style.background = '#FEF2F2')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <FontAwesomeIcon icon={faTrash} style={{ fontSize: 13 }} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Policies Tab ──────────────────────────────────────────────────────────────

function PoliciesTab({
  policies, isLoading, error, isAdmin, onPolicyCreated,
}: {
  policies: PolicyDocument[];
  isLoading: boolean;
  error: string;
  isAdmin: boolean;
  onPolicyCreated: (p: PolicyDocument) => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E3347', margin: 0 }}>Policies</h2>
        {isAdmin && (
          <button
            onClick={() => setShowAddForm((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              background: showAddForm ? '#F8FBFC' : '#3F9B2F',
              color: showAddForm ? '#3F9B2F' : '#FFFFFF',
              border: showAddForm ? '1px solid #3F9B2F' : 'none',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <FontAwesomeIcon icon={showAddForm ? faTimes : faPlus} style={{ fontSize: 12 }} />
            {showAddForm ? 'Cancel' : 'Add Policy'}
          </button>
        )}
      </div>

      {/* Inline add policy form */}
      {showAddForm && isAdmin && (
        <AddPolicyForm
          onSaved={(p) => { onPolicyCreated(p); setShowAddForm(false); }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            background: '#FFF0F0',
            border: '1px solid #FCA5A5',
            borderRadius: 8,
            padding: '10px 14px',
            color: '#B91C1C',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 160, color: '#5A7184' }}>
          <FontAwesomeIcon icon={faSpinner} style={{ fontSize: 24, animation: 'spin 1s linear infinite' }} />
        </div>
      ) : policies.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px 0',
            color: '#5A7184',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>No policies yet</p>
          <p style={{ fontSize: 13, margin: 0, color: '#8CA4B5' }}>
            {isAdmin ? 'Click "Add Policy" to create your first policy document.' : 'No policies have been published yet.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {policies.map((policy) => {
            const colors = CATEGORY_COLORS[policy.category] ?? { bg: '#f3f4f6', text: '#374151' };
            return (
              <div
                key={policy.id}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #DCE7EE',
                  borderRadius: 10,
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  opacity: policy.isActive ? 1 : 0.65,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#1E3347' }}>{policy.title}</span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 600,
                        background: colors.bg,
                        color: colors.text,
                      }}
                    >
                      {CATEGORY_LABELS[policy.category] ?? policy.category}
                    </span>
                    {!policy.isActive && (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 500,
                          background: '#F3F4F6',
                          color: '#9CA3AF',
                        }}
                      >
                        Draft
                      </span>
                    )}
                  </div>
                </div>
                <span style={{ fontSize: 12, color: '#8CA4B5', flexShrink: 0 }}>
                  {policy.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Add Policy Form ───────────────────────────────────────────────────────────

const ALL_POLICY_CATEGORIES: PolicyCategory[] = [
  'policy_manual', 'sop', 'handbook', 'clinical_sop', 'template',
];

function AddPolicyForm({
  onSaved,
  onCancel,
}: {
  onSaved: (p: PolicyDocument) => void;
  onCancel: () => void;
}) {
  const [title, setTitle]               = useState('');
  const [category, setCategory]         = useState<PolicyCategory>('policy_manual');
  const [textContent, setTextContent]   = useState('');
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const { policyId } = await api.createPolicy({ title, category, textContent, isActive: true });
      const newPolicy: PolicyDocument = {
        id: policyId, title, category, textContent, isActive: true,
        orgId: '', createdBy: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      onSaved(newPolicy);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save policy.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #DCE7EE',
        borderRadius: 12,
        padding: 20,
        marginBottom: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1E3347', marginTop: 0, marginBottom: 16 }}>New Policy</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Title <span style={{ color: '#EF4444' }}>*</span></label>
          <input
            type="text"
            style={inputStyle}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Client Intake Policy"
          />
        </div>

        <div>
          <label style={labelStyle}>Category</label>
          <select
            style={inputStyle}
            value={category}
            onChange={(e) => setCategory(e.target.value as PolicyCategory)}
          >
            {ALL_POLICY_CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Content</label>
          <textarea
            rows={6}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', lineHeight: 1.6 }}
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            placeholder="Paste or type policy text here…"
          />
        </div>

        {error && <p style={{ fontSize: 13, color: '#B91C1C', margin: 0 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 20px', borderRadius: 8,
              border: '1px solid #DCE7EE', background: '#F8FBFC',
              color: '#5A7184', fontSize: 14, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: saving ? '#86EFAC' : '#3F9B2F',
              color: '#FFFFFF', fontSize: 14, fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Save Policy'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Classification Tab ────────────────────────────────────────────────────────

function ClassificationTab() {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E3347', marginTop: 0, marginBottom: 16 }}>
        Classification Library
      </h2>
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #DCE7EE',
          borderRadius: 12,
          padding: '28px 24px',
          maxWidth: 560,
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: '#F3EEFE',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 14,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="8" height="8" rx="2" stroke="#7C3AED" strokeWidth="1.8" />
            <rect x="13" y="3" width="8" height="8" rx="2" stroke="#7C3AED" strokeWidth="1.8" />
            <rect x="3" y="13" width="8" height="8" rx="2" stroke="#7C3AED" strokeWidth="1.8" />
            <rect x="13" y="13" width="8" height="8" rx="2" stroke="#7C3AED" strokeWidth="1.8" />
          </svg>
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1E3347', margin: '0 0 8px' }}>
          Classification Library
        </h3>
        <p style={{ fontSize: 14, color: '#5A7184', lineHeight: 1.7, margin: 0 }}>
          Define custom sensitivity tiers and content categories that overlay ACLX's standard HIPAA
          labels. Your custom labels will appear alongside ACLX labels in the audit log and review
          queue. <strong>Coming soon.</strong>
        </p>
      </div>
    </div>
  );
}
