'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import DataTable from '@/components/ui/DataTable';
import Pagination from '@/components/ui/Pagination';
import api from '@/lib/api';
import { woiBadgeClass, formatDate } from '@/lib/formatters';
import { useActiveBranch } from '@/components/layout/Sidebar';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNum(n) {
  n = parseFloat(n) || 0;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toString();
}

function drrSource(row) {
  const r = parseFloat(row.drr_recommended) || 0;
  if (!r) return '—';
  const eps = 0.001;
  if (row.drr_seasonal != null && Math.abs(r - parseFloat(row.drr_seasonal)) < eps) return 'Seasonal';
  if (row.drr_4w != null && Math.abs(r - parseFloat(row.drr_4w)) < eps) return '4W';
  if (row.drr_13w != null && Math.abs(r - parseFloat(row.drr_13w)) < eps) return '13W';
  return 'Rec';
}

function stockCell(val) {
  const n = parseFloat(val) || 0;
  const color = n === 0 ? '#C53030' : n < 10 ? '#DD6B20' : 'inherit';
  return <span style={{ fontWeight: n <= 10 ? 700 : 400, color }}>{Math.round(n)}</span>;
}

function stockoutDateCell(v) {
  if (!v) return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
  const daysLeft = Math.round((new Date(v) - new Date()) / 86400000);
  const color = daysLeft <= 3 ? '#C53030' : daysLeft <= 7 ? '#DD6B20' : 'inherit';
  return <span style={{ fontWeight: 600, color }}>{v}</span>;
}

function accColor(pct) {
  if (pct >= 90) return '#10B981';
  if (pct >= 75) return '#F59E0B';
  return '#EF4444';
}

// ── CSS Bar Chart — WOI Distribution ─────────────────────────────────────────

