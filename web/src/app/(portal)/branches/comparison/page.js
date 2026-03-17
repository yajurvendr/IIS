'use client';
import { useEffect, useState, useCallback } from 'react';
import Topbar from '@/components/layout/Topbar';
import api from '@/lib/api';

const INR = v => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const NUM = v => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const TABS = [
  { key: 'stock',         label: 'Stock',          desc: 'Effective stock across branches' },
  { key: 'sales',         label: 'Sales',           desc: 'Revenue & quantity per branch' },
  { key: 'profitability', label: 'Profitability',   desc: 'Gross margin % per branch' },
  { key: 'top-skus',      label: 'Top SKUs',        desc: 'Best sellers per branch' },
];

const PERIOD_OPTIONS = {
  sales:         [{ v: 'mtd', l: 'This Month' }, { v: 'last_month', l: 'Last Month' }, { v: 'last_13w', l: '13 Weeks' }, { v: 'last_26w', l: '26 Weeks' }],
  profitability: [{ v: 'last_13w', l: '13 Weeks' }, { v: 'last_26w', l: '26 Weeks' }, { v: 'last_52w', l: '52 Weeks' }],
  'top-skus':    [{ v: 'mtd', l: 'This Month' }, { v: 'last_13w', l: '13 Weeks' }, { v: 'last_26w', l: '26 Weeks' }, { v: 'last_52w', l: '52 Weeks' }],
};

