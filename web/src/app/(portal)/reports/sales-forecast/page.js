'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import DataTable from '@/components/ui/DataTable';
import Pagination from '@/components/ui/Pagination';
import api from '@/lib/api';
import { woiBadgeClass, formatDate } from '@/lib/formatters';
import { useActiveBranch } from '@/components/layout/Sidebar';

// ── Simple SVG bar chart ──────────────────────────────────────────────────────

function BarChart({ data, height = 160, colorFn }) {
  if (!data || data.length === 0) return null;
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barW = 100 / data.length;

  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none"
      style={{ width: '100%', height }}>
      {data.map((d, i) => {
        const barH = (d.value / maxVal) * (height - 24);
        const x = i * barW + barW * 0.1;
        const w = barW * 0.8;
        const y = height - 20 - barH;
        const color = colorFn ? colorFn(d) : '#6366F1';
        return (
          <g key={i}>
            <rect x={x} y={y} width={w} height={Math.max(1, barH)}
              fill={color} rx={1} opacity={0.85} />
            <text x={x + w / 2} y={height - 6} textAnchor="middle"
              fontSize={barW > 12 ? 4.5 : 3.5} fill="var(--color-text-muted)"
              style={{ fontFamily: 'Work Sans, sans-serif' }}>
              {d.label}
            </text>
            {barH > 10 && (
              <text x={x + w / 2} y={y - 2} textAnchor="middle"
                fontSize={4} fill={color} fontWeight="700"
                style={{ fontFamily: 'Manrope, sans-serif' }}>
                {d.value >= 1000 ? `${(d.value / 1000).toFixed(1)}k` : Math.round(d.value)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function GroupedBarChart({ data, height = 180 }) {
  // data: [{label, a, b}]  — two bars per group
  if (!data || data.length === 0) return null;
  const maxVal = Math.max(...data.flatMap(d => [d.a, d.b]), 1);
  const groupW = 100 / data.length;
  const barW = groupW * 0.38;
  const gap = groupW * 0.04;

  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none"
      style={{ width: '100%', height }}>
      {/* Legend */}
      <rect x={2} y={2} width={4} height={3} fill="#6366F1" rx={0.5} />
      <text x={7} y={4.8} fontSize={3.5} fill="var(--color-text-muted)"
        style={{ fontFamily: 'Work Sans, sans-serif' }}>Forecasted</text>
      <rect x={30} y={2} width={4} height={3} fill="#10B981" rx={0.5} />
      <text x={35} y={4.8} fontSize={3.5} fill="var(--color-text-muted)"
        style={{ fontFamily: 'Work Sans, sans-serif' }}>Actual (4W)</text>

      {data.map((d, i) => {
        const x0 = i * groupW + groupW * 0.06;
        const aH = Math.max(1, (d.a / maxVal) * (height - 30));
        const bH = Math.max(1, (d.b / maxVal) * (height - 30));
        const base = height - 22;
        return (
          <g key={i}>
            <rect x={x0} y={base - aH} width={barW} height={aH} fill="#6366F1" rx={0.8} opacity={0.8} />
            <rect x={x0 + barW + gap} y={base - bH} width={barW} height={bH} fill="#10B981" rx={0.8} opacity={0.8} />
            <text x={x0 + barW + gap / 2} y={base + 8} textAnchor="middle"
              fontSize={Math.min(4, groupW * 0.3)} fill="var(--color-text-muted)"
              style={{ fontFamily: 'Work Sans, sans-serif' }}>
              {d.label.length > 10 ? d.label.slice(0, 10) + '…' : d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Chart Panel ───────────────────────────────────────────────────────────────

function ForecastCharts({ chartData }) {
  if (!chartData) return null;

  const { woi_distribution: woi, stock_projection: proj, category_comparison, stockout_soon } = chartData;
  const total = (woi.red || 0) + (woi.amber || 0) + (woi.green || 0);

  const woi_bars = [
    { label: 'Red', value: woi.red || 0 },
    { label: 'Amber', value: woi.amber || 0 },
    { label: 'Green', value: woi.green || 0 },
  ];

  const proj_bars = [
    { label: 'Now', value: Math.round(proj.now || 0) },
    { label: '4 Weeks', value: Math.round(proj.w4 || 0) },
    { label: '8 Weeks', value: Math.round(proj.w8 || 0) },
    { label: '12 Weeks', value: Math.round(proj.w12 || 0) },
  ];

  const grouped = category_comparison.map(c => ({
    label: c.category,
    a: Math.round(c.forecasted_demand),
    b: Math.round(c.actual_sales),
  }));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>

      {/* WOI Distribution */}
      <div className="card">
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>WOI Distribution</div>
        {total === 0 ? (
          <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No data</div>
        ) : (
          <>
            <BarChart data={woi_bars} height={140}
              colorFn={d => d.label === 'Red' ? '#EF4444' : d.label === 'Amber' ? '#F59E0B' : '#10B981'} />
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12 }}><strong style={{ color: '#EF4444' }}>{woi.red}</strong> Red</span>
              <span style={{ fontSize: 12 }}><strong style={{ color: '#F59E0B' }}>{woi.amber}</strong> Amber</span>
              <span style={{ fontSize: 12 }}><strong style={{ color: '#10B981' }}>{woi.green}</strong> Green</span>
            </div>
          </>
        )}
      </div>

      {/* Stock Depletion Projection */}
      <div className="card">
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Stock Depletion Outlook</div>
        <BarChart data={proj_bars} height={140}
          colorFn={(d, i) => {
            const pct = proj.now > 0 ? d.value / proj.now : 1;
            if (pct < 0.4) return '#EF4444';
            if (pct < 0.7) return '#F59E0B';
            return '#6366F1';
          }} />
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'center' }}>
          Total units across all SKUs
        </div>
      </div>

      {/* Stockout Soon */}
      <div className="card">
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Nearest Stock-Outs</div>
        {stockout_soon.length === 0 ? (
          <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No SKUs at risk</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stockout_soon.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{
                  background: s.woi_status === 'red' ? '#FEE2E2' : '#FEF3C7',
                  color: s.woi_status === 'red' ? '#B91C1C' : '#92400E',
                  padding: '1px 7px', borderRadius: 4, fontWeight: 700, minWidth: 36, textAlign: 'center',
                }}>{s.days_to_stockout}d</span>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.sku_code}
                  </div>
                  <div style={{ color: 'var(--color-text-muted)', fontSize: 11,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.sku_name} · stock: {Math.round(s.current_stock)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Forecast vs Actual by Category */}
      {grouped.length > 0 && (
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
            Forecast vs Actual Sales — Last 4 Weeks (by Category)
          </div>
          <GroupedBarChart data={grouped} height={200} />
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6, textAlign: 'center' }}>
            Forecasted = DRR × 28 days &nbsp;|&nbsp; Actual = recorded sales qty in past 28 days
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SalesForecastPage() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ category: '', brand: '', woi_status: '' });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [activeBranch] = useActiveBranch();
  const [viewMode, setViewMode] = useState('both'); // 'both' | 'chart' | 'table'
  const [chartData, setChartData] = useState(null);
  const [chartLoading, setChartLoading] = useState(true);

  function load(p = 1) {
    setLoading(true);
    api.get('/reports/sales-forecast', { params: { ...filters, page: p, limit: 50, branch_id: activeBranch?.id || '' } })
      .then(r => { setData(r.data.data); setTotal(r.data.total); })
      .finally(() => setLoading(false));
  }

  function loadChart() {
    setChartLoading(true);
    api.get('/reports/sales-forecast/chart-data', { params: { branch_id: activeBranch?.id || '' } })
      .then(r => setChartData(r.data))
      .catch(() => {})
      .finally(() => setChartLoading(false));
  }

  useEffect(() => { load(1); setPage(1); }, [filters, activeBranch]);
  useEffect(() => { if (page > 1) load(page); }, [page]);
  useEffect(() => { loadChart(); }, [activeBranch]);

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

  const showChart = viewMode === 'both' || viewMode === 'chart';
  const showTable = viewMode === 'both' || viewMode === 'table';

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
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
          {/* View toggle */}
          <div style={{ display: 'flex', border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
            {[['both', 'Both'], ['chart', 'Charts'], ['table', 'Table']].map(([v, l]) => (
              <button key={v} onClick={() => setViewMode(v)} style={{
                padding: '5px 12px', fontSize: 12, border: 'none', cursor: 'pointer',
                background: viewMode === v ? 'var(--color-primary)' : 'transparent',
                color: viewMode === v ? '#fff' : 'var(--color-text)',
                fontWeight: viewMode === v ? 700 : 400,
              }}>{l}</button>
            ))}
          </div>
          <button className="btn btn-secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 12, padding: '10px 14px', background: '#EBF8FF', border: '1px solid #BEE3F8', borderRadius: 8, fontSize: 13, color: '#2A4365' }}>
        Projections based on <strong>recommended DRR</strong>. Highlighted cells indicate projected zero stock. Stock-out date = today + (current stock ÷ daily DRR).
      </div>

      {showChart && (
        chartLoading
          ? <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-muted)', fontSize: 14 }}>Loading charts…</div>
          : <ForecastCharts chartData={chartData} />
      )}

      {showTable && (
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
      )}
    </>
  );
}
