'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import { useToast } from '@/components/ui/Toast';
import api from '@/lib/api';

const EMPTY = { vendor_code: '', vendor_name: '', contact_name: '', phone: '', email: '', address: '' };

export default function VendorsPage() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState(null); // null | 'create' | 'edit'
  const [editVendor, setEditVendor] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  function load(p = page, s = search, inactive = includeInactive) {
    setLoading(true);
    api.get('/vendors', { params: { page: p, limit: 50, search: s, include_inactive: inactive } })
      .then(r => { setRows(r.data.data || []); setTotal(r.data.total || 0); })
      .catch(() => toast('Failed to load vendors', 'error'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(1, search, includeInactive); }, []);

  function openCreate() { setForm(EMPTY); setEditVendor(null); setModal('create'); }
  function openEdit(v) {
    setForm({ vendor_code: v.vendor_code || '', vendor_name: v.vendor_name || '', contact_name: v.contact_name || '', phone: v.phone || '', email: v.email || '', address: v.address || '' });
    setEditVendor(v);
    setModal('edit');
  }
  function closeModal() { setModal(null); setEditVendor(null); }

  async function handleSave() {
    if (!form.vendor_name.trim()) return toast('Vendor name is required', 'error');
    setSaving(true);
    try {
      if (modal === 'create') {
        await api.post('/vendors', form);
        toast('Vendor created', 'success');
      } else {
        await api.patch(`/vendors/${editVendor.id}`, form);
        toast('Vendor updated', 'success');
      }
      closeModal();
      load(1, search, includeInactive);
    } catch (err) {
      toast(err.response?.data?.detail || 'Save failed', 'error');
    } finally { setSaving(false); }
  }

  async function handleToggle(v) {
    try {
      await api.patch(`/vendors/${v.id}`, { is_active: !v.is_active });
      toast(v.is_active ? 'Vendor deactivated' : 'Vendor activated', 'success');
      load(page, search, includeInactive);
    } catch (err) {
      toast(err.response?.data?.detail || 'Failed', 'error');
    }
  }

  async function handleDelete(v) {
    if (!confirm(`Delete vendor "${v.vendor_name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/vendors/${v.id}`);
      toast('Vendor deleted', 'success');
      load(1, search, includeInactive);
    } catch (err) {
      toast(err.response?.data?.detail || 'Delete failed', 'error');
    }
  }

  function handleSearch(e) {
    e.preventDefault();
    setPage(1);
    load(1, search, includeInactive);
  }

  const PAGE_SIZE = 50;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <Topbar
        title="Vendor Management"
        backHref="/settings"
      />

      {/* Search bar */}
      <form onSubmit={handleSearch}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="form-input"
              placeholder="Search by name, code, or contact…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ maxWidth: 320 }}
            />
            <button type="submit" className="btn btn-secondary">Search</button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={includeInactive} onChange={e => { setIncludeInactive(e.target.checked); load(1, search, e.target.checked); }} />
              Show inactive
            </label>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{total} vendors</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button type="button" onClick={openCreate} className="btn btn-primary">+ Add Vendor</button>
          </div>
        </div>
      </form>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
              {['Code', 'Name', 'Contact', 'Phone', 'Email', 'Status', 'Actions'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-muted)' }}>No vendors found. Add your first vendor to get started.</td></tr>
            ) : rows.map((v, i) => (
              <tr key={v.id} style={{ borderBottom: '1px solid var(--color-border)', background: i % 2 === 1 ? 'var(--color-bg)' : '#fff', opacity: v.is_active ? 1 : 0.55 }}>
                <td style={{ padding: '10px 14px' }}>{v.vendor_code || '—'}</td>
                <td style={{ padding: '10px 14px', fontWeight: 500 }}>{v.vendor_name}</td>
                <td style={{ padding: '10px 14px', color: 'var(--color-text-muted)' }}>{v.contact_name || '—'}</td>
                <td style={{ padding: '10px 14px' }}>{v.phone || '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--color-text-muted)' }}>{v.email || '—'}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                    background: v.is_active ? '#F0FFF4' : '#FFF5F5',
                    color: v.is_active ? '#276749' : '#C53030',
                  }}>{v.is_active ? 'Active' : 'Inactive'}</span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => openEdit(v)} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }}>Edit</button>
                    <button onClick={() => handleToggle(v)} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }}>
                      {v.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    {!v.is_active && (
                      <button onClick={() => handleDelete(v)} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12, color: '#C53030' }}>Delete</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 16 }}>
          <button className="btn btn-secondary" disabled={page === 1} onClick={() => { setPage(p => p - 1); load(page - 1, search, includeInactive); }}>‹ Prev</button>
          <span style={{ lineHeight: '32px', fontSize: 13 }}>Page {page} of {totalPages}</span>
          <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => { setPage(p => p + 1); load(page + 1, search, includeInactive); }}>Next ›</button>
        </div>
      )}

      {/* Create/Edit Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="card-title" style={{ marginBottom: 20 }}>{modal === 'create' ? 'Add Vendor' : 'Edit Vendor'}</div>

            {[
              { key: 'vendor_name', label: 'Vendor Name *', placeholder: 'e.g. Bosch Auto Parts' },
              { key: 'vendor_code', label: 'Vendor Code', placeholder: 'e.g. BOSCH01' },
              { key: 'contact_name', label: 'Contact Person', placeholder: 'e.g. Rajesh Kumar' },
              { key: 'phone', label: 'Phone', placeholder: '+91 98765 43210' },
              { key: 'email', label: 'Email', placeholder: 'vendor@example.com' },
            ].map(({ key, label, placeholder }) => (
              <div key={key} className="form-group">
                <label className="form-label">{label}</label>
                <input
                  className="form-input"
                  value={form[key]}
                  placeholder={placeholder}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}

            <div className="form-group">
              <label className="form-label">Address</label>
              <textarea
                className="form-input"
                rows={3}
                value={form.address}
                placeholder="Full address…"
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                style={{ resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={closeModal} className="btn btn-secondary">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                {saving ? 'Saving…' : modal === 'create' ? 'Create Vendor' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
