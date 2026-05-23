import { useState } from 'react';
import DocumentCard from '../components/DocumentCard';
import type { Template } from '../types';

const MOCK_TEMPLATES: Template[] = [];

export default function TemplatesView() {
  const [templates] = useState<Template[]>(MOCK_TEMPLATES);

  return (
    <div className="flex-1 flex flex-col">
      <div className="border-b border-gray-200 bg-white px-8 py-4">
        <button className="px-6 py-2 bg-white border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50 text-sm">
          + New Template
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto">
          {templates.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-lg">No templates yet</p>
              <p className="text-sm mt-1">Upload or create a template to get started</p>
            </div>
          ) : (
            templates.map((t) => (
              <DocumentCard
                key={t.id}
                title={t.title}
                source={t.source === 'system' ? 'System' : 'Uploaded'}
                lastAiReviewed={t.lastAiReviewedAt}
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
