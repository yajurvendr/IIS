'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import DataTable from '@/components/ui/DataTable';
import Pagination from '@/components/ui/Pagination';
import api from '@/lib/api';

export default function VolumeProfitPage() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ category: '', brand: '' });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  function load(p = 1) {
    setLoading(true);
    api.get('/reports/volume-profit-divergence', { params: { ...filters, page: p, limit: 50 } })
      .then(r => { setData(r.data.data); setTotal(r.data.total); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(1); setPage(1); }, [filters]);
  useEffect(() => { if (page > 1) load(page); }, [page]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await api.get('/reports/volume-profit-divergence/export', {
        params: filters, responseType: 'blob'
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = 'volume_profit_divergence.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  }

  return (
    <>
      <Topbar
        title="Volume-Profit Divergence"
        subtitle="High-volume SKUs with low or negative margin — last 90 days"
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
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

      <div style={{ marginBottom: 12, padding: '10px 14px', background: '#FFFBEB', border: '1px solid #F6E05E', borderRadius: 8, fontSize: 13, color: '#744210' }}>
        SKUs highlighted in yellow have <strong>margin below 10%</strong>. High volume + low margin = revenue without profit — review pricing or costs.
      </div>

      <DataTable
          loading={loading}
          emptyText="No sales data found for the last 90 days."
          columns={[
            {
              key: 'vol_rank', label: '#', width: 55,
              render: v => <span style={{ fontWeight: 700, color: 'var(--color-text-muted)', fontSize: 13 }}>{v}</span>
            },
            { key: 'sku_code', label: 'SKU Code', width: 110 },
            { key: 'sku_name', label: 'SKU Name' },
            { key: 'brand', label: 'Brand', width: 90 },
            { key: 'category', label: 'Category', width: 110 },
            {
              key: 'total_qty', label: 'Qty Sold', width: 90,
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
                return (
                  <span style={{
                    fontWeight: 700, color,
                    padding: '2px 8px', borderRadius: 12,
                    background: pct < 10 ? 'rgba(197,48,48,0.08)' : 'transparent',
                  }}>
                    {pct.toFixed(1)}%
                  </span>
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
