'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import DataTable from '@/components/ui/DataTable';
import Pagination from '@/components/ui/Pagination';
import api from '@/lib/api';
import { woiBadgeClass, formatDate } from '@/lib/formatters';
import { useActiveBranch } from '@/components/layout/Sidebar';

export default function SalesForecastPage() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ category: '', brand: '', woi_status: '' });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [activeBranch] = useActiveBranch();

  function load(p = 1) {
    setLoading(true);
    api.get('/reports/sales-forecast', { params: { ...filters, page: p, limit: 50, branch_id: activeBranch?.id || '' } })
      .then(r => { setData(r.data.data); setTotal(r.data.total); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(1); setPage(1); }, [filters, activeBranch]);
  useEffect(() => { if (page > 1) load(page); }, [page]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await api.get('/reports/sales-forecast/export', {
        params: { ...filters, branch_id: activeBranch?.id || '' }, responseType: 'blob'
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = 'sales_forecast_report.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  }

  function stockCell(val) {
    const n = parseFloat(val) || 0;
    if (n === 0) return <span style={{ fontWeight: 700, color: '#C53030' }}>0</span>;
    if (n < 10)  return <span style={{ fontWeight: 600, color: '#DD6B20' }}>{n.toFixed(0)}</span>;
    return <span>{n.toFixed(0)}</span>;
  }

  return (
    <>
      <Topbar
        title="Sales Forecast Report"
        subtitle="Projected stock levels at 4W, 8W, 12W based on current DRR"
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="form-input" placeholder="Category" value={filters.category}
            onChange={e => setFilters(f => ({ ...f, category: e.target.value }))} style={{ width: 160 }} />
          <input className="form-input" placeholder="Brand" value={filters.brand}
            onChange={e => setFilters(f => ({ ...f, brand: e.target.value }))} style={{ width: 160 }} />
          <select className="form-input" value={filters.woi_status}
            onChange={e => setFilters(f => ({ ...f, woi_status: e.target.value }))} style={{ width: 140 }}>
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

      <div style={{ marginBottom: 12, padding: '10px 14px', background: '#EBF8FF', border: '1px solid #BEE3F8', borderRadius: 8, fontSize: 13, color: '#2A4365' }}>
        Projections based on <strong>recommended DRR</strong>. Highlighted cells indicate projected zero stock. Stock-out date = today + (current stock ÷ daily DRR).
      </div>

      <DataTable
          loading={loading}
          emptyText="No forecast data. Run a forecast recompute first."
          columns={[
            { key: 'sku_code', label: 'SKU Code', width: 110 },
            { key: 'sku_name', label: 'SKU Name' },
            { key: 'brand', label: 'Brand', width: 90 },
            { key: 'category', label: 'Category', width: 110 },
            {
              key: 'current_stock', label: 'Stock Now', width: 90,
              render: v => <strong>{parseFloat(v || 0).toFixed(0)}</strong>
            },
            {
              key: 'drr_recommended', label: 'DRR/day', width: 85,
              render: v => parseFloat(v || 0).toFixed(2)
            },
            {
              key: 'woi_status', label: 'WOI', width: 75,
              render: v => v ? <span className={woiBadgeClass(v)}>{v.toUpperCase()}</span> : '—'
            },
            {
              key: 'proj_4w', label: '4W Stock', width: 90,
              render: v => stockCell(v)
            },
            {
              key: 'proj_8w', label: '8W Stock', width: 90,
              render: v => stockCell(v)
            },
            {
              key: 'proj_12w', label: '12W Stock', width: 95,
              render: v => stockCell(v)
            },
            {
              key: 'stockout_date', label: 'Stock-Out Date', width: 130,
              render: v => v ? (
                <span style={{ fontWeight: 600, color: '#C53030' }}>{v}</span>
              ) : <span style={{ color: 'var(--color-text-muted)' }}>No stock-out</span>
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
