'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import DataTable from '@/components/ui/DataTable';
import StatCard from '@/components/ui/StatCard';
import api from '@/lib/api';
import { formatINR } from '@/lib/formatters';
import { useActiveBranch } from '@/components/layout/Sidebar';

const PERIODS = [
  { value: 'mtd', label: 'MTD' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'ytd', label: 'YTD' },
  { value: 'last_90', label: 'Last 90 Days' },
];

const TABS = ['Summary', 'By Category', 'By Brand', 'Top SKUs'];

export default function ProfitabilityPage() {
  const [period, setPeriod] = useState('mtd');
  const [tab, setTab] = useState('Summary');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeBranch] = useActiveBranch();

  useEffect(() => {
    setLoading(true);
    api.get('/reports/profitability', { params: { period, branch_id: activeBranch?.id || '' } })
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, [period, activeBranch]);

  const s = data?.summary || {};

  return (
    <>
      <Topbar title="Profitability Analysis" />

      {/* Period selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {PERIODS.map(p => (
          <button key={p.value} className={`btn ${period === p.value ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setPeriod(p.value)}>{p.label}</button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Revenue" value={loading ? '—' : formatINR(s.total_revenue, true)} />
        <StatCard label="COGS" value={loading ? '—' : formatINR(s.total_cogs, true)} />
        <StatCard label="Gross Profit" value={loading ? '—' : formatINR(s.gross_profit, true)} accent="var(--color-green)" />
        <StatCard
          label="Gross Margin"
          value={loading || !s.total_revenue ? '—' : `${((s.gross_profit / s.total_revenue) * 100).toFixed(1)}%`}
          accent="var(--color-accent)"
        />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border)', marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14,
            fontWeight: tab === t ? 700 : 400,
            color: tab === t ? 'var(--color-primary)' : 'var(--color-text-muted)',
            borderBottom: tab === t ? '2px solid var(--color-primary)' : '2px solid transparent',
          }}>{t}</button>
        ))}
      </div>

      {tab === 'Summary' && data?.trend && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>Monthly Revenue vs Gross Profit</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 120 }}>
            {(() => {
              const maxR = Math.max(...data.trend.map(m => m.revenue));
              return data.trend.map(m => (
                <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'center' }}>{formatINR(m.revenue, true)}</div>
                  <div style={{ display: 'flex', gap: 2, width: '100%', alignItems: 'flex-end', height: 80 }}>
                    <div style={{ flex: 1, borderRadius: '3px 3px 0 0', background: 'var(--color-primary-light)', height: `${maxR > 0 ? (m.revenue / maxR) * 80 : 4}px`, minHeight: 4 }} />
                    <div style={{ flex: 1, borderRadius: '3px 3px 0 0', background: 'var(--color-green)', height: `${maxR > 0 ? (m.gross_profit / maxR) * 80 : 4}px`, minHeight: 4 }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{m.month?.slice(5)}</div>
                </div>
              ));
            })()}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12 }}>
            <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}><span style={{ width: 12, height: 12, background: 'var(--color-primary-light)', display: 'inline-block', borderRadius: 2 }}></span>Revenue</span>
            <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}><span style={{ width: 12, height: 12, background: 'var(--color-green)', display: 'inline-block', borderRadius: 2 }}></span>Gross Profit</span>
          </div>
        </div>
      )}

      {tab === 'By Category' && (
        <DataTable
            loading={loading}
            columns={[
              { key: 'category', label: 'Category' },
              { key: 'revenue', label: 'Revenue', render: v => formatINR(v, true) },
              { key: 'cogs', label: 'COGS', render: v => formatINR(v, true) },
              { key: 'gross_profit', label: 'Gross Profit', render: v => <strong style={{ color: 'var(--color-green)' }}>{formatINR(v, true)}</strong> },
              { key: 'revenue', label: 'Margin %', render: (v, row) => v > 0 ? `${((row.gross_profit / v) * 100).toFixed(1)}%` : '—' },
            ]}
            data={data?.by_category}
            emptyText="No data"
          />
      )}

      {tab === 'By Brand' && (
        <DataTable
            loading={loading}
            columns={[
              { key: 'brand', label: 'Brand' },
              { key: 'revenue', label: 'Revenue', render: v => formatINR(v, true) },
              { key: 'cogs', label: 'COGS', render: v => formatINR(v, true) },
              { key: 'gross_profit', label: 'Gross Profit', render: v => <strong style={{ color: 'var(--color-green)' }}>{formatINR(v, true)}</strong> },
              { key: 'revenue', label: 'Margin %', render: (v, row) => v > 0 ? `${((row.gross_profit / v) * 100).toFixed(1)}%` : '—' },
            ]}
            data={data?.by_brand}
            emptyText="No data"
          />
      )}

      {tab === 'Top SKUs' && (
        <DataTable
            loading={loading}
            columns={[
              { key: 'sku_code', label: 'SKU Code', width: 120 },
              { key: 'description', label: 'Description' },
              { key: 'brand', label: 'Brand', width: 100 },
              { key: 'qty', label: 'Qty Sold', width: 90 },
              { key: 'revenue', label: 'Revenue', render: v => formatINR(v, true) },
              { key: 'gross_profit', label: 'Gross Profit', render: v => <strong style={{ color: 'var(--color-green)' }}>{formatINR(v, true)}</strong> },
              { key: 'revenue', label: 'Margin %', render: (v, row) => v > 0 ? `${((row.gross_profit / v) * 100).toFixed(1)}%` : '—' },
            ]}
            data={data?.top_skus}
            emptyText="No data"
          />
      )}
    </>
  );
}
