'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

const TYPE_STYLE = {
  info:    { bg: '#EBF8FF', border: '#BEE3F8', text: '#2A4365', icon: 'ℹ️' },
  warning: { bg: '#FFFBEB', border: '#F6E05E', text: '#744210', icon: '⚠️' },
  success: { bg: '#F0FFF4', border: '#9AE6B4', text: '#276749', icon: '✅' },
  danger:  { bg: '#FFF5F5', border: '#FEB2B2', text: '#742A2A', icon: '🚨' },
};

export default function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState([]);
  const [dismissed, setDismissed] = useState(new Set());

  useEffect(() => {
    api.get('/admin/announcements/active')
      .then(r => setAnnouncements(r.data.data || []))
      .catch(() => {});
  }, []);

  const visible = announcements.filter(a => !dismissed.has(a.id));
  if (!visible.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
      {visible.map(a => {
        const style = TYPE_STYLE[a.type] || TYPE_STYLE.info;
        return (
          <div key={a.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '10px 14px',
            background: style.bg,
            border: `1px solid ${style.border}`,
            borderRadius: 8,
            color: style.text,
          }}>
            <span style={{ fontSize: 15, flexShrink: 0 }}>{style.icon}</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{a.title}</span>
              {a.body && (
                <span style={{ fontSize: 13, marginLeft: 6 }}>{a.body}</span>
              )}
            </div>
            <button
              onClick={() => setDismissed(s => new Set([...s, a.id]))}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: style.text, opacity: 0.6, fontSize: 16, lineHeight: 1,
                flexShrink: 0, padding: '0 2px',
              }}
              title="Dismiss"
            >×</button>
          </div>
        );
      })}
    </div>
  );
}
