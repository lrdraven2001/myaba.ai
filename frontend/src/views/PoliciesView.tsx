import { useState } from 'react';
import DocumentCard from '../components/DocumentCard';
import type { PolicyDocument } from '../types';

type PolicyTab = 'policy_manual' | 'sop' | 'handbook';

const TABS: { key: PolicyTab; label: string }[] = [
  { key: 'policy_manual', label: 'Policy Manual' },
  { key: 'sop', label: 'SOP(s)' },
  { key: 'handbook', label: 'Handbooks' },
];

// Placeholder data — will be replaced with Firestore queries
const MOCK_DOCS: Record<PolicyTab, PolicyDocument[]> = {
  policy_manual: [],
  sop: [],
  handbook: [],
};

export default function PoliciesView() {
  const [activeTab, setActiveTab] = useState<PolicyTab>('policy_manual');

  const docs = MOCK_DOCS[activeTab];

  return (
    <div className="flex-1 flex flex-col">
      <div className="border-b border-gray-200 bg-white px-8 py-4">
        <div className="flex items-center gap-4">
          <button className="text-gray-600 hover:text-gray-900 font-semibold">Policies</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto">
          {/* Tabs */}
          <div className="flex gap-2 border-b-2 border-gray-200 mb-6">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                className={`tab-button ${activeTab === key ? 'active' : ''}`}
                onClick={() => setActiveTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Upload button */}
          <div className="mb-6">
            <button className="px-6 py-2 bg-white border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50 text-sm">
              + Upload Document
            </button>
          </div>

          {/* Documents */}
          {docs.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-lg">No documents yet</p>
              <p className="text-sm mt-1">Upload a document to get started</p>
            </div>
          ) : (
            docs.map((doc) => (
              <DocumentCard
                key={doc.id}
                title={doc.title}
                source={doc.source === 'ehr' ? 'EHR Provider' : 'Uploaded'}
                lastAiReviewed={doc.lastAiReviewedAt}
                onAiReview={() => {}}
                onReplace={() => {}}
                onRemove={() => {}}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
