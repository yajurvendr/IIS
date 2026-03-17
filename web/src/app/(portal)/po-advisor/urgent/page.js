'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import DataTable from '@/components/ui/DataTable';
import api from '@/lib/api';
import { formatINR, woiBadgeClass } from '@/lib/formatters';
import Link from 'next/link';

export default function UrgentPoPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/po-recommendation', { params: { urgent_only: 'true', limit: 200 } })
      .then(r => setData(r.data.data))
      .finally(() => setLoading(false));
  }, []);

  const totalValue = data.reduce((s, r) => s + (r.suggested_order_qty || 0) * (r.purchase_cost_decoded || 0), 0);

  return (
    <>
      <Topbar
        title="Urgent PO Report (Red WOI)"
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, gap: 8 }}>
        <Link href="/po-advisor" className="btn btn-secondary">Full PO Advisor</Link>
      </div>

      {!loading && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center' }}>
          <div className="stat-card" style={{ borderTop: '3px solid var(--color-red)', flex: 'none', minWidth: 180 }}>
            <div className="stat-card__label">Critical SKUs</div>
            <div className="stat-card__value" style={{ color: 'var(--color-red)' }}>{data.length}</div>
          </div>
          <div className="stat-card" style={{ borderTop: '3px solid var(--color-amber)', flex: 'none', minWidth: 180 }}>
            <div className="stat-card__label">Est. PO Value</div>
            <div className="stat-card__value">{formatINR(totalValue, true)}</div>
          </div>
        </div>
      )}

      <DataTable
          loading={loading}
          columns={[
            { key: 'sku_code', label: 'SKU Code', width: 120 },
            { key: 'description', label: 'Description' },
            { key: 'brand', label: 'Brand', width: 100 },
            { key: 'current_stock', label: 'Stock', width: 80 },
            { key: 'drr_rec', label: 'DRR/day', width: 90, render: v => parseFloat(v || 0).toFixed(2) },
            {
              key: 'woi', label: 'WOI', width: 90,
              render: (v, row) => <span className={woiBadgeClass(row.woi_status)} style={{ fontSize: 13 }}>{parseFloat(v || 0).toFixed(1)}w</span>
            },
            { key: 'suggested_order_qty', label: 'Order Qty', width: 100, render: v => <strong style={{ color: 'var(--color-red)' }}>{v || 0}</strong> },
            { key: 'purchase_cost_decoded', label: 'Unit Cost', width: 100, render: v => v ? formatINR(v) : '—' },
          ]}
          data={data}
          emptyText="No urgent SKUs — all stock is healthy!"
        />
    </>
  );
}
