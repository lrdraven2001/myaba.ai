import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileAlt, faFolderOpen } from '@fortawesome/free-solid-svg-icons';
import PoliciesView from './PoliciesView';
import TemplatesView from './TemplatesView';
import type { DocumentTab } from '../App';

type DocTab = DocumentTab;

const TABS: { id: DocTab; label: string; icon: typeof faFileAlt }[] = [
  { id: 'resources', label: 'Resources', icon: faFileAlt    },
  { id: 'templates', label: 'Templates', icon: faFolderOpen },
];

export default function DocumentsView({ initialTab = 'resources' }: { initialTab?: DocTab }) {
  const [activeTab, setActiveTab] = useState<DocTab>(initialTab);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* ── Documents header with tab strip ────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-8 pt-4 flex items-end gap-0">
        <h1 className="text-lg font-semibold text-gray-900 mr-6 pb-3">Documents</h1>

        {TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex items-center gap-2 px-4 pb-3 text-sm font-medium transition-colors border-b-2"
            style={{
              borderBottomColor: activeTab === id ? '#2a5f6f' : 'transparent',
              color: activeTab === id ? '#2a5f6f' : '#6b7280',
            }}
          >
            <FontAwesomeIcon icon={icon} style={{ fontSize: 13 }} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab content ────────────────────────────────────────────────── */}
      {activeTab === 'resources' && <PoliciesView  embedded />}
      {activeTab === 'templates' && <TemplatesView embedded />}
    </div>
  );
}
