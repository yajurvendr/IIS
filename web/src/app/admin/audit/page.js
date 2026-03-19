'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import Pagination from '@/components/ui/Pagination';
import api from '@/lib/api';

export default function AuditPage() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ action: '', actor_role: '' });
  const [loading, setLoading] = useState(true);

  function load(p = 1) {
    setLoading(true);
    api.get('/admin/audit-log', { params: { ...filters, page: p, limit: 30 } })
      .then(r => { setData(r.data.data); setTotal(r.data.total); })
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(1); setPage(1); }, [filters]);
  useEffect(() => { if (page > 1) load(page); }, [page]);

  return (
    <>
      <Topbar title="Audit Log" />
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <input className="form-input" placeholder="Filter by action…" value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))} style={{ width: 200 }} />
        <select className="form-input" value={filters.actor_role} onChange={e => setFilters(f => ({ ...f, actor_role: e.target.value }))} style={{ width: 160 }}>
          <option value="">All Roles</option>
          <option value="super_admin">super_admin</option>
          <option value="tenant_admin">tenant_admin</option>
        </select>
      </div>
      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>Timestamp</th><th>Actor</th><th>Role</th><th>Action</th><th>Target Type</th><th>Target ID</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30 }}>Loading…</td></tr>
              ) : !data.length ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30, color: 'var(--color-text-muted)' }}>No logs found</td></tr>
              ) : data.map(log => (
                <tr key={log.id}>
                  <td style={{ fontSize: 12 }}>{new Date(log.created_at).toLocaleString('en-IN')}</td>
                  <td style={{ fontSize: 12 }}>{log.actor_id}</td>
                  <td><span className="badge badge-blue">{log.actor_role}</span></td>
                  <td><span className="badge badge-gray">{log.action}</span></td>
                  <td style={{ fontSize: 12 }}>{log.target_type}</td>
                  <td style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{log.target_id?.slice(0, 8)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={30} onChange={setPage} />
      </div>
    </>
  );
}
