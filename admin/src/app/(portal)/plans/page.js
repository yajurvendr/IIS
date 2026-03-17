'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import api from '@/lib/api';

export default function PlansPage() {
  const toast = useToast();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', monthly_price: '', max_users: 5, max_skus: 1000 });
  const [saving, setSaving] = useState(false);

  function load() { api.get('/admin/plans').then(r => setPlans(r.data.data)).finally(() => setLoading(false)); }
  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!form.name) return toast('Name required', 'error');
    setSaving(true);
    try {
      await api.post('/admin/plans', { ...form, monthly_price: parseFloat(form.monthly_price) || 0, max_users: parseInt(form.max_users), max_skus: parseInt(form.max_skus) });
      toast('Plan created', 'success');
      setModalOpen(false);
      load();
    } catch (err) { toast(err.response?.data?.error || 'Failed', 'error'); }
    finally { setSaving(false); }
  }

  async function handleToggle(id, is_active) {
    await api.patch(`/admin/plans/${id}`, { is_active: is_active ? 0 : 1 });
    load();
  }

  return (
    <>
      <Topbar title="Subscription Plans" actions={<button className="btn btn-primary" onClick={() => setModalOpen(true)}>+ New Plan</button>} />
      <div style={{ maxWidth: 800 }}>
        {loading ? <div style={{ padding: 40, textAlign: 'center' }}>Loading…</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {plans.map(p => (
              <div key={p.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{p.name}</div>
                  <div style={{ display: 'flex', gap: 20, fontSize: 13, color: 'var(--color-text-muted)' }}>
                    <span>₹{parseFloat(p.monthly_price).toLocaleString('en-IN')}/mo</span>
                    <span>Up to {p.max_users} users</span>
                    <span>Up to {p.max_skus?.toLocaleString('en-IN')} SKUs</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className={`badge ${p.is_active ? 'badge-green' : 'badge-gray'}`}>{p.is_active ? 'Active' : 'Inactive'}</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleToggle(p.id, p.is_active)}>
                    {p.is_active ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Plan">
        {[
          { label: 'Plan Name *', key: 'name', placeholder: 'Pro' },
          { label: 'Monthly Price (₹)', key: 'monthly_price', placeholder: '4999', type: 'number' },
          { label: 'Max Users', key: 'max_users', placeholder: '10', type: 'number' },
          { label: 'Max SKUs', key: 'max_skus', placeholder: '5000', type: 'number' },
        ].map(f => (
          <div className="form-group" key={f.key}>
            <label className="form-label">{f.label}</label>
            <input className="form-input" type={f.type || 'text'} placeholder={f.placeholder}
              value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>{saving ? 'Saving…' : 'Create Plan'}</button>
        </div>
      </Modal>
    </>
  );
}
