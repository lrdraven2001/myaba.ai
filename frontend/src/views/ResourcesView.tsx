import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faTrash, faSpinner, faTimes, faBook,
  faExternalLinkAlt, faShieldAlt, faFolderOpen,
} from '@fortawesome/free-solid-svg-icons';
import { faGoogle, faMicrosoft } from '@fortawesome/free-brands-svg-icons';
import { api } from '../lib/api';
import type { PolicyDocument, PolicyCategory, DriveConnection } from '../types';
import DriveConnectWizard from '../components/drive/DriveConnectWizard';
import { useAuth } from '../contexts/AuthContext';
import { DOCUMENT_TYPES, documentTypeLabel, defaultTemplateFor } from '../lib/documentTypes';

// ── Types ─────────────────────────────────────────────────────────────────────

type ResourceTab = 'library' | 'policies' | 'grounding';

// The three Agency Library resource types.
type ResourceType =
  | 'STANDARD_TEMPLATE'
  | 'GENERATION_TEMPLATE'
  | 'KNOWLEDGE_REFERENCE';

interface Resource {
  id: string;
  title: string;
  resourceType: ResourceType;
  /** Bucket: LIBRARY | GROUNDING | POLICY */
  bucket?: string;
  /** For GENERATION_TEMPLATE — the client document type this template customizes. */
  documentType?: string;
  /** false for seeded defaults; true once the agency edits the template. */
  customized?: boolean;
  clientId?: string;
  content: string;
  isActive: boolean;
  orgId: string;
  createdAt: string;
  updatedAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS: { key: ResourceTab; label: string }[] = [
  { key: 'library',        label: 'Agency Library' },
  { key: 'policies',       label: 'Policies'       },
  { key: 'grounding',      label: 'Grounding'      },
];

const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  STANDARD_TEMPLATE:   'Standard Template',
  GENERATION_TEMPLATE: 'Generation Template',
  KNOWLEDGE_REFERENCE: 'Knowledge Reference',
};

const RESOURCE_TYPE_HELP: Record<ResourceType, string> = {
  STANDARD_TEMPLATE:   'A reusable document template the team can start from.',
  GENERATION_TEMPLATE: 'Customizes how the AI drafts a specific client document type (BIP, FBA, etc.).',
  KNOWLEDGE_REFERENCE: 'Reference material the AI can draw on during any chat.',
};

const ALL_RESOURCE_TYPES: ResourceType[] = [
  'STANDARD_TEMPLATE', 'GENERATION_TEMPLATE', 'KNOWLEDGE_REFERENCE',
];

