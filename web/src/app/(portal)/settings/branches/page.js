'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import DataTable from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import api from '@/lib/api';
import { getRole } from '@/lib/auth';
import { formatDate } from '@/lib/formatters';

export default function BranchesPage() {
  const isAdmin = getRole() === 'tenant_admin';
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen]   = useState(false);
  const [editBranch, setEditBranch]   = useState(null);
  const [deleteBranch, setDeleteBranch] = useState(null);

  const EMPTY_FORM = { branch_code: '', branch_name: '', address: '' };
  const [form, setForm]     = useState(EMPTY_FORM);
  const [editForm, setEditForm] = useState({ branch_name: '', address: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr]       = useState('');

  function load() {
    setLoading(true);
    api.get('/branches/?include_inactive=true')
      .then(r => setBranches(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  // ── Create ────────────────────────────────────────────────────────────────
  function openCreate() { setForm(EMPTY_FORM); setErr(''); setCreateOpen(true); }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.branch_code.trim() || !form.branch_name.trim()) {
      setErr('Branch code and name are required'); return;
    }
    setSaving(true); setErr('');
    try {
      await api.post('/branches/', form);
      setCreateOpen(false);
      load();
    } catch (ex) { setErr(ex.response?.data?.detail || 'Failed'); }
    finally { setSaving(false); }
  }

  // ── Edit ──────────────────────────────────────────────────────────────────
  function openEdit(b) {
    setEditBranch(b);
    setEditForm({ branch_name: b.branch_name, address: b.address || '', is_active: b.is_active });
    setErr('');
  }

  async function handleEdit(e) {
    e.preventDefault();
    if (!editForm.branch_name.trim()) { setErr('Name is required'); return; }
    setSaving(true); setErr('');
    try {
      await api.patch(`/branches/${editBranch.id}`, editForm);
      setEditBranch(null);
      load();
    } catch (ex) { setErr(ex.response?.data?.detail || 'Failed'); }
    finally { setSaving(false); }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    setDeleting(true); setErr('');
    try {
      await api.delete(`/branches/${deleteBranch.id}`);
      setDeleteBranch(null);
      load();
    } catch (ex) { setErr(ex.response?.data?.detail || 'Failed'); }
    finally { setDeleting(false); }
  }

  return (
    <>
      <Topbar
        title="Branch Management"
        backHref="/settings"
        subtitle="Manage your business locations"
      />

      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, gap: 8 }}>
          <button className="btn btn-primary" onClick={openCreate}>+ Add Branch</button>
        </div>
      )}

      <DataTable
          loading={loading}
          emptyText="No branches found"
          columns={[
            { key: 'branch_code', label: 'Code', width: 100, render: v => (
              <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13 }}>{v}</span>
            )},
            { key: 'branch_name', label: 'Branch Name', render: (v, row) => (
              <div>
                <div style={{ fontWeight: 600 }}>{v}</div>
                {row.address && <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{row.address}</div>}
              </div>
            )},
            { key: 'is_home_branch', label: 'Type', width: 90, render: v => v ? (
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-primary)', background: 'rgba(99,102,241,0.1)', padding: '2px 8px', borderRadius: 12 }}>Home</span>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Branch</span>
            )},
            { key: 'is_active', label: 'Status', width: 90, render: v => (
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                color: v ? 'var(--color-green)' : 'var(--color-text-muted)',
                background: v ? 'rgba(72,187,120,0.1)' : 'rgba(0,0,0,0.05)',
              }}>{v ? 'Active' : 'Inactive'}</span>
            )},
            { key: 'created_at', label: 'Created', width: 120, render: v => formatDate(v) },
            { key: '_actions', label: '', width: isAdmin ? 140 : 0, render: (_, row) => isAdmin ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => openEdit(row)}>Edit</button>
                {!row.is_home_branch && (
                  <button
                    style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #FEB2B2', background: '#FFF5F5', color: '#C53030', cursor: 'pointer' }}
                    onClick={() => { setErr(''); setDeleteBranch(row); }}
                  >Delete</button>
                )}
              </div>
            ) : null },
          ]}
          data={branches}
        />

      {/* ── Create Modal ──────────────────────────────────────────────────────── */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Branch">
        <form onSubmit={handleCreate}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="form-label">Branch Code *</label>
              <input className="form-input" value={form.branch_code} onChange={e => setForm(f => ({...f, branch_code: e.target.value.toUpperCase()}))} placeholder="e.g. MUM, DEL, BLR" maxLength={20} required />
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>Short unique code, auto-uppercased</div>
            </div>
            <div>
              <label className="form-label">Branch Name *</label>
              <input className="form-input" value={form.branch_name} onChange={e => setForm(f => ({...f, branch_name: e.target.value}))} placeholder="e.g. Mumbai Showroom" required />
            </div>
            <div>
              <label className="form-label">Address</label>
              <textarea className="form-input" rows={2} value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} placeholder="Optional address" style={{ resize: 'vertical' }} />
            </div>
            {err && <div style={{ color: '#C53030', fontSize: 13 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create Branch'}</button>
            </div>
          </div>
        </form>
      </Modal>

      {/* ── Edit Modal ────────────────────────────────────────────────────────── */}
      <Modal open={!!editBranch} onClose={() => setEditBranch(null)} title={`Edit Branch — ${editBranch?.branch_code}`}>
        <form onSubmit={handleEdit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="form-label">Branch Name *</label>
              <input className="form-input" value={editForm.branch_name} onChange={e => setEditForm(f => ({...f, branch_name: e.target.value}))} required />
            </div>
            <div>
              <label className="form-label">Address</label>
              <textarea className="form-input" rows={2} value={editForm.address} onChange={e => setEditForm(f => ({...f, address: e.target.value}))} style={{ resize: 'vertical' }} />
            </div>
            {!editBranch?.is_home_branch && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="b_active" checked={editForm.is_active} onChange={e => setEditForm(f => ({...f, is_active: e.target.checked}))} />
                <label htmlFor="b_active" style={{ fontSize: 13, cursor: 'pointer' }}>Active</label>
              </div>
            )}
            {editBranch?.is_home_branch && (
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '8px 12px', background: 'var(--color-surface)', borderRadius: 6 }}>
                Home branch cannot be deactivated or deleted.
              </div>
            )}
            {err && <div style={{ color: '#C53030', fontSize: 13 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditBranch(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </div>
        </form>
      </Modal>

      {/* ── Delete Confirm Modal ──────────────────────────────────────────────── */}
      <Modal open={!!deleteBranch} onClose={() => setDeleteBranch(null)} title="Delete Branch">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 14, margin: 0 }}>
            Delete <strong>{deleteBranch?.branch_name}</strong>? Branches with existing sales data cannot be deleted — deactivate them instead.
          </p>
          {err && <div style={{ color: '#C53030', fontSize: 13 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setDeleteBranch(null)}>Cancel</button>
            <button
              style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#E53E3E', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
              onClick={handleDelete} disabled={deleting}
            >{deleting ? 'Deleting…' : 'Delete Branch'}</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
