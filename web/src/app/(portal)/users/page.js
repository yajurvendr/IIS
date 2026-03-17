'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import DataTable from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import api from '@/lib/api';
import { getRole } from '@/lib/auth';
import { formatDate } from '@/lib/formatters';

const ROLES = ['tenant_admin', 'tenant_user'];

const ROLE_BADGE = {
  tenant_admin: { label: 'Admin', color: 'var(--color-primary-light)', bg: 'rgba(99,102,241,0.1)' },
  tenant_user:  { label: 'User',  color: 'var(--color-text-muted)',    bg: 'rgba(0,0,0,0.05)' },
};

function RoleBadge({ role }) {
  const b = ROLE_BADGE[role] || { label: role, color: '#555', bg: '#eee' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 12,
      fontSize: 11, fontWeight: 600, color: b.color, background: b.bg,
    }}>{b.label}</span>
  );
}

export default function UsersPage() {
  const currentRole = getRole();
  const isAdmin = currentRole === 'tenant_admin';

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser]     = useState(null);
  const [resetUser, setResetUser]   = useState(null);
  const [deleteUser, setDeleteUser] = useState(null);

  // Create form
  const [form, setForm] = useState({ name: '', email: '', role: 'tenant_user', password: '' });
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit form
  const [editForm, setEditForm] = useState({ name: '', role: 'tenant_user', is_active: true });
  const [editErr, setEditErr]   = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Reset form
  const [newPwd, setNewPwd]     = useState('');
  const [resetErr, setResetErr] = useState('');
  const [resetSaving, setResetSaving] = useState(false);

  // Delete
  const [deleting, setDeleting] = useState(false);
  const [delErr, setDelErr]     = useState('');

  function loadUsers() {
    setLoading(true);
    api.get('/users/')
      .then(r => setUsers(r.data.data || []))
      .catch(() => setError('Failed to load users'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadUsers(); }, []);

  // ── Create ─────────────────────────────────────────────────────────────────
  function openCreate() {
    setForm({ name: '', email: '', role: 'tenant_user', password: '' });
    setFormErr('');
    setCreateOpen(true);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setFormErr('Name, email, and password are required'); return;
    }
    setSaving(true); setFormErr('');
    try {
      await api.post('/users/', form);
      setCreateOpen(false);
      loadUsers();
    } catch (err) {
      setFormErr(err.response?.data?.detail || 'Failed to create user');
    } finally { setSaving(false); }
  }

  // ── Edit ───────────────────────────────────────────────────────────────────
  function openEdit(user) {
    setEditUser(user);
    setEditForm({ name: user.name, role: user.role, is_active: user.is_active });
    setEditErr('');
  }

  async function handleEdit(e) {
    e.preventDefault();
    if (!editForm.name.trim()) { setEditErr('Name is required'); return; }
    setEditSaving(true); setEditErr('');
    try {
      await api.patch(`/users/${editUser.id}`, editForm);
      setEditUser(null);
      loadUsers();
    } catch (err) {
      setEditErr(err.response?.data?.detail || 'Failed to update user');
    } finally { setEditSaving(false); }
  }

  // ── Reset Password ─────────────────────────────────────────────────────────
  function openReset(user) {
    setResetUser(user);
    setNewPwd('');
    setResetErr('');
  }

  async function handleReset(e) {
    e.preventDefault();
    if (newPwd.length < 8) { setResetErr('Password must be at least 8 characters'); return; }
    setResetSaving(true); setResetErr('');
    try {
      await api.post(`/users/${resetUser.id}/reset-password`, { new_password: newPwd });
      setResetUser(null);
    } catch (err) {
      setResetErr(err.response?.data?.detail || 'Failed to reset password');
    } finally { setResetSaving(false); }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  function openDelete(user) {
    setDeleteUser(user);
    setDelErr('');
  }

  async function handleDelete() {
    setDeleting(true); setDelErr('');
    try {
      await api.delete(`/users/${deleteUser.id}`);
      setDeleteUser(null);
      loadUsers();
    } catch (err) {
      setDelErr(err.response?.data?.detail || 'Failed to remove user');
    } finally { setDeleting(false); }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <Topbar
        title="User Management"
      />

      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, gap: 8 }}>
          <button className="btn btn-primary" onClick={openCreate}>+ Add User</button>
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', background: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: 8, color: '#C53030', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {!isAdmin && (
        <div style={{ padding: '12px 16px', background: '#FFFBEB', border: '1px solid #F6E05E', borderRadius: 8, color: '#744210', marginBottom: 16, fontSize: 13 }}>
          You have view-only access. Contact your admin to manage users.
        </div>
      )}

      <DataTable
          loading={loading}
          emptyText="No users found"
          columns={[
            { key: 'name',       label: 'Name',   render: (v, row) => (
              <div>
                <div style={{ fontWeight: 600 }}>{v}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{row.email}</div>
              </div>
            )},
            { key: 'role',       label: 'Role',     width: 110, render: v => <RoleBadge role={v} /> },
            { key: 'is_active',  label: 'Status',   width: 90,  render: v => (
              <span style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                fontSize: 11, fontWeight: 600,
                color: v ? 'var(--color-green)' : 'var(--color-text-muted)',
                background: v ? 'rgba(72,187,120,0.1)' : 'rgba(0,0,0,0.05)',
              }}>{v ? 'Active' : 'Inactive'}</span>
            )},
            { key: 'created_at', label: 'Created',  width: 120, render: v => formatDate(v) },
            { key: 'last_login', label: 'Last Login',width: 130, render: v => v ? formatDate(v) : <span style={{ color: 'var(--color-text-muted)' }}>Never</span> },
            { key: '_actions',   label: '',          width: isAdmin ? 160 : 0, render: (_, row) => isAdmin ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => openEdit(row)}>Edit</button>
                <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => openReset(row)}>Reset Pwd</button>
                <button
                  style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #FEB2B2', background: '#FFF5F5', color: '#C53030', cursor: 'pointer' }}
                  onClick={() => openDelete(row)}
                >Remove</button>
              </div>
            ) : null },
          ]}
          data={users}
        />

      {/* ── Create Modal ──────────────────────────────────────────────────────── */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add New User">
        <form onSubmit={handleCreate}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="form-label">Full Name *</label>
              <input className="form-input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="John Doe" required />
            </div>
            <div>
              <label className="form-label">Email *</label>
              <input className="form-input" type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="john@example.com" required />
            </div>
            <div>
              <label className="form-label">Role</label>
              <select className="form-select" value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))}>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_BADGE[r]?.label || r}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Password *</label>
              <input className="form-input" type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} placeholder="Min 8 characters" required />
            </div>
            {formErr && <div style={{ color: '#C53030', fontSize: 13 }}>{formErr}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create User'}</button>
            </div>
          </div>
        </form>
      </Modal>

      {/* ── Edit Modal ────────────────────────────────────────────────────────── */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`Edit User — ${editUser?.name}`}>
        <form onSubmit={handleEdit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="form-label">Full Name *</label>
              <input className="form-input" value={editForm.name} onChange={e => setEditForm(f => ({...f, name: e.target.value}))} required />
            </div>
            <div>
              <label className="form-label">Role</label>
              <select className="form-select" value={editForm.role} onChange={e => setEditForm(f => ({...f, role: e.target.value}))}>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_BADGE[r]?.label || r}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="is_active" checked={editForm.is_active} onChange={e => setEditForm(f => ({...f, is_active: e.target.checked}))} />
              <label htmlFor="is_active" style={{ fontSize: 13, cursor: 'pointer' }}>Active (user can log in)</label>
            </div>
            {editErr && <div style={{ color: '#C53030', fontSize: 13 }}>{editErr}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditUser(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={editSaving}>{editSaving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </div>
        </form>
      </Modal>

      {/* ── Reset Password Modal ──────────────────────────────────────────────── */}
      <Modal open={!!resetUser} onClose={() => setResetUser(null)} title={`Reset Password — ${resetUser?.name}`}>
        <form onSubmit={handleReset}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
              Set a new password for <strong>{resetUser?.email}</strong>. The user should change it on next login.
            </p>
            <div>
              <label className="form-label">New Password *</label>
              <input className="form-input" type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Min 8 characters" required />
            </div>
            {resetErr && <div style={{ color: '#C53030', fontSize: 13 }}>{resetErr}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setResetUser(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={resetSaving}>{resetSaving ? 'Resetting…' : 'Reset Password'}</button>
            </div>
          </div>
        </form>
      </Modal>

      {/* ── Delete Confirm Modal ──────────────────────────────────────────────── */}
      <Modal open={!!deleteUser} onClose={() => setDeleteUser(null)} title="Remove User">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 14, margin: 0 }}>
            Remove <strong>{deleteUser?.name}</strong> ({deleteUser?.email}) from this organisation?
            They will no longer be able to log in. This action can be undone by re-enabling the account.
          </p>
          {delErr && <div style={{ color: '#C53030', fontSize: 13 }}>{delErr}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setDeleteUser(null)}>Cancel</button>
            <button
              style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#E53E3E', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
              onClick={handleDelete} disabled={deleting}
            >{deleting ? 'Removing…' : 'Remove User'}</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