const RESOURCE_TYPE_COLORS: Record<ResourceType, { bg: string; text: string }> = {
  STANDARD_TEMPLATE:   { bg: '#EEF4FF', text: '#1E88FF' },
  GENERATION_TEMPLATE: { bg: '#F3EEFE', text: '#7C3AED' },
  KNOWLEDGE_REFERENCE: { bg: '#F0FBF0', text: '#3F9B2F' },
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
  const isAdmin = currentUser?.role === 'ORG_SUPER_ADMIN' || currentUser?.role === 'CLINICAL_DIRECTOR';

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
        {activeTab === 'grounding' && (
          <GroundingTab resources={resources} isLoading={isLoading} onResourceCreated={handleResourceCreated} isAdmin={isAdmin} />
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
      </div>
    </div>
  );
}

// ── Cloud-linked documents (org-wide) ──────────────────────────────────────────

function OrgDriveResourcesSection({ isAdmin }: { isAdmin: boolean }) {
  const [connections, setConnections] = useState<DriveConnection[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [showDrive, setShowDrive]   = useState<'google' | 'microsoft' | null>(null);
  const [removing, setRemoving]     = useState<string | null>(null);

  // Org-wide reference docs = drive connections NOT scoped to a specific client.
  useEffect(() => {
    setLoading(true);
    api.getDriveConnections()
      .then((all) => setConnections(all.filter((c) => !c.clientId)))
      .catch(() => setConnections([]))
      .finally(() => setLoading(false));
  }, []);

  const handleRemove = async (id: string) => {
    setRemoving(id);
    try {
      await api.deleteDriveConnection(id);
      setConnections((prev) => prev.filter((c) => c.id !== id));
    } catch { /* row stays on failure */ }
    finally { setRemoving(null); }
  };

  return (
    <div style={{ marginBottom: 24, border: '1px solid #DCE7EE', borderRadius: 12, background: '#FFFFFF', overflow: 'visible' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '14px 16px', borderBottom: connections.length || loading ? '1px solid #EEF2F5' : 'none' }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E3347', margin: '0 0 2px' }}>Linked cloud documents</h3>
          <p style={{ fontSize: 12.5, color: '#5A7184', margin: 0, lineHeight: 1.5, maxWidth: 540 }}>
            Link reference documents or folders from Google Drive or OneDrive. Files stay in your cloud
            under your own sharing controls — myABA stores only the link.
          </p>
        </div>
        {isAdmin && (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => setShowPicker((v) => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, background: '#2a5f6f', color: '#FFFFFF', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              <FontAwesomeIcon icon={faPlus} style={{ fontSize: 11 }} />
              Link Drive
            </button>
            {showPicker && (
              <div style={{ position: 'absolute', right: 0, marginTop: 4, width: 210, background: '#FFFFFF', borderRadius: 12, border: '1px solid #DCE7EE', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 20, overflow: 'hidden' }}>
                <button
                  onClick={() => { setShowPicker(false); setShowDrive('google'); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'white', border: 'none', fontSize: 13, color: '#374151', cursor: 'pointer' }}
                >
                  <FontAwesomeIcon icon={faGoogle} style={{ color: '#ea4335' }} /> Link from Google Drive
                </button>
                <button
                  onClick={() => { setShowPicker(false); setShowDrive('microsoft'); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'white', border: 'none', borderTop: '1px solid #F0F3F5', fontSize: 13, color: '#374151', cursor: 'pointer' }}
                >
                  <FontAwesomeIcon icon={faMicrosoft} style={{ color: '#0078d4' }} /> Link from OneDrive
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: '#8CA4B5' }}>
          <FontAwesomeIcon icon={faSpinner} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : connections.length === 0 ? (
        <div style={{ padding: '20px 16px', display: 'flex', alignItems: 'center', gap: 10, color: '#8CA4B5', fontSize: 13 }}>
          <FontAwesomeIcon icon={faFolderOpen} style={{ fontSize: 16, color: '#DCE7EE' }} />
          No cloud documents linked yet.
        </div>
      ) : (
        <div>
          {connections.map((c) => {
            const isGoogle = c.driveSource === 'google';
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: '1px solid #F4F7F9' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: isGoogle ? '#fdeceb' : '#e8f1fb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FontAwesomeIcon icon={isGoogle ? faGoogle : faMicrosoft} style={{ color: isGoogle ? '#ea4335' : '#0078d4', fontSize: 14 }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: '#1E3347', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.driveItemName}</span>
                    {c.hipaaVerified ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 999, background: '#EEF7EA', color: '#2E7D22' }}>
                        <FontAwesomeIcon icon={faShieldAlt} style={{ fontSize: 9 }} /> HIPAA labeled
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 999, background: '#fef3c7', color: '#92400e' }}>Label unverified</span>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: '#8CA4B5', margin: '1px 0 0' }}>{isGoogle ? 'Google Drive' : 'OneDrive'} · {c.driveItemType}</p>
                </div>
                <a href={c.driveItemUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#8CA4B5', padding: '0 6px' }} title="Open in provider">
                  <FontAwesomeIcon icon={faExternalLinkAlt} style={{ fontSize: 13 }} />
                </a>
                {isAdmin && (
                  <button onClick={() => handleRemove(c.id)} disabled={removing === c.id}
                    style={{ background: 'none', border: 'none', color: '#B6C2CC', cursor: 'pointer', padding: '0 4px' }} title="Remove link">
                    <FontAwesomeIcon icon={removing === c.id ? faSpinner : faTrash} style={{ fontSize: 13, animation: removing === c.id ? 'spin 1s linear infinite' : undefined }} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showDrive && (
        <DriveConnectWizard
          provider={showDrive}
          onClose={() => setShowDrive(null)}
          onLinked={(c) => { setConnections((prev) => [c, ...prev]); setShowDrive(null); }}
        />
      )}
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
  // The Agency Library shows writing material only — grounding sources live in their
  // own tab and are excluded here.
  const libraryResources = resources.filter((r) => (r.bucket ?? 'LIBRARY') === 'LIBRARY');

  // Document type the admin is customizing a generation template for (pre-fills the form).
  const [customizeDoc, setCustomizeDoc] = useState<string | null>(null);

  // Map each document type → its customized generation template (if any).
  const genTemplates = libraryResources.filter(
    (r) => r.resourceType === 'GENERATION_TEMPLATE' && r.documentType,
  );
  const customizedFor = (docValue: string) =>
    genTemplates.find((r) => r.documentType === docValue && r.customized);
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E3347', margin: 0 }}>Agency Resource Library</h2>
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

      {/* Plain-language guidance — what this tab is and how the purpose tags work */}
      <div
        style={{
          background: '#F8FBFC',
          border: '1px solid #DCE7EE',
          borderRadius: 10,
          padding: '14px 18px',
          marginBottom: 20,
          fontSize: 13,
          color: '#1E3347',
          lineHeight: 1.65,
        }}
      >
        <p style={{ margin: '0 0 8px' }}>
          The <strong>Agency Library</strong> holds your reusable building blocks: <strong>Standard Templates</strong>{' '}
          (documents to start from), <strong>Generation Templates</strong> (which shape how the AI drafts each client
          document type), and <strong>Knowledge References</strong> (material the AI can draw on).
        </p>
        <p style={{ margin: 0, color: '#5A7184' }}>
          The Library, <strong>Policies</strong>, and <strong>Grounding</strong> are three separate buckets — they
          don't overlap, but any of them can be used in any chat. Policies hold your agency's rules and SOPs;
          Grounding holds trusted sources the AI is checked against. Each lives in its own tab.
        </p>
      </div>

      {/* Document Generation Templates — one slot per client document type */}
      {isAdmin && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E3347', margin: '0 0 4px' }}>
            Document Generation Templates
          </h3>
          <p style={{ fontSize: 12, color: '#8CA4B5', margin: '0 0 10px' }}>
            Each client document type uses a built-in <strong>Default</strong> template until your agency customizes it.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {DOCUMENT_TYPES.map((dt) => {
              const custom = customizedFor(dt.value);
              return (
                <div
                  key={dt.value}
                  style={{
                    border: '1px solid #DCE7EE', borderRadius: 10, padding: '12px 14px',
                    background: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1E3347' }}>{dt.label}</span>
                    <span
                      style={{
                        padding: '1px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                        background: custom ? '#F3EEFE' : '#F0F4F8',
                        color: custom ? '#7C3AED' : '#8CA4B5',
                      }}
                    >
                      {custom ? 'Customized' : 'Default'}
                    </span>
                  </div>
                  <button
                    onClick={() => { setCustomizeDoc(dt.value); onCancelAddForm(); }}
                    style={{
                      alignSelf: 'flex-start', padding: '4px 10px', borderRadius: 6,
                      border: '1px solid #1E88FF', background: 'white', color: '#1E88FF',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {custom ? 'Replace template' : 'Customize'}
                  </button>
                </div>
              );
            })}
          </div>
          {customizeDoc && (
            <div style={{ marginTop: 12 }}>
              <AddResourceForm
                bucket="LIBRARY"
                presetResourceType="GENERATION_TEMPLATE"
                presetDocumentType={customizeDoc}
                onSaved={(r) => { onResourceCreated(r); setCustomizeDoc(null); }}
                onCancel={() => setCustomizeDoc(null)}
              />
            </div>
          )}
        </div>
      )}

      {/* Cloud-linked documents (Google Drive / OneDrive) — org-wide reference material */}
      <OrgDriveResourcesSection isAdmin={isAdmin} />

      {/* Inline add form */}
      {showAddForm && isAdmin && (
        <AddResourceForm
          bucket="LIBRARY"
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
      ) : libraryResources.length === 0 && !showAddForm ? (
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
          {libraryResources.map((resource) => (
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
  documentType: string;
  clientId: string;
  content: string;
}

const EMPTY_FORM: ResourceFormData = {
  title:        '',
  resourceType: 'KNOWLEDGE_REFERENCE',
  documentType: '',
  clientId:     '',
  content:      '',
};

function AddResourceForm({
  onSaved,
  onCancel,
  bucket = 'LIBRARY',
  presetResourceType,
  presetDocumentType,
}: {
  onSaved: (r: Resource) => void;
  onCancel: () => void;
  /** Which bucket the new resource belongs to (LIBRARY or GROUNDING). */
  bucket?: string;
  presetResourceType?: ResourceType;
  presetDocumentType?: string;
}) {
  const isGrounding = bucket === 'GROUNDING';
  const [form, setForm]     = useState<ResourceFormData>({
    ...EMPTY_FORM,
    resourceType: presetResourceType ?? EMPTY_FORM.resourceType,
    documentType: presetDocumentType ?? '',
    // Pre-load the default skeleton when customizing a generation template for a doc type.
    title:   presetDocumentType ? `${documentTypeLabel(presetDocumentType)} Template` : '',
    content: presetDocumentType ? defaultTemplateFor(presetDocumentType) : '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const handleSave = async () => {
    if (!form.title.trim())   { setError('Title is required.');   return; }
    if (!form.content.trim()) { setError('Content is required.'); return; }
    if (!isGrounding && form.resourceType === 'GENERATION_TEMPLATE' && !form.documentType) {
      setError('Choose the document type this generation template customizes.'); return;
    }
    setSaving(true);
    setError('');
    try {
      const resourceType = isGrounding ? 'KNOWLEDGE_REFERENCE' : form.resourceType;
      const isGenTemplate = !isGrounding && form.resourceType === 'GENERATION_TEMPLATE';
      const { policyId } = await api.createPolicy({
        title:        form.title,
        category:     resourceType.toLowerCase() as PolicyCategory,
        textContent:  form.content,
        isActive:     true,
        bucket,
        resourceType,
        documentType: isGenTemplate ? form.documentType : undefined,
        customized:   isGenTemplate ? true : undefined,
        clientId:     form.clientId || undefined,
      });
      const newResource: Resource = {
        id:           policyId,
        title:        form.title,
        resourceType,
        bucket,
        documentType: isGenTemplate ? form.documentType : undefined,
        customized:   isGenTemplate ? true : undefined,
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
        {isGrounding ? 'New Grounding Source' : 'New Library Resource'}
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
            placeholder={isGrounding ? 'e.g. BACB Ethics Code (2022)' : 'e.g. Standard BIP Template'}
          />
        </div>

        {/* Resource Type — Agency Library only */}
        {!isGrounding && (
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
            <p style={{ fontSize: 12, color: '#8CA4B5', margin: '6px 0 0' }}>
              {RESOURCE_TYPE_HELP[form.resourceType]}
            </p>
          </div>
        )}

        {/* Document type — only for Generation Templates */}
        {!isGrounding && form.resourceType === 'GENERATION_TEMPLATE' && (
          <div>
            <label style={labelStyle}>Document Type <span style={{ color: '#EF4444' }}>*</span></label>
            <select
              style={inputStyle}
              value={form.documentType}
              onChange={(e) => setForm((f) => ({ ...f, documentType: e.target.value }))}
            >
              <option value="">Select a document type…</option>
              {DOCUMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <p style={{ fontSize: 12, color: '#8CA4B5', margin: '6px 0 0' }}>
              This template will be used whenever the team generates this document type for a client.
            </p>
          </div>
        )}

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
          {(() => {
            const c = RESOURCE_TYPE_COLORS[resource.resourceType] ?? { bg: '#F0F4F8', text: '#5A7184' };
            return (
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 600,
                  background: c.bg,
                  color: c.text,
                }}
              >
                {RESOURCE_TYPE_LABELS[resource.resourceType] ?? resource.resourceType}
              </span>
            );
          })()}
        </div>

        {/* Generation template → which document type it customizes */}
        {resource.resourceType === 'GENERATION_TEMPLATE' && resource.documentType && (
          <div style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: '#7C3AED', fontWeight: 600 }}>
              Customizes: {documentTypeLabel(resource.documentType)}
            </span>
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

      {/* Plain-language guidance */}
      <div
        style={{
          background: '#F8FBFC', border: '1px solid #DCE7EE', borderRadius: 10,
          padding: '14px 18px', marginBottom: 20, fontSize: 13, color: '#1E3347', lineHeight: 1.65,
        }}
      >
        Your agency's <strong>policies and standard operating procedures</strong> — the rules your staff
        and the AI must follow. Attach a policy to a chat so the AI keeps its guidance in mind while it works.
        Use the <strong>Library</strong> tab for reference materials and templates; use this tab for the rules themselves.
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

// ── Grounding Tab ─────────────────────────────────────────────────────────────

function GroundingTab({
  resources, isLoading, onResourceCreated, isAdmin,
}: {
  resources: Resource[];
  isLoading: boolean;
  onResourceCreated: (r: Resource) => void;
  isAdmin: boolean;
}) {
  const grounding = resources.filter((r) => (r.bucket ?? '') === 'GROUNDING');
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E3347', margin: 0 }}>Grounding Sources</h2>
        {isAdmin && (
          <button
            onClick={() => setShowAdd((s) => !s)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 8,
              background: showAdd ? '#F8FBFC' : '#3F9B2F', color: showAdd ? '#3F9B2F' : '#FFFFFF',
              border: showAdd ? '1px solid #3F9B2F' : 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <FontAwesomeIcon icon={showAdd ? faTimes : faPlus} style={{ fontSize: 12 }} />
            {showAdd ? 'Cancel' : 'Add Grounding Source'}
          </button>
        )}
      </div>

      {/* Plain-language explanation with examples */}
      <div style={{ background: '#F0FBF0', border: '1px solid #3F9B2F', borderRadius: 10, padding: '14px 18px', marginBottom: 20, fontSize: 13, color: '#2E5C22', lineHeight: 1.65 }}>
        <p style={{ margin: '0 0 8px' }}>
          <strong>Grounding sources</strong> are your agency's trusted reference material — the facts the AI must
          stay true to. They are a way to <strong>prevent hallucinations</strong>: when the AI writes, it draws from
          these instead of guessing, and anything it can't support from a grounding source shows up as a warning so
          you can catch it. Grounding is its own bucket, separate from the Agency Library and Policies, but usable in
          any chat.
        </p>
        <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Good examples to add here:</p>
        <ul style={{ margin: '0 0 0 18px', padding: 0 }}>
          <li>Your agency's clinical standards and treatment protocols (e.g. your reinforcement or crisis-management procedures)</li>
          <li>Payer / insurance requirements for documentation (what Medicaid or a specific plan requires in a progress note)</li>
          <li>Assessment tools and scoring guides your BCBAs use (VB-MAPP, ABLLS-R reference material)</li>
          <li>Approved goal banks or program descriptions the AI should pull wording from</li>
        </ul>
        <p style={{ margin: '8px 0 0', color: '#3F6B2C' }}>
          Rule of thumb: if you'd want the AI to <em>quote it or follow it exactly</em>, it's a grounding source.
          If it's just a writing example or starting template, keep it in the <strong>Agency Library</strong> instead.
        </p>
      </div>

      {showAdd && isAdmin && (
        <AddResourceForm
          bucket="GROUNDING"
          onSaved={(r) => { onResourceCreated(r); setShowAdd(false); }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 160, color: '#5A7184' }}>
          <FontAwesomeIcon icon={faSpinner} style={{ fontSize: 24, animation: 'spin 1s linear infinite' }} />
        </div>
      ) : grounding.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 0', color: '#5A7184', textAlign: 'center' }}>
          <FontAwesomeIcon icon={faBook} style={{ fontSize: 40, color: '#DCE7EE', marginBottom: 12 }} />
          <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>No grounding sources yet</p>
          <p style={{ fontSize: 13, margin: 0, color: '#8CA4B5' }}>
            {isAdmin ? 'Add a source and tag it "Grounding" so the AI can reference it.' : 'No grounding sources have been published yet.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {grounding.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: '#FFFFFF', border: '1px solid #DCE7EE', borderRadius: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: '#F0FBF0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FontAwesomeIcon icon={faBook} style={{ color: '#3F9B2F', fontSize: 15 }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#1E3347', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</p>
                <p style={{ fontSize: 12, color: '#8CA4B5', margin: '2px 0 0' }}>
                  {RESOURCE_TYPE_LABELS[r.resourceType] ?? r.resourceType}
                  {!r.isActive && ' · inactive'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