export default function BranchComparisonPage() {
  const [tab, setTab]           = useState('stock');
  const [branches, setBranches] = useState([]);
  const [data, setData]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [period, setPeriod]     = useState('mtd');
  const [page, setPage]         = useState(1);
  const LIMIT = 50;

  const load = useCallback(() => {
    setLoading(true);
    const params = { page, limit: LIMIT };
    if (category) params.category = category;
    if (tab !== 'stock') params.period = period;

    const endpoint = tab === 'top-skus' ? '/branches/comparison/top-skus' : `/branches/comparison/${tab}`;
    api.get(endpoint, { params })
      .then(r => {
        setBranches(r.data.branches || []);
        setData(r.data.data || []);
        setTotal(r.data.total || 0);
      })
      .finally(() => setLoading(false));
  }, [tab, page, category, period]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (data.length > 0 && tab !== 'top-skus') {
      const cats = [...new Set(data.map(r => r.category).filter(Boolean))].sort();
      setCategories(cats);
    }
  }, [data, tab]);

  function handleTabChange(t) {
    setTab(t);
    setPage(1);
    setSearch('');
    setCategory('');
    setPeriod(t === 'profitability' ? 'last_13w' : 'mtd');
    setData([]);
    setBranches([]);
    setLoading(true);
  }

  const filtered = tab === 'top-skus' ? data : data.filter(r => {
    if (search && !r.sku_code?.toLowerCase().includes(search.toLowerCase()) &&
        !r.sku_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function exportCsv() {
    const params = new URLSearchParams({ period });
    if (category) params.set('category', category);
    const ep = tab === 'top-skus' ? 'top-skus' : tab;
    window.open(`${process.env.NEXT_PUBLIC_API_URL}/branches/comparison/${ep}/export?${params}`, '_blank');
  }

  const activeTab = TABS.find(t => t.key === tab);

  return (
    <>
      <Topbar title="Branch Comparison" subtitle={activeTab?.desc} />

      {/* Tab nav */}
      <div className="card" style={{ padding: 0, marginBottom: 20, overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => handleTabChange(t.key)} style={{
              flex: 1, padding: '14px 16px', border: 'none', cursor: 'pointer',
              background: tab === t.key ? 'var(--surface)' : 'var(--surface2)',
              borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              fontWeight: tab === t.key ? 700 : 500,
              fontSize: 13, color: tab === t.key ? 'var(--accent)' : 'var(--text2)',
              transition: 'all 0.15s',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
          {tab !== 'top-skus' && (
            <input className="form-input" style={{ width: 220, height: 34, padding: '6px 12px' }}
              placeholder="Search SKU…" value={search} onChange={e => setSearch(e.target.value)} />
          )}
          {tab !== 'top-skus' && categories.length > 0 && (
            <select className="form-input form-select" style={{ width: 180, height: 34 }}
              value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}>
              <option value="">All categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {PERIOD_OPTIONS[tab] && (
            <select className="form-input form-select" style={{ width: 148, height: 34 }}
              value={period} onChange={e => { setPeriod(e.target.value); setPage(1); }}>
              {PERIOD_OPTIONS[tab].map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          )}
          {tab === 'stock' && (
            <span style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>
              Effective = snapshot + purchases − sales ± transfers
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary btn-sm" onClick={exportCsv}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 1v7M4 6l2.5 2.5L9 6M2 11h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Export CSV
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            <div style={{ width: 24, height: 24, border: '2.5px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            Loading…
          </div>
        ) : tab === 'top-skus' ? (
          <TopSkusView data={filtered} />
        ) : (
          <MatrixView tab={tab} branches={branches} data={filtered} />
        )}
      </div>

      {/* Pagination */}
      {tab !== 'top-skus' && total > LIMIT && (
        <div className="pagination">
          <button onClick={() => setPage(p => p - 1)} disabled={page === 1}>← Prev</button>
          <span style={{ padding: '5px 12px', fontSize: 12, color: 'var(--text2)' }}>
            {page} / {Math.ceil(total / LIMIT)}
          </span>
          <button onClick={() => setPage(p => p + 1)} disabled={page * LIMIT >= total}>Next →</button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

// ── SKU matrix table (Stock / Sales / Profitability) ─────────────────────────

function MatrixView({ tab, branches, data }) {
  if (!data.length) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
        No data found for this selection
      </div>
    );
  }
  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th style={{ minWidth: 180 }}>SKU</th>
            <th>Category</th>
            {branches.map(b => (
              <th key={b.id} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {b.branch_code}
                <div style={{ fontWeight: 400, fontSize: 10, color: 'var(--text3)', textTransform: 'none', letterSpacing: 0 }}>{b.branch_name}</div>
              </th>
            ))}
            {tab !== 'profitability' && (
              <th style={{ textAlign: 'right', background: 'var(--blue-bg)' }}>Total</th>
            )}
          </tr>
        </thead>
        <tbody>
          {data.map(row => {
            const rowTotal = tab === 'stock'
              ? branches.reduce((s, b) => s + (row.branches?.[b.id]?.effective_stock || 0), 0)
              : tab === 'sales'
              ? branches.reduce((s, b) => s + (row.branches?.[b.id]?.revenue || 0), 0)
              : null;
            return (
              <tr key={row.sku_id}>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{row.sku_code}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{row.sku_name}</div>
                </td>
                <td><span style={{ fontSize: 12, color: 'var(--text2)' }}>{row.category || '—'}</span></td>
                {branches.map(b => (
                  <td key={b.id} style={{ textAlign: 'right' }}>
                    {tab === 'stock'  && <StockCell  bd={row.branches?.[b.id]} />}
                    {tab === 'sales'  && <SalesCell  bd={row.branches?.[b.id]} />}
                    {tab === 'profitability' && <ProfitCell bd={row.branches?.[b.id]} />}
                  </td>
                ))}
                {tab !== 'profitability' && (
                  <td style={{ textAlign: 'right', fontWeight: 700, background: 'var(--blue-bg)', color: 'var(--blue)' }}>
                    {tab === 'stock' ? NUM(rowTotal) : `₹${INR(rowTotal)}`}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StockCell({ bd }) {
  const qty = bd?.effective_stock ?? null;
  if (qty === null) return <span style={{ color: 'var(--text3)' }}>—</span>;
  const color = qty <= 0 ? 'var(--red)' : qty < 5 ? 'var(--amber)' : 'var(--text)';
  return (
    <div>
      <span style={{ fontWeight: 600, color }}>{NUM(qty)}</span>
      {bd?.last_snapshot_date && (
        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>as of {bd.last_snapshot_date}</div>
      )}
    </div>
  );
}

function SalesCell({ bd }) {
  if (!bd || (bd.revenue === 0 && bd.qty === 0)) return <span style={{ color: 'var(--text3)' }}>—</span>;
  return (
    <div>
      <div style={{ fontWeight: 600 }}>₹{INR(bd.revenue)}</div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{NUM(bd.qty)} units</div>
    </div>
  );
}

function ProfitCell({ bd }) {
  if (!bd || bd.revenue === 0) return <span style={{ color: 'var(--text3)' }}>—</span>;
  const pct = bd.margin_pct;
  const color = pct === null ? 'var(--text3)' : pct < 10 ? 'var(--red)' : pct < 20 ? 'var(--amber)' : 'var(--green)';
  const bg    = pct === null ? 'transparent' : pct < 10 ? 'var(--red-bg)' : pct < 20 ? 'var(--amber-bg)' : 'var(--green-bg)';
  return (
    <div>
      <span style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: 20,
        fontWeight: 700, fontSize: 12, color, background: bg,
      }}>
        {pct !== null ? `${pct}%` : '—'}
      </span>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>₹{INR(bd.revenue)}</div>
    </div>
  );
}

// ── Top SKUs grid ─────────────────────────────────────────────────────────────

function TopSkusView({ data }) {
  if (!data.length) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
        No sales data available for this period
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 1, background: 'var(--border)' }}>
      {data.map(branch => (
        <div key={branch.branch_id} style={{ background: 'var(--surface)' }}>
          {/* Branch header */}
          <div style={{
            padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10,
            borderBottom: '1px solid var(--border)', background: 'var(--surface2)',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'var(--accent)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800, flexShrink: 0,
            }}>
              {branch.branch_code?.[0] || 'B'}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{branch.branch_code}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{branch.branch_name}</div>
            </div>
          </div>

          {branch.top_skus.length === 0 ? (
            <div style={{ padding: '20px 20px', fontSize: 13, color: 'var(--text3)' }}>No sales in this period</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ width: 32, paddingLeft: 20 }}>#</th>
                  <th>SKU</th>
                  <th style={{ textAlign: 'right' }}>Revenue</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                </tr>
              </thead>
              <tbody>
                {branch.top_skus.map((sku, i) => (
                  <tr key={sku.sku_id}>
                    <td style={{ paddingLeft: 20, color: 'var(--text3)', fontWeight: 700, fontSize: 12 }}>{i + 1}</td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{sku.sku_code}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{sku.sku_name}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontSize: 13 }}>₹{INR(sku.revenue)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text2)', fontSize: 12 }}>{NUM(sku.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}
