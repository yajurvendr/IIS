'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import DataTable from '@/components/ui/DataTable';
import Pagination from '@/components/ui/Pagination';
import api from '@/lib/api';
import { woiBadgeClass } from '@/lib/formatters';
import { useActiveBranch } from '@/components/layout/Sidebar';

function recommendation(busyMsl, systemMsl) {
  const b = parseFloat(busyMsl) || 0;
  const s = parseFloat(systemMsl) || 0;
  if (b === 0) return { label: 'New',          color: '#6366F1', bg: 'rgba(99,102,241,0.1)' };
  if (s > b * 1.2) return { label: 'Increase MSL', color: '#C53030', bg: '#FFF5F5' };
  if (s < b * 0.8) return { label: 'Reduce MSL',  color: '#2B6CB0', bg: '#EBF8FF' };
  return { label: 'OK',            color: '#276749', bg: '#F0FFF4' };
}

export default function MslReviewPage() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ category: '', brand: '' });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [activeBranch] = useActiveBranch();

  function load(p = 1) {
    setLoading(true);
    api.get('/reports/msl-review', { params: { ...filters, page: p, limit: 50, branch_id: activeBranch?.id || '' } })
      .then(r => { setData(r.data.data); setTotal(r.data.total); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(1); setPage(1); }, [filters, activeBranch]);
  useEffect(() => { if (page > 1) load(page); }, [page]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await api.get('/reports/msl-review/export', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = 'msl_review_report.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  }

  return (
    <>
      <Topbar
        title="MSL Review Report"
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="form-input" placeholder="Category" value={filters.category}
            onChange={e => setFilters(f => ({ ...f, category: e.target.value }))} style={{ width: 180 }} />
          <input className="form-input" placeholder="Brand" value={filters.brand}
            onChange={e => setFilters(f => ({ ...f, brand: e.target.value }))} style={{ width: 180 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="btn btn-secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 12, padding: '10px 14px', background: '#FFFBEB', border: '1px solid #F6E05E', borderRadius: 8, fontSize: 13, color: '#744210' }}>
        Compares <strong>Busy Accounting MSL</strong> (imported via MSL file) with <strong>System MSL</strong> (computed from DRR × lead time).
        Variance &gt; 20% triggers a recommendation to adjust.
      </div>

      <DataTable
          loading={loading}
          emptyText="No MSL data. Import an MSL file and run forecast recompute."
          columns={[
            { key: 'sku_code', label: 'SKU Code', width: 120 },
            { key: 'sku_name', label: 'SKU Name' },
            { key: 'brand', label: 'Brand', width: 100 },
            { key: 'category', label: 'Category', width: 120 },
            {
              key: 'busy_msl', label: 'Busy MSL', width: 100,
              render: v => v != null ? <strong>{parseFloat(v).toFixed(0)}</strong> : <span style={{ color: 'var(--color-text-muted)' }}>—</span>
            },
            {
              key: 'system_msl', label: 'System MSL', width: 110,
              render: v => v != null ? <strong style={{ color: 'var(--color-primary-light)' }}>{parseFloat(v).toFixed(0)}</strong> : '—'
            },
            {
              key: 'variance', label: 'Variance', width: 100,
              render: (v, row) => {
                const var_ = parseFloat(v) || 0;
                const color = var_ > 0 ? '#C53030' : var_ < 0 ? '#2B6CB0' : 'var(--color-text-muted)';
                return <span style={{ fontWeight: 600, color }}>{var_ > 0 ? '+' : ''}{var_.toFixed(0)}</span>;
              }
            },
            {
              key: 'current_stock', label: 'Stock', width: 80,
              render: v => v ?? '—'
            },
            {
              key: 'drr_recommended', label: 'DRR', width: 80,
              render: v => parseFloat(v || 0).toFixed(2)
            },
            {
              key: 'woi_status', label: 'WOI', width: 80,
              render: (v, row) => v ? <span className={woiBadgeClass(v)}>{v?.toUpperCase()}</span> : '—'
            },
            {
              key: '_rec', label: 'Recommendation', width: 140,
              render: (_, row) => {
                const rec = recommendation(row.busy_msl, row.system_msl);
                return (
                  <span style={{
                    display: 'inline-block', padding: '3px 10px', borderRadius: 12,
                    fontSize: 12, fontWeight: 700, color: rec.color, background: rec.bg,
                  }}>{rec.label}</span>
                );
              }
            },
          ]}
          data={data}
          footer={<Pagination page={page} total={total} limit={50} onChange={setPage} />}
        />
    </>
  );
}
