import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleQuestion } from '@fortawesome/free-solid-svg-icons';
import { faTimes, faBookOpen } from '@fortawesome/free-solid-svg-icons';

type Block = { h?: string; p?: string; ul?: string[] };
interface Topic { id: string; title: string; blocks: Block[] }

const HELP_TOPICS: Topic[] = [
  {
    id: 'getting-started', title: 'Getting Started',
    blocks: [
      { p: 'myABA.ai helps your agency draft and manage ABA clinical documentation with an AI assistant, governed by HIPAA-aware compliance safeguards.' },
      { h: 'Finding your way around' },
      { ul: [
        'The left sidebar switches between Chat, Clients, Projects, Resources, Review, Team, and Settings.',
        'Your profile and sign-out live in the top-right corner.',
        'The bell shows notifications and announcements; the question mark opens this help.',
      ]},
      { h: 'Before you can use clinical features' },
      { p: 'A Practice Administrator must sign the Business Associate Agreement (BAA) in Settings → Compliance before client records and clinical chat unlock.' },
    ],
  },
  {
    id: 'chat-docs', title: 'Chat & Document Generation',
    blocks: [
      { p: 'Open Chat from the sidebar and ask the assistant to draft notes, plans, and assessments.' },
      { h: 'Generating Word & Excel documents' },
      { ul: [
        'Ask the assistant to "write" or "generate" a document (e.g. "Draft a BIP for elopement behavior").',
        'On the response, click Word to download a .docx, or Excel for a spreadsheet.',
        'Only the document itself is exported — the conversational wrapper is left out.',
        'For a spreadsheet, ask for a table (e.g. "give me an Excel of these goals and their status").',
      ]},
      { h: 'Using your templates' },
      { p: 'Ask "what templates are available?" to see the document types you can generate. Customize them in Resources → Templates.' },
    ],
  },
  {
    id: 'library', title: 'Templates, Policies, Grounding & Library',
    blocks: [
      { p: 'The Resources area has four separate buckets — each can be used in any chat:' },
      { ul: [
        'Templates — the document types your team generates (BIP, FBA, etc.). Starter templates are provided; add or customize your own.',
        'Policies — your agency\'s rules, SOPs, and handbooks.',
        'Grounding — trusted sources the AI is checked against to prevent hallucinations.',
        'Agency Library — reference materials (PDFs, links, knowledge references) the AI can draw from.',
      ]},
      { h: 'Hiding a starter template' },
      { p: 'In Templates → Starter, use Hide to remove a built-in type from the client Generate Document pulldown; Restore brings it back.' },
      { h: 'Linking cloud folders' },
      { p: 'Use the dropdown on the Add button to link a Google Drive or OneDrive folder into any tab.' },
    ],
  },
  {
    id: 'clients', title: 'Clients & Authorizations',
    blocks: [
      { p: 'Manage client records under Clients in the sidebar (requires a signed BAA).' },
      { ul: [
        'Add clients and their treatment team (supervisors and behavior technicians).',
        'Attach authorization documents on the Authorizations tab.',
        'Connect documents and chats specific to a client from their record.',
      ]},
      { p: 'Some sensitive categories require explicit written authorization before the AI will process that client\'s data.' },
    ],
  },
  {
    id: 'roles', title: 'Roles & Permissions',
    blocks: [
      { p: 'myABA uses five roles:' },
      { ul: [
        'Practice Administrator — agency owner / super admin; signs the BAA; full access.',
        'Clinical Director — clinical lead with full PHI and library access.',
        'Clinical Supervisor — clinical work; library access can be toggled on.',
        'Behavior Technician — projects and chat; no client management.',
        'General Staff — restricted, non-HIPAA; no access to patient data.',
      ]},
      { p: 'Admins rename roles and adjust the permission matrix in Settings → Roles & Permissions.' },
    ],
  },
  {
    id: 'compliance', title: 'Compliance & Safeguards',
    blocks: [
      { p: 'Every AI response passes through compliance safeguards (the ACLX governance layer) before you see it.' },
      { h: 'If a response is held' },
      { p: 'A "Held by compliance safeguards" note means the content was withheld as a precaution — often a configuration or minimum-necessary nuance rather than a true violation. Try rephrasing, or ask an admin to review the settings.' },
      { h: 'Review tab' },
      { p: 'Admins can see flagged items, the audit log, and compliance insights under Review.' },
    ],
  },
  {
    id: 'notifications', title: 'Notifications & Announcements',
    blocks: [
      { p: 'The bell in the top-right shows system messages and event notifications.' },
      { ul: [
        'A red badge shows how many are unread; click an item to mark it read, or "Mark all read".',
        'Administrators can send an announcement to the whole team from the bell panel.',
      ]},
    ],
  },
];

export default function HelpMenu() {
  const [open, setOpen]   = useState(false);
  const [topicId, setTopic] = useState(HELP_TOPICS[0].id);
  const topic = HELP_TOPICS.find((t) => t.id === topicId) ?? HELP_TOPICS[0];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Help"
        style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', color: '#52616B' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <FontAwesomeIcon icon={faCircleQuestion} style={{ fontSize: 16 }} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex overflow-hidden" style={{ height: '80vh' }} onClick={(e) => e.stopPropagation()}>
            {/* Topic list */}
            <div style={{ width: 220, borderRight: '1px solid #EEF2F6', background: '#FAFCFE', overflowY: 'auto' }}>
              <div style={{ padding: '16px 16px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <FontAwesomeIcon icon={faBookOpen} style={{ color: '#1E88FF', fontSize: 14 }} />
                <span style={{ fontWeight: 700, color: '#1E3347', fontSize: 14 }}>Help Center</span>
              </div>
              {HELP_TOPICS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTopic(t.id)}
                  style={{
                    width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                    padding: '9px 16px', fontSize: 13.5,
                    background: t.id === topicId ? '#EEF4FF' : 'transparent',
                    color: t.id === topicId ? '#1E88FF' : '#52616B',
                    fontWeight: t.id === topicId ? 600 : 500,
                    borderLeft: t.id === topicId ? '3px solid #1E88FF' : '3px solid transparent',
                  }}
                >
                  {t.title}
                </button>
              ))}
            </div>

            {/* Content */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #F0F4F8' }}>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#1E3347', margin: 0 }}>{topic.title}</h2>
                <button onClick={() => setOpen(false)} style={{ border: 'none', background: 'none', color: '#9AA7B2', cursor: 'pointer', fontSize: 16 }}><FontAwesomeIcon icon={faTimes} /></button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', color: '#33475B', lineHeight: 1.65, fontSize: 14 }}>
                {topic.blocks.map((b, i) => (
                  <div key={i} style={{ marginBottom: 14 }}>
                    {b.h && <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E3347', margin: '6px 0 6px' }}>{b.h}</h3>}
                    {b.p && <p style={{ margin: 0 }}>{b.p}</p>}
                    {b.ul && (
                      <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                        {b.ul.map((li, j) => <li key={j} style={{ marginBottom: 4 }}>{li}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
                <p style={{ marginTop: 24, paddingTop: 14, borderTop: '1px solid #F0F4F8', fontSize: 12.5, color: '#9AA7B2' }}>
                  Need more help? Contact your Practice Administrator or reach out to myABA support.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
