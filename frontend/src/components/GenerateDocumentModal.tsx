import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTimes, faRobot, faSpinner, faShieldAlt, faCheckCircle,
  faExclamationTriangle, faChevronDown, faChevronUp, faCopy, faCheck,
} from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
import { DOCUMENT_TYPES } from '../lib/documentTypes';

// ── Detector label map ────────────────────────────────────────────────────────

const DETECTOR_LABELS: Record<string, string> = {
  hipaa_phi:      'HIPAA PHI',
  semantic:       'Semantic PHI',
  groundedness:   'Groundedness',
  synthesis:      'Cross-client synthesis',
  pii:            'PII',
  cui:            'CUI',
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface DetectorFinding {
  detector: string;
  matched: boolean;
  confidence: string;
  category: string;
}

interface RedactionMeta {
  category: string;
  detector: string;
  position: number;
}

interface GenerateResult {
  content: string;
  documentId: string;
  decision: string;
  contentId: string;
  redactedTokenCount?: number;
  groundednessScore?: number;
  groundednessWarning?: boolean;
  detectorFindings?: DetectorFinding[];
  redactionMetadata?: RedactionMeta[];
}

interface Props {
  clientId: string;
  clientName: string;
  onClose: () => void;
  onDocumentGenerated?: (docId: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GenerateDocumentModal({
  clientId, clientName, onClose, onDocumentGenerated,
}: Props) {
  const [docType,    setDocType]    = useState(DOCUMENT_TYPES[0].value);
  const [context,   setContext]     = useState('');
  const [loading,   setLoading]     = useState(false);
  const [error,     setError]       = useState<string | null>(null);
  const [result,    setResult]      = useState<GenerateResult | null>(null);
  const [showFindings, setShowFindings] = useState(false);
  const [copied,    setCopied]      = useState(false);
  // Document types that have a customized agency Generation Template.
  const [customizedTypes, setCustomizedTypes] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.getResources()
      .then((res) => {
        const list = (res as Array<{ resourceType?: string; documentType?: string; customized?: boolean }>) ?? [];
        const customized = new Set(
          list
            .filter((r) => r.resourceType === 'GENERATION_TEMPLATE' && r.customized && r.documentType)
            .map((r) => r.documentType as string),
        );
        setCustomizedTypes(customized);
      })
      .catch(() => {});
  }, []);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await api.generateDocument(clientId, docType, context || undefined);
      setResult(res);
      if (res.documentId && onDocumentGenerated) {
        onDocumentGenerated(res.documentId);
      }
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        if (e.status === 403) {
          const reason = e.details?.reason as string | undefined;
          if (reason === 'HARD_BLOCK_NO_AUTHORIZATION') {
            setError('Document blocked: written authorization is required for this client\'s data category before any AI processing can occur. Add the authorization in the Authorizations tab.');
          } else {
            setError(e.message || 'Document blocked by compliance policy.');
          }
        } else {
          setError(e.message || 'Generation failed. Please try again.');
        }
      } else {
        setError('Generation failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const copyContent = () => {
    if (result?.content) {
      navigator.clipboard.writeText(result.content).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const decisionColor = (d: string) => {
    if (d === 'ALLOW')   return { bg: '#F0FDF4', text: '#166534', icon: faCheckCircle };
    if (d === 'REDACT')  return { bg: '#FFF8E1', text: '#B45309', icon: faShieldAlt };
    return                      { bg: '#FEF2F2', text: '#991B1B', icon: faExclamationTriangle };
  };

  const matchedFindings = result?.detectorFindings?.filter(f => f.matched) ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white w-full sm:rounded-2xl shadow-2xl flex flex-col"
        style={{ maxWidth: 680, maxHeight: '92vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#EEF4FF' }}>
              <FontAwesomeIcon icon={faRobot} style={{ color: '#1E88FF', fontSize: 15 }} />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">Generate Document</p>
              <p className="text-xs text-gray-400">{clientName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* Form — only show when no result yet */}
          {!result && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Document Type</label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                >
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label} {customizedTypes.has(t.value) ? '(Customized)' : '(Default)'}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  {customizedTypes.has(docType)
                    ? 'Uses your agency’s customized template from the Agency Library.'
                    : 'Uses the built-in default template. Customize it in Resources → Agency Library.'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Additional Context <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Add session details, goals addressed, client behaviour notes, or other context to include in the document…"
                  rows={4}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Do not include SSNs, insurance IDs, or other non-clinical identifiers.
                </p>
              </div>

              {error && (
                <div className="rounded-lg px-4 py-3 text-sm text-red-700" style={{ background: '#FEF2F2', border: '1px solid #FCA5A5' }}>
                  {error}
                </div>
              )}
            </>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-4">
              {/* Decision banner */}
              {(() => {
                const dc = decisionColor(result.decision);
                return (
                  <div className="rounded-xl px-4 py-3 flex items-start gap-3" style={{ background: dc.bg }}>
                    <FontAwesomeIcon icon={dc.icon} style={{ color: dc.text, marginTop: 2, fontSize: 14 }} />
                    <div>
                      <p className="text-sm font-semibold" style={{ color: dc.text }}>
                        {result.decision === 'ALLOW'  && 'Document generated successfully'}
                        {result.decision === 'REDACT' && `Document generated — ${result.redactedTokenCount ?? 0} item${result.redactedTokenCount === 1 ? '' : 's'} redacted for compliance`}
                      </p>
                      {result.groundednessWarning && (
                        <p className="text-xs mt-1" style={{ color: dc.text, opacity: 0.85 }}>
                          Some content could not be fully verified against your organisation's documentation library. Review carefully before submitting.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Document content */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {DOCUMENT_TYPES.find(t => t.value === docType)?.label ?? docType}
                  </p>
                  <button
                    onClick={copyContent}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600"
                  >
                    <FontAwesomeIcon icon={copied ? faCheck : faCopy} style={{ fontSize: 11 }} />
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div
                  className="rounded-xl border border-gray-200 px-5 py-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed"
                  style={{ background: '#FAFBFC', fontFamily: 'inherit', maxHeight: 340, overflowY: 'auto' }}
                >
                  {result.content}
                </div>
              </div>

              {/* Detector findings disclosure */}
              {matchedFindings.length > 0 && (
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setShowFindings(!showFindings)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <FontAwesomeIcon icon={faShieldAlt} style={{ color: '#7C3AED', fontSize: 12 }} />
                      <span className="font-medium text-gray-700">
                        Compliance details — {matchedFindings.length} detector{matchedFindings.length !== 1 ? 's' : ''} triggered
                      </span>
                    </div>
                    <FontAwesomeIcon
                      icon={showFindings ? faChevronUp : faChevronDown}
                      style={{ color: '#9CA3AF', fontSize: 11 }}
                    />
                  </button>

                  {showFindings && (
                    <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-2">
                      <p className="text-xs text-gray-400 mb-3">
                        These detectors ran on the AI response before delivery.
                        No content is shown — only category metadata.
                      </p>
                      {matchedFindings.map((f, i) => (
                        <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                            <span className="text-sm text-gray-700">
                              {DETECTOR_LABELS[f.detector] ?? f.detector}
                            </span>
                            {f.category && (
                              <span className="text-xs text-gray-400">· {f.category}</span>
                            )}
                          </div>
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full"
                            style={{
                              background: f.confidence === 'HIGH' ? '#EEF4FF' : '#F3F4F6',
                              color:      f.confidence === 'HIGH' ? '#1E88FF' : '#6B7280',
                            }}
                          >
                            {f.confidence}
                          </span>
                        </div>
                      ))}

                      {result.redactionMetadata && result.redactionMetadata.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <p className="text-xs font-medium text-gray-500 mb-2">Redacted positions</p>
                          <div className="flex flex-wrap gap-2">
                            {result.redactionMetadata.map((m, i) => (
                              <span key={i} className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded">
                                {m.category} · pos {m.position}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <p className="text-xs text-gray-400 pt-2">
                        Content ID: <span className="font-mono">{result.contentId}</span>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
          {result ? (
            <>
              <button
                onClick={() => { setResult(null); setError(null); }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Generate another
              </button>
              <button
                onClick={onClose}
                className="px-5 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: '#1E88FF' }}
              >
                Done
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
                Cancel
              </button>
              <button
                onClick={generate}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all"
                style={{ background: loading ? '#93C5FD' : '#1E88FF', cursor: loading ? 'not-allowed' : 'pointer' }}
              >
                {loading
                  ? <><FontAwesomeIcon icon={faSpinner} spin style={{ fontSize: 13 }} /> Generating…</>
                  : <><FontAwesomeIcon icon={faRobot} style={{ fontSize: 13 }} /> Generate</>
                }
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
