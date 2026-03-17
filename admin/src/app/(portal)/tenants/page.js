'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import Modal from '@/components/ui/Modal';
import Pagination from '@/components/ui/Pagination';
import { useToast } from '@/components/ui/Toast';
import api from '@/lib/api';

const STATUS_BADGE = { active: 'badge-green', trial: 'badge-amber', suspended: 'badge-red', churned: 'badge-gray' };
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN') : '—';

export default function TenantsPage() {
  const toast = useToast();
  const [tenants, setTenants] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);

  // Create
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ business_name: '', slug: '', contact_email: '', contact_phone: '', admin_name: '', admin_email: '', admin_password: '', plan_id: '' });
  const [saving, setSaving] = useState(false);

  // View
  const [viewTenant, setViewTenant] = useState(null);
  const [viewAdminUser, setViewAdminUser] = useState(null);

  // Edit
  const [editTenant, setEditTenant] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [editAdminUser, setEditAdminUser] = useState(null);

  // Change Password
  const [pwTenant, setPwTenant] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  // Permanent Delete
  const [deleteTenant, setDeleteTenant] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  function load(p = 1) {
    setLoading(true);
    api.get('/admin/tenants', { params: { page: p, limit: 15, search, status: statusFilter } })
      .then(r => { setTenants(r.data.data); setTotal(r.data.total); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { api.get('/admin/plans').then(r => setPlans(r.data.data)).catch(() => {}); }, []);
  useEffect(() => { load(1); setPage(1); }, [search, statusFilter]);
  useEffect(() => { if (page > 1) load(page); }, [page]);

  async function handleCreate() {
    if (!form.business_name || !form.slug || !form.contact_email || !form.admin_email || !form.admin_password)
      return toast('Required fields missing', 'error');
    setSaving(true);
    try {
      await api.post('/admin/tenants', form);
      toast('Tenant provisioned!', 'success');
      setCreateOpen(false);
      setForm({ business_name: '', slug: '', contact_email: '', contact_phone: '', admin_name: '', admin_email: '', admin_password: '', plan_id: '' });
      load(1);
    } catch (err) { toast(err.response?.data?.detail || err.response?.data?.error || 'Failed', 'error'); }
    finally { setSaving(false); }
  }

  function openView(t) {
    setViewTenant(t);
    setViewAdminUser(null);
    api.get(`/admin/tenants/${t.id}/admin-user`).then(r => setViewAdminUser(r.data)).catch(() => {});
  }

  function openEdit(t) {
    setEditTenant(t);
    setEditAdminUser(null);
    setEditForm({
      business_name: t.business_name,
      contact_email: t.email || '',
      contact_phone: t.phone || '',
      plan_id: t.plan_id || '',
      status: t.status,
      trial_ends_at: t.trial_ends_at ? t.trial_ends_at.slice(0, 10) : '',
    });
    api.get(`/admin/tenants/${t.id}/admin-user`).then(r => setEditAdminUser(r.data)).catch(() => {});
  }

  async function handleEdit() {
    setEditSaving(true);
    try {
      await api.patch(`/admin/tenants/${editTenant.id}`, editForm);
      toast('Tenant updated', 'success');
      setEditTenant(null);
      load(page);
    } catch (err) { toast(err.response?.data?.detail || 'Failed', 'error'); }
    finally { setEditSaving(false); }
  }

  async function handleChangePassword() {
    if (newPassword.length < 8) return toast('Password must be at least 8 characters', 'error');
    setPwSaving(true);
    try {
      await api.post(`/admin/tenants/${pwTenant.id}/reset-admin-password`, { new_password: newPassword });
      toast('Admin password reset successfully', 'success');
      setPwTenant(null);
      setNewPassword('');
    } catch (err) { toast(err.response?.data?.detail || 'Failed', 'error'); }
    finally { setPwSaving(false); }
  }

  async function handleStatusChange(id, newStatus) {
    try {
      await api.patch(`/admin/tenants/${id}`, { status: newStatus });
      toast('Status updated', 'success');
      load(page);
    } catch (err) { toast(err.response?.data?.detail || 'Failed', 'error'); }
  }

  async function handleDelete(id) {
    if (!confirm('Churn this tenant? This sets status to churned.')) return;
    try {
      await api.delete(`/admin/tenants/${id}`);
      toast('Tenant churned', 'success');
      load(page);
    } catch (err) { toast(err.response?.data?.detail || 'Failed', 'error'); }
  }

  async function handlePermanentDelete() {
    if (deleteConfirm !== deleteTenant.business_name) return toast('Name does not match', 'error');
    setDeleting(true);
    try {
      await api.delete(`/admin/tenants/${deleteTenant.id}/permanent`);
      toast('Tenant permanently deleted', 'success');
      setDeleteTenant(null);
      setDeleteConfirm('');
      load(1);
    } catch (err) { toast(err.response?.data?.detail || 'Failed', 'error'); }
    finally { setDeleting(false); }
  }

  const fieldF = (key, label, placeholder, type = 'text', state, setState) => (
    <div className="form-group" key={key}>
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} placeholder={placeholder}
        value={state[key]} onChange={e => setState(p => ({ ...p, [key]: e.target.value }))} />
    </div>
  );

  return (
    <>
      <Topbar
        title="Tenant Management"
        actions={<button className="btn btn-primary" onClick={() => setCreateOpen(true)}>+ New Tenant</button>}
      />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <input className="form-input" placeholder="Search name or slug…" value={search}
          onChange={e => setSearch(e.target.value)} style={{ width: 240 }} />
        <select className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 140 }}>
          <option value="">All Status</option>
          {['active', 'trial', 'suspended', 'churned'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Business Name</th><th>Slug</th><th>Plan</th><th>Status</th>
                <th>Created</th><th>Last Login</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: 'var(--color-text-muted)' }}>Loading…</td></tr>
              ) : !tenants.length ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: 'var(--color-text-muted)' }}>No tenants found</td></tr>
              ) : tenants.map(t => (
                <tr key={t.id}>
                  <td><strong>{t.business_name}</strong></td>
                  <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t.slug}</td>
                  <td>{t.plan_name || '—'}</td>
                  <td><span className={`badge ${STATUS_BADGE[t.status] || 'badge-gray'}`}>{t.status}</span></td>
                  <td style={{ fontSize: 12 }}>{fmtDate(t.created_at)}</td>
                  <td style={{ fontSize: 12 }}>{fmtDate(t.last_login_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => openView(t)}>View</button>
                      <button className="btn btn-sm btn-secondary" onClick={() => openEdit(t)}>Edit</button>
                      <button className="btn btn-sm btn-secondary" onClick={() => { setPwTenant(t); setNewPassword(''); }}>Reset PW</button>
                      {t.status !== 'active'    && <button className="btn btn-sm btn-primary"   onClick={() => handleStatusChange(t.id, 'active')}>Activate</button>}
                      {t.status === 'active'    && <button className="btn btn-sm btn-secondary" onClick={() => handleStatusChange(t.id, 'suspended')}>Suspend</button>}
                      {t.status !== 'churned'   && <button className="btn btn-sm btn-danger"    onClick={() => handleDelete(t.id)}>Churn</button>}
                      <button className="btn btn-sm btn-danger" onClick={() => { setDeleteTenant(t); setDeleteConfirm(''); }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={15} onChange={setPage} />
      </div>

      {/* ── Create Modal ──────────────────────────────────── */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Provision New Tenant">
        {[
          { label: 'Business Name *', key: 'business_name', placeholder: 'ABC Auto Parts' },
          { label: 'Slug *', key: 'slug', placeholder: 'abc-auto-parts' },
          { label: 'Contact Email *', key: 'contact_email', placeholder: 'owner@abc.com' },
          { label: 'Contact Phone', key: 'contact_phone', placeholder: '+91 98765 43210' },
          { label: 'Admin Name', key: 'admin_name', placeholder: 'Admin User' },
          { label: 'Admin Email *', key: 'admin_email', placeholder: 'admin@abc.com' },
          { label: 'Admin Password *', key: 'admin_password', placeholder: 'Min 8 chars', type: 'password' },
        ].map(f => (
          <div className="form-group" key={f.key}>
            <label className="form-label">{f.label}</label>
            <input className="form-input" type={f.type || 'text'} placeholder={f.placeholder}
              value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
          </div>
        ))}
        <div className="form-group">
          <label className="form-label">Plan</label>
          <select className="form-input" value={form.plan_id} onChange={e => setForm(p => ({ ...p, plan_id: e.target.value }))}>
            <option value="">— Default (first available) —</option>
            {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
            {saving ? 'Provisioning…' : 'Create Tenant'}
          </button>
        </div>
      </Modal>

      {/* ── View Modal ────────────────────────────────────── */}
      <Modal open={!!viewTenant} onClose={() => setViewTenant(null)} title="Tenant Details">
        {viewTenant && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 28px' }}>
              {[
                ['Business Name', viewTenant.business_name],
                ['Slug', viewTenant.slug],
                ['Contact Email', viewTenant.email || '—'],
                ['Contact Phone', viewTenant.phone || '—'],
                ['Plan', viewTenant.plan_name || '—'],
                ['Status', viewTenant.status],
                ['DB Name', viewTenant.db_name],
                ['Trial Ends', fmtDate(viewTenant.trial_ends_at)],
                ['Created', fmtDate(viewTenant.created_at)],
                ['Last Login', fmtDate(viewTenant.last_login_at)],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, wordBreak: 'break-all' }}>{value}</div>
                </div>
              ))}
            </div>
            {/* Admin user info */}
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Admin Login</div>
              {viewAdminUser === null ? (
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Loading…</span>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 28px' }}>
                  {[
                    ['Admin Name', viewAdminUser.name || '—'],
                    ['Login Email', viewAdminUser.email || '—'],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, wordBreak: 'break-all' }}>{value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => { const t = viewTenant; setViewTenant(null); openEdit(t); }}>Edit</button>
              <button className="btn btn-primary" onClick={() => setViewTenant(null)}>Close</button>
            </div>
          </>
        )}
      </Modal>

      {/* ── Change Password Modal ─────────────────────────── */}
      <Modal open={!!pwTenant} onClose={() => setPwTenant(null)} title={`Reset Admin Password — ${pwTenant?.business_name || ''}`}>
        {pwTenant && (
          <>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 14 }}>
              This will reset the password for the tenant admin user of <strong>{pwTenant.business_name}</strong>.
            </p>
            <div className="form-group">
              <label className="form-label">New Password *</label>
              <input className="form-input" type="password" placeholder="Min 8 characters"
                value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setPwTenant(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleChangePassword} disabled={pwSaving}>
                {pwSaving ? 'Resetting…' : 'Reset Password'}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* ── Edit Modal ────────────────────────────────────── */}
      <Modal open={!!editTenant} onClose={() => setEditTenant(null)} title={`Edit — ${editTenant?.business_name || ''}`}>
        {editTenant && (
          <>
            {[
              { key: 'business_name', label: 'Business Name *', placeholder: 'ABC Auto Parts' },
              { key: 'contact_email', label: 'Contact Email', placeholder: 'owner@abc.com' },
              { key: 'contact_phone', label: 'Contact Phone', placeholder: '+91 98765 43210' },
            ].map(f => (
              <div className="form-group" key={f.key}>
                <label className="form-label">{f.label}</label>
                <input className="form-input" placeholder={f.placeholder}
                  value={editForm[f.key]} onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
            <div className="form-group">
              <label className="form-label">Plan</label>
              <select className="form-input" value={editForm.plan_id} onChange={e => setEditForm(p => ({ ...p, plan_id: e.target.value }))}>
                <option value="">— None —</option>
                {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-input" value={editForm.status} onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}>
                {['active', 'trial', 'suspended', 'churned'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Trial Ends At</label>
              <input className="form-input" type="date" value={editForm.trial_ends_at}
                onChange={e => setEditForm(p => ({ ...p, trial_ends_at: e.target.value }))} />
            </div>
            {/* Admin login (read-only) */}
            <div style={{ marginTop: 4, padding: '10px 12px', background: 'var(--color-bg-subtle, #f8f9fa)', borderRadius: 6, border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Admin Login (read-only)</div>
              {editAdminUser === null ? (
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Loading…</span>
              ) : (
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Name: </span><strong>{editAdminUser.name || '—'}</strong>
                  <span style={{ margin: '0 12px', color: 'var(--color-border)' }}>|</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>Login Email: </span><strong>{editAdminUser.email || '—'}</strong>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn btn-secondary" onClick={() => setEditTenant(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleEdit} disabled={editSaving}>
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* ── Permanent Delete Modal ────────────────────────── */}
      <Modal open={!!deleteTenant} onClose={() => setDeleteTenant(null)} title="Permanently Delete Tenant">
        {deleteTenant && (
          <>
            <div style={{ padding: '12px 14px', background: '#fff5f5', border: '1px solid #feb2b2', borderRadius: 6, marginBottom: 16 }}>
              <strong style={{ color: '#c53030' }}>⚠ This cannot be undone.</strong>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#742a2a' }}>
                This will permanently drop the database <code>{deleteTenant.db_name}</code> and delete all tenant data.
              </p>
            </div>
            <div className="form-group">
              <label className="form-label">Type <strong>{deleteTenant.business_name}</strong> to confirm</label>
              <input className="form-input" placeholder={deleteTenant.business_name}
                value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setDeleteTenant(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handlePermanentDelete} disabled={deleting || deleteConfirm !== deleteTenant.business_name}>
                {deleting ? 'Deleting…' : 'Delete Permanently'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
