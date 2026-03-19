'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import Modal from '@/components/ui/Modal';
import Pagination from '@/components/ui/Pagination';
import { useToast } from '@/components/ui/Toast';
import api from '@/lib/api';

export default function UsersPage() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [resetModal, setResetModal] = useState(null); // { tenantId, userId, name }
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  function load(p = 1) {
    setLoading(true);
    api.get('/admin/users', { params: { page: p, limit: 25, search } })
      .then(r => { setUsers(r.data.data); setTotal(r.data.total); })
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(1); setPage(1); }, [search]);
  useEffect(() => { if (page > 1) load(page); }, [page]);

  async function handleResetPassword() {
    if (!newPassword || newPassword.length < 8) return toast('Min 8 chars', 'error');
    setSaving(true);
    try {
      await api.post(`/admin/users/${resetModal.tenantId}/${resetModal.userId}/reset-password`, { new_password: newPassword });
      toast('Password reset', 'success');
      setResetModal(null);
      setNewPassword('');
    } catch (err) { toast(err.response?.data?.error || 'Failed', 'error'); }
    finally { setSaving(false); }
  }

  return (
    <>
      <Topbar title="All Users" />
      <div style={{ marginBottom: 14 }}>
        <input className="form-input" placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 300 }} />
      </div>
      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Role</th><th>Tenant</th>
                <th>Status</th><th>Last Login</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30 }}>Loading…</td></tr>
              ) : !users.length ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: 'var(--color-text-muted)' }}>No users</td></tr>
              ) : users.map(u => (
                <tr key={u.id}>
                  <td><strong>{u.name}</strong></td>
                  <td style={{ fontSize: 12 }}>{u.email}</td>
                  <td><span className="badge badge-blue">{u.role}</span></td>
                  <td style={{ fontSize: 12 }}>{u.tenant_name}</td>
                  <td>
                    <span className={`badge ${u.is_active ? 'badge-green' : 'badge-red'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('en-IN') : '—'}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => setResetModal({ tenantId: u.tenant_id, userId: u.id, name: u.name })}>
                      Reset Password
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={25} onChange={setPage} />
      </div>

      <Modal open={!!resetModal} onClose={() => setResetModal(null)} title={`Reset Password — ${resetModal?.name}`}>
        <div className="form-group">
          <label className="form-label">New Password (min 8 chars)</label>
          <input type="password" className="form-input" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={() => setResetModal(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={handleResetPassword} disabled={saving}>{saving ? 'Saving…' : 'Reset Password'}</button>
        </div>
      </Modal>
    </>
  );
}
