'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import DataTable from '@/components/ui/DataTable';
import Pagination from '@/components/ui/Pagination';
import api from '@/lib/api';
import { woiBadgeClass } from '@/lib/formatters';
import { useActiveBranch } from '@/components/layout/Sidebar';

export default function FocusSkuPage() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ category: '', brand: '', woi_status: '' });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [activeBranch] = useActiveBranch();

  function load(p = 1) {
    setLoading(true);
    api.get('/reports/focus-sku', { params: { ...filters, page: p, limit: 50, branch_id: activeBranch?.id || '' } })
      .then(r => { setData(r.data.data); setTotal(r.data.total); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(1); setPage(1); }, [filters, activeBranch]);
  useEffect(() => { if (page > 1) load(page); }, [page]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await api.get('/reports/focus-sku/export', {
        params: { ...filters, branch_id: activeBranch?.id || '' }, responseType: 'blob'
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = 'focus_sku_report.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  }

  return (
    <>
      <Topbar
        title="Focus SKU Report"
        subtitle="Inventory health dashboard for high-priority SKUs"
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="form-input" placeholder="Category" value={filters.category}
            onChange={e => setFilters(f => ({ ...f, category: e.target.value }))} style={{ width: 160 }} />
          <input className="form-input" placeholder="Brand" value={filters.brand}
            onChange={e => setFilters(f => ({ ...f, brand: e.target.value }))} style={{ width: 160 }} />
          <select className="form-input" value={filters.woi_status}
            onChange={e => setFilters(f => ({ ...f, woi_status: e.target.value }))} style={{ width: 150 }}>
            <option value="">All WOI Status</option>
            <option value="red">Red (Critical)</option>
            <option value="amber">Amber (Low)</option>
            <option value="green">Green (OK)</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="btn btn-secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, fontSize: 13, color: 'var(--color-text)' }}>
        Showing only SKUs marked as <strong>Focus SKUs</strong>. To mark a SKU as focus, edit it in <a href="/skus" style={{ color: 'var(--color-primary)' }}>SKU Master</a>.
      </div>

      <DataTable
          loading={loading}
          emptyText="No focus SKUs found. Mark SKUs as focus in SKU Master."
          columns={[
            { key: 'sku_code', label: 'SKU Code', width: 110 },
            { key: 'sku_name', label: 'SKU Name' },
            { key: 'brand', label: 'Brand', width: 90 },
            { key: 'category', label: 'Category', width: 110 },
            {
              key: 'msl_busy', label: 'Current MSL', width: 95,
              render: v => v != null ? parseFloat(v).toFixed(0) : <span style={{ color: 'var(--color-text-muted)' }}>—</span>
            },
            {
              key: 'current_stock', label: 'Stock', width: 80,
              render: v => {
                const n = parseFloat(v || 0);
                return <strong style={{ color: n === 0 ? '#C53030' : 'inherit' }}>{n.toFixed(0)}</strong>;
              }
            },
            {
              key: 'drr_recommended', label: 'DRR/day', width: 85,
              render: v => parseFloat(v || 0).toFixed(2)
            },
            {
              key: 'woi', label: 'WOI (wks)', width: 95,
              render: v => v != null ? parseFloat(v).toFixed(1) : '—'
            },
            {
              key: 'woi_status', label: 'WOI Status', width: 100,
              render: v => v ? <span className={woiBadgeClass(v)}>{v.toUpperCase()}</span> : '—'
            },
            {
              key: 'msl_suggested', label: 'Suggested MSL', width: 105,
              render: v => v != null ? (
                <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{parseFloat(v).toFixed(0)}</span>
              ) : '—'
            },
            {
              key: 'suggested_order_qty', label: 'Suggested Order', width: 130,
              render: v => (parseInt(v) || 0) > 0 ? (
                <strong style={{ color: 'var(--color-primary)' }}>{v}</strong>
              ) : '—'
            },
          ]}
          data={data}
          footer={<Pagination page={page} total={total} limit={50} onChange={setPage} />}
        />
    </>
  );
}
