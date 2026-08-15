import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLanguage, faTimes, faCheck, faDownload, faSpinner } from '@fortawesome/free-solid-svg-icons';

/** The one-shot translation payload returned by the translate endpoints. */
export interface TranslateResult {
  language: string;
  filename: string;
  mimeType: string;
  contentBase64: string;
  previewText: string;
}

/** Supported targets — request code → display label (mirrors the backend catalog). */
const TRANSLATE_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'es',    label: 'Spanish' },
  { code: 'ar',    label: 'Arabic' },
  { code: 'fr',    label: 'French' },
  { code: 'zh-CN', label: 'Chinese (Simplified)' },
  { code: 'de',    label: 'German' },
];

/**
 * Shared translate dialog for client documents and project knowledge documents.
 * The caller supplies {@link onTranslate} (bound to the right endpoint); the modal
 * owns the language picker, the busy/error state, the preview, and the base64 →
 * Blob download. Nothing is stored server-side — this is preview + download.
 */
export default function TranslateDocumentModal({ docName, onTranslate, onClose }: {
  docName: string;
  onTranslate: (language: string) => Promise<TranslateResult>;
  onClose: () => void;
}) {
  const [language, setLanguage] = useState('es');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<TranslateResult | null>(null);

  const runTranslate = async () => {
    setBusy(true);
    setError('');
    try {
      setResult(await onTranslate(language));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Translation failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // Decode the base64 payload into a Blob and trigger a browser download.
  const download = () => {
    if (!result) return;
    const bin = atob(result.contentBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: result.mimeType }));
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#EEF4FF' }}>
              <FontAwesomeIcon icon={faLanguage} style={{ color: '#1E88FF', fontSize: 16 }} />
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold text-gray-900">Translate document</p>
              <p className="text-xs text-gray-400 truncate">{docName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto">
          {!result ? (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-2">Translate into</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={busy}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {TRANSLATE_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-2">
                The original layout is preserved for Word and PDF files. Nothing is stored — the
                translation is generated for you to preview and download.
              </p>
              {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#DCFCE7', color: '#166534' }}>
                  <FontAwesomeIcon icon={faCheck} style={{ fontSize: 9 }} /> Translated to {result.language}
                </span>
              </div>
              {result.previewText ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-wrap max-h-72 overflow-y-auto">
                  {result.previewText}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Preview unavailable — download the file to view the translation.</p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result ? (
            <button
              type="button"
              onClick={runTranslate}
              disabled={busy}
              className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-60 flex items-center gap-2"
              style={{ background: '#1E88FF' }}
            >
              {busy && <FontAwesomeIcon icon={faSpinner} className="animate-spin" />}
              {busy ? 'Translating…' : 'Translate'}
            </button>
          ) : (
            <button
              type="button"
              onClick={download}
              className="px-4 py-2 text-sm font-semibold text-white rounded-lg flex items-center gap-2"
              style={{ background: '#1E88FF' }}
            >
              <FontAwesomeIcon icon={faDownload} /> Download
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
