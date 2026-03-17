'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import DataTable from '@/components/ui/DataTable';
import Pagination from '@/components/ui/Pagination';
import api from '@/lib/api';
import { woiBadgeClass } from '@/lib/formatters';

export default function SkusPage() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [focusOnly, setFocusOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  function load(p = 1) {
    setLoading(true);
    const params = { page: p, limit: 50, search };
    if (focusOnly) params.is_focus_sku = 1;
    api.get('/skus', { params }).then(r => { setData(r.data.data); setTotal(r.data.total); }).finally(() => setLoading(false));
  }

  useEffect(() => { load(1); setPage(1); }, [search, focusOnly]);
  useEffect(() => { if (page > 1) load(page); }, [page]);

  return (
    <>
      <Topbar
        title="SKU Master"
        backHref="/settings"
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="form-input" placeholder="Search SKU code, name or brand…" value={search}
            onChange={e => setSearch(e.target.value)} style={{ flex: 1, maxWidth: 360 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={focusOnly} onChange={e => setFocusOnly(e.target.checked)} />
            Focus SKUs only
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <Link href="/skus/bulk-tag" className="btn btn-secondary">Bulk Season Tag</Link>
        </div>
      </div>

      <DataTable
          loading={loading}
          columns={[
            { key: 'sku_code', label: 'SKU Code', width: 130, render: (v, row) => <Link href={`/skus/${row.id}`} style={{ color: 'var(--color-primary-light)', fontWeight: 600 }}>{v}</Link> },
            { key: 'sku_name', label: 'SKU Name' },
            { key: 'brand', label: 'Brand', width: 110 },
            { key: 'category', label: 'Category', width: 120 },
            { key: 'current_stock', label: 'Stock', width: 80 },
            { key: 'drr_recommended', label: 'DRR', width: 80, render: v => parseFloat(v || 0).toFixed(2) },
            {
              key: 'woi', label: 'WOI', width: 90,
              render: (v, row) => <span className={woiBadgeClass(row.woi_status)}>{parseFloat(v || 0).toFixed(1)}w</span>
            },
            {
              key: 'msl_suggested', label: 'MSL Status', width: 120,
              render: (v, row) => {
                const msl = parseFloat(v) || 0;
                const stock = parseFloat(row.current_stock) || 0;
                if (!msl) return <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>—</span>;
                const pct = Math.min(stock / msl, 1);
                const color = pct >= 1 ? '#38A169' : pct >= 0.5 ? '#DD6B20' : '#C53030';
                return (
                  <div style={{ minWidth: 90 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                      <span style={{ fontWeight: 700, color }}>{stock.toFixed(0)}</span>
                      <span style={{ color: 'var(--color-text-muted)' }}>/ {msl.toFixed(0)}</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 99, background: 'var(--color-border)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct * 100}%`, background: color, borderRadius: 99 }} />
                    </div>
                  </div>
                );
              }
            },
            {
              key: 'is_focus_sku', label: 'Focus', width: 70,
              render: v => v ? <span className="badge badge-blue">Focus</span> : null
            },
            {
              key: 'season_tags', label: 'Seasons', width: 140,
              render: v => {
                try {
                  const tags = typeof v === 'string' ? JSON.parse(v) : (v || []);
                  return tags.map(t => <span key={t} className="badge badge-gray" style={{ marginRight: 2 }}>{t}</span>);
                } catch { return null; }
              }
            },
          ]}
          data={data}
          emptyText="No SKUs found"
          footer={<Pagination page={page} total={total} limit={50} onChange={setPage} />}
        />
    </>
  );
}
