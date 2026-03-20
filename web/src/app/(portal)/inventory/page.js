'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import DataTable from '@/components/ui/DataTable';
import Pagination from '@/components/ui/Pagination';
import api from '@/lib/api';
import { woiBadgeClass, formatDate } from '@/lib/formatters';
import { useActiveBranch } from '@/components/layout/Sidebar';

export default function InventoryPage() {
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState({ red: 0, amber: 0, green: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ woi_status: '', category: '', brand: '' });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [activeBranch] = useActiveBranch();

  function load(p = page) {
    setLoading(true);
    api.get('/reports/inventory-woi', { params: { ...filters, page: p, limit: 50, branch_id: activeBranch?.id || '' } })
      .then(r => {
        setData(r.data.data);
        setTotal(r.data.total);
        if (r.data.summary) setSummary(r.data.summary);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(1); setPage(1); }, [filters, activeBranch]);
  useEffect(() => { load(); }, [page]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await api.get('/reports/inventory-woi/export', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = 'inventory_woi_report.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  }

  return (
    <>
      <Topbar
        title="Inventory Health"
      />

      {/* RAG Summary */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Critical (Red)', key: 'red', cls: 'badge-red', filter: 'red' },
          { label: 'Low Stock (Amber)', key: 'amber', cls: 'badge-amber', filter: 'amber' },
          { label: 'Healthy (Green)', key: 'green', cls: 'badge-green', filter: 'green' },
        ].map(s => (
          <button key={s.key}
            onClick={() => setFilters(f => ({ ...f, woi_status: f.woi_status === s.filter ? '' : s.filter }))}
            style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`badge ${s.cls}`} style={{ fontSize: 13, padding: '4px 14px' }}>
              {summary[s.key] || 0}
            </span>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{s.label}</span>
          </button>
        ))}
        {filters.woi_status && (
          <button className="btn btn-secondary btn-sm" onClick={() => setFilters(f => ({ ...f, woi_status: '' }))}>Clear ×</button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="form-input" placeholder="Category" value={filters.category}
            onChange={e => setFilters(f => ({ ...f, category: e.target.value }))} style={{ width: 180 }} />
          <input className="form-input" placeholder="Brand" value={filters.brand}
            onChange={e => setFilters(f => ({ ...f, brand: e.target.value }))} style={{ width: 180 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <Link href="/reports/msl-review" className="btn btn-secondary">MSL Review</Link>
          <button className="btn btn-secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>
      </div>

      <DataTable
          loading={loading}
          columns={[
            { key: 'sku_code', label: 'SKU Code', width: 120 },
            { key: 'sku_name', label: 'SKU Name' },
            { key: 'brand', label: 'Brand', width: 100 },
            { key: 'category', label: 'Category', width: 120 },
            { key: 'current_stock', label: 'Stock', width: 80 },
            { key: 'unit', label: 'Unit', width: 60 },
            { key: 'drr_recommended', label: 'DRR', width: 80, render: v => parseFloat(v || 0).toFixed(2) },
            {
              key: 'woi', label: 'WOI (wks)', width: 100,
              render: (v, row) => (
                <span className={woiBadgeClass(row.woi_status)}>
                  {parseFloat(v || 0).toFixed(1)}w
                </span>
              )
            },
            { key: 'msl_suggested', label: 'Suggested MSL', width: 110 },
            { key: 'forecast_at', label: 'Updated', width: 110, render: v => formatDate(v) },
          ]}
          data={data}
          emptyText="No inventory data"
          footer={<Pagination page={page} total={total} limit={50} onChange={setPage} />}
        />
    </>
  );
}
