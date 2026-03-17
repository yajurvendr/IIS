'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import DataTable from '@/components/ui/DataTable';
import api from '@/lib/api';
import { woiBadgeClass, formatDate } from '@/lib/formatters';
import Link from 'next/link';

export default function PreSeasonAlertPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/forecasting/pre-season-alerts').then(r => setData(r.data.data)).finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Topbar title="Pre-Season Alerts" backHref="/settings" />

      {!loading && data.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
          <div style={{ fontWeight: 600, color: 'var(--color-green)' }}>No pre-season alerts at this time</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 6 }}>All seasonal SKUs are adequately stocked.</div>
        </div>
      )}

      {(loading || data.length > 0) && (
        <DataTable
          loading={loading}
          toolbar={
            <>
              <span className="badge badge-amber" style={{ fontSize: 13, padding: '4px 14px' }}>{data.length} SKUs Need Attention</span>
              <Link href="/po-advisor" className="btn btn-primary btn-sm">Generate PO →</Link>
            </>
          }
          columns={[
            { key: 'sku_code', label: 'SKU Code', width: 130, render: (v, row) => <Link href={`/skus/${row.id}`} style={{ color: 'var(--color-primary-light)', fontWeight: 600 }}>{v}</Link> },
            { key: 'sku_name', label: 'SKU Name' },
            { key: 'brand', label: 'Brand', width: 100 },
            {
              key: 'season_tags', label: 'Seasons',
              render: v => {
                try {
                  const tags = typeof v === 'string' ? JSON.parse(v || '[]') : (v || []);
                  return tags.map(t => <span key={t} className="badge badge-blue" style={{ marginRight: 2 }}>{t}</span>);
                } catch { return null; }
              }
            },
            { key: 'current_stock', label: 'Stock', width: 80 },
            { key: 'drr_recommended', label: 'DRR', width: 90, render: v => parseFloat(v || 0).toFixed(2) },
            {
              key: 'woi', label: 'WOI', width: 90,
              render: (v, row) => <span className={woiBadgeClass(row.woi_status)}>{parseFloat(v || 0).toFixed(1)}w</span>
            },
            { key: 'latest_order_date', label: 'Order By', width: 110, render: v => v ? <strong style={{ color: 'var(--color-red)' }}>{formatDate(v)}</strong> : '—' },
            { key: 'suggested_order_qty', label: 'Order Qty', width: 100, render: v => <strong>{v || 0}</strong> },
          ]}
          data={data}
          emptyText="No alerts"
        />
      )}
    </>
  );
}
