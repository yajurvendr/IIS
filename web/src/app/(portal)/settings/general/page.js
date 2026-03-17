'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import { useToast } from '@/components/ui/Toast';
import api from '@/lib/api';

export default function GeneralSettingsPage() {
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({ business_name: '', contact_email: '', contact_phone: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/settings').then(r => {
      setSettings(r.data);
      setForm({
        business_name: r.data.business_name || '',
        contact_email: r.data.contact_email || '',
        contact_phone: r.data.contact_phone || '',
      });
    }).finally(() => setLoading(false));
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch('/settings', form);
      toast('Settings updated', 'success');
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to save', 'error');
    } finally { setSaving(false); }
  }

  return (
    <>
      <Topbar title="General Settings" backHref="/settings" />

      <div className="card">
        <div style={{ marginBottom: 20 }}>
          <div className="card-title" style={{ marginBottom: 3 }}>Business Information</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Basic business information shown across the platform.
          </div>
        </div>

        {settings && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
            <span style={pill(statusColor(settings.status))}>{settings.status}</span>
            <span style={pill('#3B82F6')}>{settings.plan_id || 'Starter'}</span>
            {settings.trial_ends_at && (
              <span style={pill('#F59E0B')}>
                Trial ends {new Date(settings.trial_ends_at).toLocaleDateString('en-IN')}
              </span>
            )}
          </div>
        )}

        {loading ? (
          <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</div>
        ) : (
          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Business Name</label>
                <input className="form-input" value={form.business_name}
                  onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Contact Email</label>
                <input className="form-input" type="email" value={form.contact_email}
                  onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Contact Phone</label>
                <input className="form-input" value={form.contact_phone}
                  onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: 120 }}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </form>
        )}
      </div>
    </>
  );
}

function pill(color) {
  return {
    display: 'inline-flex', alignItems: 'center',
    background: color + '18', color,
    border: `1px solid ${color}30`,
    borderRadius: 20, padding: '3px 10px',
    fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
    whiteSpace: 'nowrap',
  };
}
function statusColor(s) {
  if (s === 'active') return '#10B981';
  if (s === 'trial')  return '#F59E0B';
  return '#64748B';
}
