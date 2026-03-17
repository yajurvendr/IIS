'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import api from '@/lib/api';

const TEMPLATE_TYPES = ['custom', 'payment_reminder', 'invoice', 'order_confirmation'];

export default function WhatsappTemplatesPage() {
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', template_type: 'custom', message_body: '' });
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    api.get('/settings/whatsapp-templates').then(r => setTemplates(r.data.data)).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    if (!form.name || !form.message_body) return toast('Name and message required', 'error');
    setSaving(true);
    try {
      await api.post('/settings/whatsapp-templates', form);
      toast('Template saved', 'success');
      setModalOpen(false);
      setForm({ name: '', template_type: 'custom', message_body: '' });
      load();
    } catch (err) { toast(err.response?.data?.error || 'Failed', 'error'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this template?')) return;
    await api.delete(`/settings/whatsapp-templates/${id}`);
    toast('Template deleted', 'success');
    load();
  }

  return (
    <>
      <Topbar
        title="WhatsApp Templates"
        backHref="/settings"
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, gap: 8 }}>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>+ New Template</button>
      </div>

      <div style={{ maxWidth: 720 }}>
        {loading ? <div style={{ padding: 40, textAlign: 'center' }}>Loading…</div> : templates.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>
            No templates yet. Create one to get started.
          </div>
        ) : templates.map(t => (
          <div key={t.id} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{t.name}</div>
                <span className="badge badge-blue" style={{ marginBottom: 10 }}>{t.template_type}</span>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(t.id)}>Delete</button>
            </div>
            <div style={{
              padding: '12px 14px', borderRadius: 8, background: '#DCF8C6',
              fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap',
              border: '1px solid #c3e6a8', marginTop: 8,
            }}>
              {t.message_body}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 8 }}>
              Variables: {(() => {
                try {
                  const vars = typeof t.variables === 'string' ? JSON.parse(t.variables || '[]') : (t.variables || []);
                  return vars.length ? vars.map(v => <code key={v} style={{ marginRight: 4 }}>{`{${v}}`}</code>) : 'None';
                } catch { return 'None'; }
              })()}
            </div>
          </div>
        ))}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New WhatsApp Template">
        <div className="form-group">
          <label className="form-label">Template Name</label>
          <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Payment Reminder" />
        </div>
        <div className="form-group">
          <label className="form-label">Type</label>
          <select className="form-input form-select" value={form.template_type} onChange={e => setForm(f => ({ ...f, template_type: e.target.value }))}>
            {TEMPLATE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Message Body</label>
          <textarea className="form-input" rows={5} value={form.message_body}
            onChange={e => setForm(f => ({ ...f, message_body: e.target.value }))}
            placeholder="Hi {customer_name}, your outstanding balance of {amount} is due on {due_date}. Please arrange payment. - {business_name}" />
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
            Use {'{variable_name}'} for dynamic values
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Template'}</button>
        </div>
      </Modal>
    </>
  );
}
