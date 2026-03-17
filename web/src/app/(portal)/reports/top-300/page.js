'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import DataTable from '@/components/ui/DataTable';
import Pagination from '@/components/ui/Pagination';
import api from '@/lib/api';
import { woiBadgeClass } from '@/lib/formatters';
import { useActiveBranch } from '@/components/layout/Sidebar';

export default function Top300Page() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ period: 'last_90', category: '', brand: '' });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [activeBranch] = useActiveBranch();

  function load(p = 1) {
    setLoading(true);
    api.get('/reports/top-300', { params: { ...filters, page: p, limit: 100, branch_id: activeBranch?.id || '' } })
      .then(r => { setData(r.data.data); setTotal(r.data.total); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(1); setPage(1); }, [filters, activeBranch]);
  useEffect(() => { if (page > 1) load(page); }, [page]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await api.get('/reports/top-300/export', {
        params: { ...filters, branch_id: activeBranch?.id || '' }, responseType: 'blob'
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = 'top300_report.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  }

  const PERIOD_LABELS = { last_90: 'Last 90 Days', mtd: 'Month to Date', ytd: 'Year to Date' };

  return (
    <>
      <Topbar
        title="Top 300 by Sales"
        subtitle="Highest volume SKUs ranked by quantity sold"
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="form-input" value={filters.period}
            onChange={e => setFilters(f => ({ ...f, period: e.target.value }))} style={{ width: 160 }}>
            <option value="last_90">Last 90 Days</option>
            <option value="mtd">Month to Date</option>
            <option value="ytd">Year to Date</option>
          </select>
          <input className="form-input" placeholder="Category" value={filters.category}
            onChange={e => setFilters(f => ({ ...f, category: e.target.value }))} style={{ width: 160 }} />
          <input className="form-input" placeholder="Brand" value={filters.brand}
            onChange={e => setFilters(f => ({ ...f, brand: e.target.value }))} style={{ width: 160 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="btn btn-secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>
      </div>

      <DataTable
          loading={loading}
          emptyText="No sales data found for the selected period."
          columns={[
            {
              key: 'rank', label: '#', width: 55,
              render: v => <span style={{ fontWeight: 700, color: 'var(--color-text-muted)', fontSize: 13 }}>{v}</span>
            },
            { key: 'sku_code', label: 'SKU Code', width: 110 },
            { key: 'sku_name', label: 'SKU Name' },
            { key: 'brand', label: 'Brand', width: 90 },
            { key: 'category', label: 'Category', width: 110 },
            {
              key: 'total_qty', label: 'Qty Sold', width: 95,
              render: v => <strong>{parseFloat(v || 0).toFixed(0)}</strong>
            },
            {
              key: 'revenue', label: 'Revenue', width: 110,
              render: v => `₹${parseFloat(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
            },
            {
              key: 'margin_pct', label: 'Margin %', width: 95,
              render: v => {
                const pct = parseFloat(v || 0);
                const color = pct >= 20 ? 'var(--color-green)' : pct >= 10 ? '#DD6B20' : '#C53030';
                return <span style={{ fontWeight: 600, color }}>{pct.toFixed(1)}%</span>;
              }
            },
            {
              key: 'current_stock', label: 'Stock', width: 80,
              render: v => v != null ? parseFloat(v).toFixed(0) : '—'
            },
            {
              key: 'woi_status', label: 'WOI', width: 80,
              render: v => v ? <span className={woiBadgeClass(v)}>{v.toUpperCase()}</span> : '—'
            },
          ]}
          data={data}
          footer={<Pagination page={page} total={total} limit={100} onChange={setPage} />}
        />
    </>
  );
}
