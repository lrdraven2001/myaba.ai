import { useState, useEffect, useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell, faCheckDouble, faPaperPlane, faTimes, faCircle } from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { isAdminRole } from '../types';

interface Note {
  id: string; title: string; body?: string; level?: string; type?: string;
  link?: string; read?: boolean; createdAt?: string;
}

const LEVEL_COLOR: Record<string, string> = {
  info: '#1E88FF', success: '#3F9B2F', warning: '#D97706', alert: '#DC2626',
};

function relTime(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function NotificationBell() {
  const { currentUser } = useAuth();
  const orgId = currentUser?.orgId ?? '';
  const isAdmin = currentUser ? isAdminRole(currentUser.role) : false;

  const [open, setOpen]       = useState(false);
  const [items, setItems]     = useState<Note[]>([]);
  const [unread, setUnread]   = useState(0);
  const [compose, setCompose] = useState(false);
  const [cTitle, setCTitle]   = useState('');
  const [cBody, setCBody]     = useState('');
  const [cLevel, setCLevel]   = useState('info');
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api.getNotifications()
      .then((r) => { setItems(r.items ?? []); setUnread(r.unread ?? 0); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000); // light poll so new system messages appear
    return () => clearInterval(t);
  }, [load]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const openPanel = () => { setOpen((o) => !o); if (!open) load(); };

  const markRead = (n: Note) => {
    if (n.read) return;
    api.markNotificationRead(n.id).catch(() => {});
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
  };
  const markAll = () => {
    api.markAllNotificationsRead().catch(() => {});
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(0);
  };

  const send = async () => {
    if (!cTitle.trim()) return;
    setSending(true);
    try {
      await api.broadcastNotification(orgId, { title: cTitle.trim(), body: cBody.trim(), level: cLevel });
      setCTitle(''); setCBody(''); setCompose(false);
      load();
    } catch { /* ignore */ } finally { setSending(false); }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={openPanel}
        title="Notifications"
        style={{
          position: 'relative', width: 36, height: 36, borderRadius: '50%', border: 'none',
          background: open ? '#EEF4FF' : 'transparent', cursor: 'pointer', color: '#52616B',
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = '#f3f4f6'; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = 'transparent'; }}
      >
        <FontAwesomeIcon icon={faBell} style={{ fontSize: 16 }} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, padding: '0 4px',
            borderRadius: 8, background: '#DC2626', color: 'white', fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
          }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 44, right: 0, width: 360, maxHeight: 460, overflow: 'hidden',
          background: 'white', borderRadius: 14, boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
          border: '1px solid #E5EAF0', zIndex: 60, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #F0F4F8' }}>
            <span style={{ fontWeight: 600, color: '#1E3347', fontSize: 14 }}>Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} style={{ border: 'none', background: 'none', color: '#1E88FF', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <FontAwesomeIcon icon={faCheckDouble} style={{ fontSize: 11 }} /> Mark all read
              </button>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {items.length === 0 ? (
              <div style={{ padding: '36px 16px', textAlign: 'center', color: '#9AA7B2' }}>
                <FontAwesomeIcon icon={faBell} style={{ fontSize: 26, color: '#D6DEE6', marginBottom: 8 }} />
                <p style={{ fontSize: 13, margin: 0 }}>You're all caught up.</p>
              </div>
            ) : items.map((n) => (
              <button
                key={n.id}
                onClick={() => markRead(n)}
                style={{
                  width: '100%', textAlign: 'left', display: 'flex', gap: 10, padding: '11px 16px',
                  border: 'none', borderBottom: '1px solid #F3F6F9', cursor: 'pointer',
                  background: n.read ? 'white' : '#F5F9FF',
                }}
              >
                <FontAwesomeIcon icon={faCircle} style={{ fontSize: 8, marginTop: 5, color: LEVEL_COLOR[n.level ?? 'info'] ?? '#1E88FF', opacity: n.read ? 0.3 : 1 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: n.read ? 500 : 700, color: '#1E3347' }}>{n.title}</div>
                  {n.body && <div style={{ fontSize: 12.5, color: '#52616B', marginTop: 2, lineHeight: 1.4 }}>{n.body}</div>}
                  <div style={{ fontSize: 11, color: '#9AA7B2', marginTop: 3 }}>{relTime(n.createdAt)}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Admin: send announcement */}
          {isAdmin && (
            <div style={{ borderTop: '1px solid #F0F4F8', padding: '10px 14px' }}>
              {!compose ? (
                <button onClick={() => setCompose(true)} style={{ width: '100%', border: '1px dashed #C7D2DC', background: '#FAFCFE', borderRadius: 8, padding: '8px', color: '#1E88FF', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                  <FontAwesomeIcon icon={faPaperPlane} style={{ fontSize: 11 }} /> Send announcement to your team
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#52616B', textTransform: 'uppercase', letterSpacing: 0.4 }}>New Announcement</span>
                    <button onClick={() => setCompose(false)} style={{ border: 'none', background: 'none', color: '#9AA7B2', cursor: 'pointer' }}><FontAwesomeIcon icon={faTimes} /></button>
                  </div>
                  <input value={cTitle} onChange={(e) => setCTitle(e.target.value)} placeholder="Title" style={inp} />
                  <textarea value={cBody} onChange={(e) => setCBody(e.target.value)} placeholder="Message (optional)" rows={2} style={{ ...inp, resize: 'vertical' }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select value={cLevel} onChange={(e) => setCLevel(e.target.value)} style={{ ...inp, flex: 1 }}>
                      <option value="info">Info</option>
                      <option value="success">Success</option>
                      <option value="warning">Warning</option>
                      <option value="alert">Alert</option>
                    </select>
                    <button onClick={send} disabled={sending || !cTitle.trim()} style={{ flex: 1, border: 'none', borderRadius: 8, background: cTitle.trim() ? '#1E88FF' : '#9AA7B2', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      {sending ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = {
  width: '100%', border: '1px solid #DCE7EE', borderRadius: 8, padding: '7px 10px', fontSize: 13, outline: 'none',
};
