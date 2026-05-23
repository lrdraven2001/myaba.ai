import { useState } from 'react';
import type { Client } from '../types';

type ClientTab = 'info' | 'ai_data' | 'treatment_team' | 'ehr';

const TABS: { key: ClientTab; label: string }[] = [
  { key: 'info', label: 'Client Information' },
  { key: 'ai_data', label: 'Connected AI Data' },
  { key: 'treatment_team', label: 'Treatment Team' },
  { key: 'ehr', label: 'EHR Connect' },
];

const EMPTY_CLIENT: Omit<Client, 'id' | 'organizationId' | 'createdAt'> = {
  legalName: '',
  preferredName: '',
  dateOfBirth: '',
  gender: '',
  diagnosis: '',
  primaryInsurance: '',
  ehrProvider: '',
  ehrCaseId: '',
};

export default function ClientsView() {
  const [activeTab, setActiveTab] = useState<ClientTab>('info');
  const [selectedClient] = useState<Client | null>(null);
  const [form, setForm] = useState(EMPTY_CLIENT);

  const handleFormChange = (field: keyof typeof EMPTY_CLIENT, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const labelClass = 'block font-semibold text-gray-700 mb-2 text-sm';
  const inputClass = 'w-full border-2 border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:border-teal-400 text-sm';

  return (
    <div className="flex-1 flex flex-col">
      {/* Top bar */}
      <div className="border-b border-gray-200 bg-white px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button className="text-gray-600 hover:text-gray-900 font-semibold">Clients</button>
          <button className="ml-8 px-6 py-2 bg-white border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50 text-sm">
            + New Client
          </button>
        </div>
        <div className="flex items-center gap-2 text-gray-600 text-sm">
          <span className="font-semibold">Org Name</span>
          <span>›</span>
          <span className="font-semibold">
            {selectedClient ? selectedClient.preferredName || selectedClient.legalName : 'Select Client'}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-6xl mx-auto">
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

          {activeTab === 'info' && (
            <>
              <div className="grid grid-cols-2 gap-8">
                {/* Left */}
                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Legal Name</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={form.legalName}
                      onChange={(e) => handleFormChange('legalName', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Client Preferred Name</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={form.preferredName}
                      onChange={(e) => handleFormChange('preferredName', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Date of Birth</label>
                    <input
                      type="date"
                      className={inputClass}
                      value={form.dateOfBirth}
                      onChange={(e) => handleFormChange('dateOfBirth', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Gender</label>
                    <select
                      className={inputClass}
                      value={form.gender}
                      onChange={(e) => handleFormChange('gender', e.target.value)}
                    >
                      <option value="">Select Gender</option>
                      <option>Male</option>
                      <option>Female</option>
                      <option>Non-binary</option>
                      <option>Prefer not to say</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Primary Insurance</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={form.primaryInsurance}
                      onChange={(e) => handleFormChange('primaryInsurance', e.target.value)}
                    />
                  </div>
                </div>

                {/* Right: EHR */}
                <div className="space-y-4">
                  <h3 className="font-bold text-gray-800 text-lg">Linked EHR Information</h3>
                  <div>
                    <label className={labelClass}>EHR Provider</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={form.ehrProvider}
                      onChange={(e) => handleFormChange('ehrProvider', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Case ID #</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={form.ehrCaseId}
                      onChange={(e) => handleFormChange('ehrCaseId', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Last Updated</label>
                    <input type="text" className={inputClass} readOnly value="" />
                  </div>
                </div>
              </div>

              {/* Document sections */}
              <div className="mt-8 space-y-6">
                {['Intake Document(s)', 'Assessment Document(s)', 'Doctor Document(s)', 'Additional Document(s)'].map(
                  (section) => (
                    <div key={section}>
                      <h3 className="font-bold text-gray-700 mb-4 pb-2 border-b-2 border-gray-300">
                        {section}
                      </h3>
                      <div className="text-sm text-gray-400 py-4 text-center">
                        No documents uploaded yet.{' '}
                        <button className="text-teal-700 underline">Upload</button>
                      </div>
                    </div>
                  )
                )}
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  className="px-8 py-2 rounded-lg font-semibold text-white text-sm"
                  style={{ background: '#2a5f6f' }}
                >
                  Save Client
                </button>
                <button className="px-8 py-2 bg-white border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50 text-sm">
                  Cancel
                </button>
              </div>
            </>
          )}

          {activeTab === 'ai_data' && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-lg">No AI data connected</p>
              <p className="text-sm mt-1">Upload client documents to enable AI analysis</p>
            </div>
          )}

          {activeTab === 'treatment_team' && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-lg">No team members assigned</p>
              <p className="text-sm mt-1">Add BCBAs and RBTs to this client's treatment team</p>
            </div>
          )}

          {activeTab === 'ehr' && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-lg">No EHR connected</p>
              <p className="text-sm mt-1">Connect an EHR provider to sync client data automatically</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