function CssBarChart({ bars, total, height = 150, onBarClick }) {
  const maxVal = Math.max(...bars.map(b => b.value), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: height + 50, padding: '0 4px' }}>
      {bars.map(b => {
        const pct = total > 0 ? Math.round((b.value / total) * 100) : 0;
        const barH = Math.max(4, (b.value / maxVal) * height);
        return (
          <div key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: b.color, marginBottom: 2 }}>{b.value}</div>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>{pct}%</div>
            <div
              onClick={() => onBarClick?.(b)}
              onMouseEnter={e => { if (onBarClick) e.currentTarget.style.opacity = '0.75'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
              style={{
                width: '64%', height: barH, background: b.color,
                borderRadius: '6px 6px 0 0',
                cursor: onBarClick ? 'pointer' : 'default',
                transition: 'opacity 0.15s',
              }}
            />
            <div style={{ fontSize: 12, color: '#666', marginTop: 8, fontWeight: 600 }}>{b.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── SVG Line Chart — Stock Depletion ─────────────────────────────────────────

function LineChart({ points, height = 180 }) {
  if (!points || points.length < 2) return null;
  // Wide viewBox + preserveAspectRatio="none" ensures the chart fills
  // the full container width regardless of card size.
  const W = 700, H = height;
  const pad = { top: 28, right: 20, bottom: 32, left: 52 };
  const iW = W - pad.left - pad.right;
  const iH = H - pad.top - pad.bottom;
  const maxVal = Math.max(...points.map(p => p.value), 1);

  const px = i => pad.left + (i / (points.length - 1)) * iW;
  const py = v => pad.top + iH - (v / maxVal) * iH;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(p.value).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${px(points.length - 1).toFixed(1)},${(pad.top + iH).toFixed(1)} L${pad.left},${(pad.top + iH).toFixed(1)} Z`;

  const yTicks = [0, 0.5, 1].map(f => maxVal * f);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height, display: 'block' }} preserveAspectRatio="none">
      {/* grid lines + y labels */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={pad.left} y1={py(v)} x2={pad.left + iW} y2={py(v)}
            stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4,3" />
          <text x={pad.left - 6} y={py(v) + 4} textAnchor="end" fontSize="10" fill="#aaa">
            {fmtNum(v)}
          </text>
        </g>
      ))}
      {/* area */}
      <path d={areaPath} fill="rgba(99,102,241,0.07)" />
      {/* line */}
      <path d={linePath} stroke="#6366F1" strokeWidth="2.5" fill="none" strokeLinejoin="round" />
      {/* points — value label only on first and last to avoid clutter */}
      {points.map((p, i) => {
        const isEndpoint = i === 0 || i === points.length - 1;
        return (
          <g key={i}>
            <circle cx={px(i)} cy={py(p.value)} r={isEndpoint ? 5 : 3.5}
              fill="#fff" stroke="#6366F1" strokeWidth="2" />
            {isEndpoint && (
              <text x={px(i)} y={py(p.value) - 10} textAnchor="middle"
                fontSize="11" fill="#6366F1" fontWeight="700">
                {fmtNum(p.value)}
              </text>
            )}
            <text x={px(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="#888">
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Grouped Bar Chart — Forecast vs Actual ────────────────────────────────────

function GroupedBarChart({ data, height = 220 }) {
  if (!data || data.length === 0) return (
    <div style={{ padding: 30, textAlign: 'center', color: '#999', fontSize: 13 }}>No data available</div>
  );
  const maxVal = Math.max(...data.flatMap(d => [d.a, d.b]), 1);
  const barH = height - 70; // usable bar height

  return (
    <div>
      {/* legend */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 14, paddingLeft: 4 }}>
        {[['#6366F1', 'Forecast (DRR × 28d)'], ['#10B981', 'Actual (last 28d)']].map(([c, l]) => (
          <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555' }}>
            <span style={{ width: 12, height: 12, background: c, borderRadius: 2, display: 'inline-block' }} />
            {l}
          </span>
        ))}
      </div>
      {/* chart */}
      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div style={{ display: 'flex', gap: 6, minWidth: Math.max(data.length * 80, 400), alignItems: 'flex-end', height: height }}>
          {data.map((d, i) => {
            const aH = Math.max(2, (d.a / maxVal) * barH);
            const bH = Math.max(2, (d.b / maxVal) * barH);
            const acc = d.a > 0 ? Math.round((d.b / d.a) * 100) : null;
            const ac = acc !== null ? accColor(acc) : '#aaa';
            return (
              <div key={i} style={{ flex: 1, minWidth: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                {/* bars */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, width: '75%', marginBottom: 6 }}>
                  <div title={`Forecast: ${Math.round(d.a)}`}
                    style={{ flex: 1, height: aH, background: '#6366F1', borderRadius: '4px 4px 0 0', opacity: 0.85 }} />
                  <div title={`Actual: ${Math.round(d.b)}`}
                    style={{ flex: 1, height: bH, background: '#10B981', borderRadius: '4px 4px 0 0', opacity: 0.85 }} />
                </div>
                {/* accuracy badge */}
                <div style={{ fontSize: 11, fontWeight: 700, color: ac, marginBottom: 3 }}>
                  {acc !== null ? `${acc}%` : '—'}
                </div>
                {/* label */}
                <div style={{ fontSize: 10, color: '#666', textAlign: 'center',
                  maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', padding: '0 2px' }}>
                  {d.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── KPI Tile ──────────────────────────────────────────────────────────────────

function KpiTile({ label, value, sub, color, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '14px 16px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
      border: `2px solid ${active ? color : 'var(--color-border)'}`,
      background: active ? `${color}14` : 'var(--color-surface)',
      transition: 'border-color 0.15s, background 0.15s',
    }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 5, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: active ? color : 'var(--color-text)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: active ? color : '#999', marginTop: 4 }}>{sub}</div>}
    </button>
  );
}

// ── KPI Detail Panel ──────────────────────────────────────────────────────────

function KpiPanel({ type, chartData, onClose }) {
  if (!chartData) return null;
  const tblStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 12 };
  const thStyle = { textAlign: 'left', padding: '7px 10px', color: '#888', fontWeight: 600, borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' };
  const tdStyle = { padding: '7px 10px', borderBottom: '1px solid var(--color-border)' };
  const tdR = { ...tdStyle, textAlign: 'right' };

  let title, color, content;

  if (type === 'red' || type === 'amber') {
    const skus = type === 'red' ? chartData.red_skus : chartData.amber_skus;
    color = type === 'red' ? '#EF4444' : '#F59E0B';
    title = type === 'red' ? 'Red WOI — Critical SKUs (ordered by lowest WOI)' : 'Amber WOI — Low Stock SKUs';
    content = skus.length === 0
      ? <div style={{ padding: '16px 0', color: '#999', fontSize: 13 }}>No SKUs in this bucket</div>
      : (
        <div style={{ overflowX: 'auto' }}>
          <table style={tblStyle}>
            <thead>
              <tr>
                <th style={thStyle}>SKU Code</th>
                <th style={thStyle}>SKU Name</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>WOI (wk)</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Stock</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>DRR/day</th>
                {type === 'red' && <th style={{ ...thStyle, textAlign: 'right' }}>Suggested Order</th>}
              </tr>
            </thead>
            <tbody>
              {skus.map((s, i) => (
                <tr key={i}>
                  <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{s.sku_code}</span></td>
                  <td style={tdStyle}>{s.sku_name}</td>
                  <td style={{ ...tdR, color, fontWeight: 700 }}>{parseFloat(s.woi || 0).toFixed(1)}</td>
                  <td style={tdR}>{Math.round(s.current_stock)}</td>
                  <td style={tdR}>{parseFloat(s.drr_recommended || 0).toFixed(2)}</td>
                  {type === 'red' && <td style={{ ...tdR, fontWeight: 700, color: 'var(--color-primary)' }}>{s.suggested_order_qty || '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  } else if (type === 'stockout7d') {
    color = '#EF4444';
    title = 'Stock-out ≤ 7 Days — Immediate Action Required';
    const skus = chartData.stockout_7d;
    content = skus.length === 0
      ? <div style={{ padding: '16px 0', color: '#999', fontSize: 13 }}>No SKUs at risk of stock-out within 7 days</div>
      : (
        <div style={{ overflowX: 'auto' }}>
          <table style={tblStyle}>
            <thead>
              <tr>
                <th style={thStyle}>SKU Code</th>
                <th style={thStyle}>SKU Name</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Days Left</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Stock</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>DRR/day</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Required Order</th>
              </tr>
            </thead>
            <tbody>
              {skus.map((s, i) => (
                <tr key={i}>
                  <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{s.sku_code}</span></td>
                  <td style={tdStyle}>{s.sku_name}</td>
                  <td style={tdR}>
                    <span style={{
                      background: s.days_to_stockout <= 3 ? '#FEE2E2' : '#FEF3C7',
                      color: s.days_to_stockout <= 3 ? '#B91C1C' : '#92400E',
                      padding: '2px 8px', borderRadius: 4, fontWeight: 700,
                    }}>{s.days_to_stockout}d</span>
                  </td>
                  <td style={tdR}>{Math.round(s.current_stock)}</td>
                  <td style={tdR}>{parseFloat(s.drr_recommended || 0).toFixed(2)}</td>
                  <td style={{ ...tdR, fontWeight: 700, color: 'var(--color-primary)' }}>{s.suggested_order_qty || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  } else {
    return null;
  }

  return (
    <div style={{
      background: 'var(--color-surface)', border: `1px solid ${color}40`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 10, padding: '14px 16px', marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color }}>{title}</div>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 10px' }} onClick={onClose}>✕ Close</button>
      </div>
      {content}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SalesForecastPage() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ category: '', brand: '', sku_search: '', woi_status: '' });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [activeBranch] = useActiveBranch();
  const [viewMode, setViewMode] = useState('both');
  const [chartData, setChartData] = useState(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [activeKpi, setActiveKpi] = useState(null); // null | 'red' | 'amber' | 'stockout7d'
  const [fvaMode, setFvaMode] = useState('category'); // 'category' | 'brand'

  function load(p = 1) {
    setLoading(true);
    api.get('/reports/sales-forecast', {
      params: { ...filters, page: p, limit: 50, branch_id: activeBranch?.id || '' }
    }).then(r => { setData(r.data.data); setTotal(r.data.total); })
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

  function handleKpiClick(type) {
    if (activeKpi === type) {
      setActiveKpi(null);
      if (type === 'red' || type === 'amber') setFilters(f => ({ ...f, woi_status: '' }));
    } else {
      setActiveKpi(type);
      if (type === 'red')   setFilters(f => ({ ...f, woi_status: 'red' }));
      if (type === 'amber') setFilters(f => ({ ...f, woi_status: 'amber' }));
      // stockout7d: panel only, no table filter change (computed field)
    }
  }

  function clearFilters() {
    setFilters({ category: '', brand: '', sku_search: '', woi_status: '' });
    setActiveKpi(null);
  }

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

  const showChart = viewMode === 'both' || viewMode === 'chart';
  const showTable = viewMode === 'both' || viewMode === 'table';

  const kpi  = chartData?.kpi || {};
  const woi  = chartData?.woi_distribution || {};
  const proj = chartData?.stock_projection || {};

  const fvaData = (fvaMode === 'brand'
    ? chartData?.brand_comparison || []
    : chartData?.category_comparison || []
  ).map(d => ({
    label: fvaMode === 'brand' ? d.brand : d.category,
    a: d.forecasted_demand,
    b: d.actual_sales,
  }));

  const projPoints = [
    { label: 'Now', value: proj.now || 0 },
    { label: 'W1',  value: proj.w1  || 0 },
    { label: 'W2',  value: proj.w2  || 0 },
    { label: 'W3',  value: proj.w3  || 0 },
    { label: 'W4',  value: proj.w4  || 0 },
    { label: 'W5',  value: proj.w5  || 0 },
    { label: 'W6',  value: proj.w6  || 0 },
    { label: 'W7',  value: proj.w7  || 0 },
    { label: 'W8',  value: proj.w8  || 0 },
    { label: 'W9',  value: proj.w9  || 0 },
    { label: 'W10', value: proj.w10 || 0 },
    { label: 'W11', value: proj.w11 || 0 },
    { label: 'W12', value: proj.w12 || 0 },
  ];

  const woiBars = [
    { label: 'Red',   value: woi.red   || 0, color: '#EF4444' },
    { label: 'Amber', value: woi.amber || 0, color: '#F59E0B' },
    { label: 'Green', value: woi.green || 0, color: '#10B981' },
  ];
  const woiTotal = (woi.red || 0) + (woi.amber || 0) + (woi.green || 0);
  const hasFilters = filters.category || filters.brand || filters.sku_search || filters.woi_status;

  return (
    <>
      <Topbar
        title="Sales Forecast Report"
        subtitle="Projected stock levels at 4W, 8W, 12W based on current DRR"
      />

      {/* ── Filter Bar ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="form-input" placeholder="Category" value={filters.category}
            onChange={e => setFilters(f => ({ ...f, category: e.target.value }))} style={{ width: 130 }} />
          <input className="form-input" placeholder="Brand" value={filters.brand}
            onChange={e => setFilters(f => ({ ...f, brand: e.target.value }))} style={{ width: 130 }} />
          <input className="form-input" placeholder="Search SKU code / name…" value={filters.sku_search}
            onChange={e => setFilters(f => ({ ...f, sku_search: e.target.value }))} style={{ width: 210 }} />
          <select className="form-input" value={filters.woi_status}
            onChange={e => { setFilters(f => ({ ...f, woi_status: e.target.value })); setActiveKpi(null); }}
            style={{ width: 140 }}>
            <option value="">All WOI Status</option>
            <option value="red">Red (Critical)</option>
            <option value="amber">Amber (Low)</option>
            <option value="green">Green (OK)</option>
          </select>
          {hasFilters && (
            <button className="btn btn-ghost" onClick={clearFilters} style={{ fontSize: 12, padding: '5px 12px' }}>
              Clear ✕
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
          <div style={{ display: 'flex', border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
            {[['both', 'Both'], ['chart', 'Charts'], ['table', 'Table']].map(([v, l]) => (
              <button key={v} onClick={() => setViewMode(v)} style={{
                padding: '5px 14px', fontSize: 12, border: 'none', cursor: 'pointer',
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

      {/* ── Charts ────────────────────────────────────────────────────────── */}
      {showChart && (
        chartLoading
          ? <div style={{ textAlign: 'center', padding: 48, color: '#999', fontSize: 14 }}>Loading charts…</div>
          : (
            <>
              {/* KPI Strip */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <KpiTile label="Total SKUs" value={kpi.total_skus || 0}
                  color="var(--color-primary)" active={false} onClick={clearFilters} />
                <KpiTile label="Red WOI" value={kpi.red_count || 0}
                  sub={`${kpi.red_pct || 0}% of total`} color="#EF4444"
                  active={activeKpi === 'red'} onClick={() => handleKpiClick('red')} />
                <KpiTile label="Amber WOI" value={kpi.amber_count || 0}
                  sub={`${kpi.amber_pct || 0}% of total`} color="#F59E0B"
                  active={activeKpi === 'amber'} onClick={() => handleKpiClick('amber')} />
                <KpiTile label="Stock-out ≤ 7 days" value={kpi.stockout_7d_count || 0}
                  sub="SKUs at immediate risk" color="#EF4444"
                  active={activeKpi === 'stockout7d'} onClick={() => handleKpiClick('stockout7d')} />
                <KpiTile label="Pre-season Alerts" value={0}
                  sub="No active alerts" color="#6366F1"
                  active={false} onClick={() => {}} />
              </div>

              {/* KPI Detail Panel */}
              {activeKpi && (
                <KpiPanel type={activeKpi} chartData={chartData} onClose={() => {
                  setActiveKpi(null);
                  if (activeKpi === 'red' || activeKpi === 'amber')
                    setFilters(f => ({ ...f, woi_status: '' }));
                }} />
              )}

              {/* Row 2: Two equal charts side by side */}
              {/* 30/70 split: WOI narrower, Depletion wider */}
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 7fr', gap: 16, marginBottom: 16, alignItems: 'start' }}>

                {/* WOI Distribution — natural height, no fixed constraint */}
                <div className="card" style={{ paddingBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>WOI Distribution</div>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 14 }}>Click a bar to filter the table</div>
                  {woiTotal === 0
                    ? <div style={{ padding: '30px 0', textAlign: 'center', color: '#999', fontSize: 13 }}>No data</div>
                    : <CssBarChart bars={woiBars} total={woiTotal} height={170}
                        onBarClick={b => {
                          const v = b.label.toLowerCase();
                          if (filters.woi_status === v) {
                            setFilters(f => ({ ...f, woi_status: '' }));
                            setActiveKpi(null);
                          } else {
                            setFilters(f => ({ ...f, woi_status: v }));
                            setActiveKpi(v === 'red' ? 'red' : v === 'amber' ? 'amber' : null);
                          }
                        }}
                      />
                  }
                </div>

                {/* Stock Depletion Outlook — chart fills full card width */}
                <div className="card">
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Stock Depletion Outlook</div>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 12 }}>
                    Σ MAX(0, stock − DRR × days) across all SKUs
                  </div>
                  <LineChart points={projPoints} height={220} />
                </div>
              </div>

              {/* Row 3: Nearest Stock-Outs — full-width horizontal table */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Nearest Stock-Outs</div>
                </div>
                {!(chartData?.stockout_soon?.length)
                  ? <div style={{ padding: '20px 0', textAlign: 'center', color: '#999', fontSize: 13 }}>No SKUs at immediate risk</div>
                  : (
                    <>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                            {[['Days', 'center', 70], ['SKU Name', 'left', null], ['SKU Code', 'left', 110], ['Stock', 'right', 80], ['DRR/day', 'right', 90], ['Order Qty', 'right', 90]].map(([h, a, w]) => (
                              <th key={h} style={{ padding: '8px 10px', textAlign: a, color: '#888', fontWeight: 600, whiteSpace: 'nowrap', width: w || 'auto' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {chartData.stockout_soon.slice(0, 10).map((s, i) => (
                            <tr key={i}
                              onClick={() => handleKpiClick('stockout7d')}
                              style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface2)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                                <span style={{
                                  background: s.days_to_stockout <= 3 ? '#FEE2E2' : '#FEF3C7',
                                  color: s.days_to_stockout <= 3 ? '#B91C1C' : '#92400E',
                                  padding: '3px 10px', borderRadius: 5, fontWeight: 700, fontSize: 11,
                                }}>{s.days_to_stockout}d</span>
                              </td>
                              <td style={{ padding: '9px 10px', fontWeight: 600 }}>{s.sku_name}</td>
                              <td style={{ padding: '9px 10px', fontFamily: 'monospace', color: '#666' }}>{s.sku_code}</td>
                              <td style={{ padding: '9px 10px', textAlign: 'right' }}>{Math.round(s.current_stock)}</td>
                              <td style={{ padding: '9px 10px', textAlign: 'right', color: '#666' }}>{parseFloat(s.drr_recommended || 0).toFixed(2)}</td>
                              <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: s.suggested_order_qty > 0 ? 'var(--color-primary)' : '#aaa' }}>
                                {s.suggested_order_qty > 0 ? s.suggested_order_qty : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ textAlign: 'right', marginTop: 10 }}>
                        <button className="btn btn-ghost" style={{ fontSize: 12 }}
                          onClick={() => handleKpiClick('stockout7d')}>
                          View all stock-out risks →
                        </button>
                      </div>
                    </>
                  )
                }
              </div>

              {/* Forecast vs Actual — Full Width */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Forecast vs Actual Sales — Last 4 Weeks</div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 3 }}>
                      Forecast = DRR × 28d · Actual = recorded sales qty · Accuracy = Actual ÷ Forecast
                      &nbsp;<span style={{ color: '#10B981', fontWeight: 700 }}>≥90%</span>
                      &nbsp;<span style={{ color: '#F59E0B', fontWeight: 700 }}>≥75%</span>
                      &nbsp;<span style={{ color: '#EF4444', fontWeight: 700 }}>&lt;75%</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                    {[['category', 'By Category'], ['brand', 'By Brand']].map(([v, l]) => (
                      <button key={v} onClick={() => setFvaMode(v)} style={{
                        padding: '5px 14px', fontSize: 12, border: 'none', cursor: 'pointer',
                        background: fvaMode === v ? 'var(--color-primary)' : 'transparent',
                        color: fvaMode === v ? '#fff' : 'var(--color-text)',
                        fontWeight: fvaMode === v ? 700 : 400,
                      }}>{l}</button>
                    ))}
                  </div>
                </div>
                <GroupedBarChart data={fvaData} height={230} />
              </div>
            </>
          )
      )}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      {showTable && (
        <>
          <div style={{
            marginBottom: 12, padding: '10px 14px',
            background: '#EBF8FF', border: '1px solid #BEE3F8', borderRadius: 8,
            fontSize: 13, color: '#2A4365',
          }}>
            Projections based on <strong>recommended DRR</strong>. Red = zero/critical stock.
            Stock-out date = today + (current stock ÷ daily DRR). DRR source shown below each value.
          </div>
          <DataTable
            loading={loading}
            emptyText="No forecast data. Run a forecast recompute first."
            columns={[
              { key: 'sku_code', label: 'SKU Code', width: 105 },
              { key: 'sku_name', label: 'SKU Name' },
              { key: 'brand', label: 'Brand', width: 85 },
              { key: 'category', label: 'Category', width: 110 },
              {
                key: 'current_stock', label: 'Stock Now', width: 90,
                render: v => <strong>{parseFloat(v || 0).toFixed(0)}</strong>
              },
              {
                key: 'drr_recommended', label: 'DRR/day', width: 95,
                render: (v, row) => (
                  <div>
                    <div>{parseFloat(v || 0).toFixed(2)}</div>
                    <div style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>{drrSource(row)}</div>
                  </div>
                )
              },
              {
                key: 'woi_status', label: 'WOI', width: 72,
                render: v => v ? <span className={woiBadgeClass(v)}>{v.toUpperCase()}</span> : '—'
              },
              { key: 'proj_4w',  label: '4W Stock',  width: 85, render: v => stockCell(v) },
              { key: 'proj_8w',  label: '8W Stock',  width: 85, render: v => stockCell(v) },
              { key: 'proj_12w', label: '12W Stock', width: 90, render: v => stockCell(v) },
              {
                key: 'stockout_date', label: 'Stock-Out Date', width: 125,
                render: v => stockoutDateCell(v)
              },
              {
                key: 'suggested_order_qty', label: 'Suggested Order', width: 125,
                render: v => (parseInt(v) || 0) > 0
                  ? <strong style={{ color: 'var(--color-primary)' }}>{v}</strong>
                  : '—'
              },
            ]}
            data={data}
            footer={<Pagination page={page} total={total} limit={50} onChange={setPage} />}
          />
        </>
      )}
    </>
  );
}
