'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import api from '@/lib/api';

export default function AnnouncementsPage() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', expires_at: '' });
  const [saving, setSaving] = useState(false);

  function load() { api.get('/admin/announcements').then(r => setItems(r.data.data)).finally(() => setLoading(false)); }
  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!form.title || !form.body) return toast('Title and body required', 'error');
    setSaving(true);
    try {
      await api.post('/admin/announcements', form);
      toast('Announcement created', 'success');
      setModalOpen(false);
      setForm({ title: '', body: '', expires_at: '' });
      load();
    } catch (err) { toast(err.response?.data?.error || 'Failed', 'error'); }
    finally { setSaving(false); }
  }

  return (
    <>
      <Topbar title="Announcements" actions={<button className="btn btn-primary" onClick={() => setModalOpen(true)}>+ New Announcement</button>} />
      <div style={{ maxWidth: 700 }}>
        {loading ? <div style={{ padding: 40, textAlign: 'center' }}>Loading…</div> : items.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>No announcements yet</div>
        ) : items.map(a => (
          <div key={a.id} className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{a.title}</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 8, whiteSpace: 'pre-wrap' }}>{a.body}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              Created: {new Date(a.created_at).toLocaleString('en-IN')}
              {a.expires_at && ` · Expires: ${new Date(a.expires_at).toLocaleDateString('en-IN')}`}
            </div>
          </div>
        ))}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Announcement">
        <div className="form-group">
          <label className="form-label">Title *</label>
          <input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Scheduled Maintenance" />
        </div>
        <div className="form-group">
          <label className="form-label">Body *</label>
          <textarea className="form-input" rows={4} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Announcement details…" />
        </div>
        <div className="form-group">
          <label className="form-label">Expires At (optional)</label>
          <input className="form-input" type="date" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>{saving ? 'Sending…' : 'Publish'}</button>
        </div>
      </Modal>
    </>
  );
}
