'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import DataTable from '@/components/ui/DataTable';
import Pagination from '@/components/ui/Pagination';
import api from '@/lib/api';
import { formatINR, woiBadgeClass } from '@/lib/formatters';
import { useActiveBranch } from '@/components/layout/Sidebar';

export default function PoAdvisorPage() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ urgent_only: false, category: '', brand: '' });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [activeBranch] = useActiveBranch();

  function load(p = 1) {
    setLoading(true);
    api.get('/reports/po-recommendation', {
      params: { page: p, limit: 50, ...filters, urgent_only: filters.urgent_only ? 'true' : undefined, branch_id: activeBranch?.id || '' }
    }).then(r => { setData(r.data.data); setTotal(r.data.total); }).finally(() => setLoading(false));
  }

  useEffect(() => { load(1); setPage(1); }, [filters, activeBranch]);
  useEffect(() => { if (page > 1) load(page); }, [page]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await api.get('/reports/po-recommendation/export', { params: { branch_id: activeBranch?.id || '' }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = 'po_recommendation.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  }

  const totalPOValue = data.reduce((s, r) => s + (r.suggested_order_qty || 0) * (r.purchase_cost_decoded || 0), 0);

  return (
    <>
      <Topbar
        title="PO Advisor"
      />

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={filters.urgent_only} onChange={e => setFilters(f => ({ ...f, urgent_only: e.target.checked }))} />
            Urgent only (Red WOI)
          </label>
          <input className="form-input" placeholder="Category" value={filters.category}
            onChange={e => setFilters(f => ({ ...f, category: e.target.value }))} style={{ width: 160 }} />
          <input className="form-input" placeholder="Brand" value={filters.brand}
            onChange={e => setFilters(f => ({ ...f, brand: e.target.value }))} style={{ width: 160 }} />
          {totalPOValue > 0 && (
            <div style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: 15 }}>
              Est. PO Value: {formatINR(totalPOValue, true)}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
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
            { key: 'current_stock', label: 'Stock', width: 80 },
            { key: 'drr_recommended', label: 'DRR/day', width: 90, render: v => parseFloat(v || 0).toFixed(2) },
            {
              key: 'woi', label: 'WOI', width: 90,
              render: (v, row) => <span className={woiBadgeClass(row.woi_status)}>{parseFloat(v || 0).toFixed(1)}w</span>
            },
            { key: 'msl_suggested', label: 'Suggested MSL', width: 110 },
            { key: 'target_12w_qty', label: '12W Target', width: 100 },
            { key: 'suggested_order_qty', label: 'Order Qty', width: 100, render: v => <strong>{v || 0}</strong> },
            {
              key: 'purchase_cost_decoded', label: 'Unit Cost', width: 100,
              render: v => v ? formatINR(v) : '—'
            },
            {
              key: 'id', label: 'PO Value', width: 120,
              render: (_, row) => {
                const val = (row.suggested_order_qty || 0) * (row.purchase_cost_decoded || 0);
                return val > 0 ? <strong>{formatINR(val, true)}</strong> : '—';
              }
            },
          ]}
          data={data}
          emptyText="No PO recommendations"
          footer={<Pagination page={page} total={total} limit={50} onChange={setPage} />}
        />
    </>
  );
}
