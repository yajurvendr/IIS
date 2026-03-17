'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import DataTable from '@/components/ui/DataTable';
import api from '@/lib/api';
import { formatDate } from '@/lib/formatters';

export default function TransferLogPage() {
  const [rows, setRows]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState([]);

  const [filters, setFilters] = useState({ branch_id: '', from_date: '', to_date: '' });
  const [page, setPage]       = useState(1);
  const LIMIT = 50;

  useEffect(() => {
    api.get('/branches/').then(r => setBranches(r.data || []));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = { page, limit: LIMIT, ...filters };
    api.get('/branches/transfers/log', { params })
      .then(r => { setRows(r.data.data || []); setTotal(r.data.total || 0); })
      .finally(() => setLoading(false));
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  function applyFilters(e) { e.preventDefault(); setPage(1); load(); }

  return (
    <>
      <Topbar
        title="Stock Transfer Log"
        subtitle="All inter-branch movements"
      />

      {/* Filters */}
      <form onSubmit={applyFilters} style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div className="form-label" style={{ marginBottom: 4 }}>Branch</div>
          <select className="form-select" style={{ width: 200 }}
            value={filters.branch_id} onChange={e => setFilters(f => ({...f, branch_id: e.target.value}))}>
            <option value="">All branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.branch_code} — {b.branch_name}</option>)}
          </select>
        </div>
        <div>
          <div className="form-label" style={{ marginBottom: 4 }}>From Date</div>
          <input type="date" className="form-input" value={filters.from_date}
            onChange={e => setFilters(f => ({...f, from_date: e.target.value}))} />
        </div>
        <div>
          <div className="form-label" style={{ marginBottom: 4 }}>To Date</div>
          <input type="date" className="form-input" value={filters.to_date}
            onChange={e => setFilters(f => ({...f, to_date: e.target.value}))} />
        </div>
        <button type="submit" className="btn btn-secondary">Apply</button>
        <button type="button" className="btn btn-ghost" onClick={() => { setFilters({ branch_id: '', from_date: '', to_date: '' }); setPage(1); }}>Clear</button>
        <Link href="/branches/transfer/new" className="btn btn-primary" style={{ marginLeft: 'auto' }}>+ New Transfer</Link>
      </form>

      <DataTable
          loading={loading}
          emptyText="No transfers found"
          columns={[
            { key: 'transfer_date',    label: 'Date',      width: 110, render: v => formatDate(v) },
            { key: 'sku_code',         label: 'SKU',       width: 120, render: (v, row) => (
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{v}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{row.sku_name}</div>
              </div>
            )},
            { key: 'from_branch_name', label: 'From',      render: v => v },
            { key: 'to_branch_name',   label: 'To',        render: v => v },
            { key: 'quantity',         label: 'Qty',       width: 90, render: v => <strong>{Number(v).toLocaleString('en-IN')}</strong> },
            { key: 'notes',            label: 'Notes',     render: v => v || <span style={{ color: 'var(--color-text-muted)' }}>—</span> },
            { key: 'created_at',       label: 'Recorded',  width: 120, render: v => formatDate(v) },
          ]}
          data={rows}
        />

      {/* Pagination */}
      {total > LIMIT && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
          <button className="btn btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span style={{ lineHeight: '36px', fontSize: 13, color: 'var(--color-text-muted)' }}>
            Page {page} of {Math.ceil(total / LIMIT)} ({total} records)
          </span>
          <button className="btn btn-secondary" disabled={page * LIMIT >= total} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </>
  );
}
