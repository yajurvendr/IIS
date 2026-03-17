'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import api from '@/lib/api';
import { useActiveBranch } from '@/components/layout/Sidebar';

/* ── Formatters ──────────────────────────────────────────────────────────── */
function formatL(n) {
  if (!n && n !== 0) return '₹0';
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}
function fmt(n, dec = 1) {
  return n != null ? parseFloat(n).toFixed(dec) : '—';
}
function monthLabel(m) {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return MONTHS[(parseInt(m, 10) - 1) % 12] || m;
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeBranch] = useActiveBranch();

  useEffect(() => {
    setLoading(true);
    api.get('/dashboard', { params: { branch_id: activeBranch?.id || '' } })
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, [activeBranch]);

  const d = data || {};
  const aging = d.outstanding_aging || {};
  const totalOutstanding = Object.values(aging).reduce((s, v) => typeof v === 'number' && v > 0 ? s + v : s, 0);

  const marginPct = d.overall_margin_pct;
  const redSkus = d.red_skus ?? 0;
  const amberSkus = d.amber_skus ?? 0;
  const greenSkus = d.green_skus ?? 0;

  return (
    <>
      <Topbar title="Dashboard Overview" />
      <div>

        {/* ── KPI Cards ──────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
          <KpiCard
            label="TOTAL SKUS"
            value={loading ? '—' : (d.total_skus ?? 0).toLocaleString('en-IN')}
            sub={`${d.focus_skus ?? 0} focus SKUs`}
            barColor="var(--accent2)"
            barPct={100}
          />
          <KpiCard
            label="MTD SALES"
            value={loading ? '—' : formatL(d.mtd_sales ?? 0)}
            sub="Current month to date"
            barColor="var(--accent)"
            barPct={75}
          />
          <KpiCard
            label="MTD PURCHASES"
            value={loading ? '—' : formatL(d.mtd_purchases ?? 0)}
            sub="Current month to date"
            barColor="var(--purple)"
            barPct={60}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          <KpiCard
            label="CRITICAL STOCK-OUTS"
            value={loading ? '—' : redSkus}
            sub={redSkus > 0 ? '↑ Action needed now' : '✓ All clear'}
            subColor={redSkus > 0 ? 'var(--red)' : 'var(--green)'}
            barColor="var(--red)"
            barPct={redSkus > 0 ? Math.min(redSkus * 10, 100) : 0}
          />
          <KpiCard
            label="AMBER WOI SKUS"
            value={loading ? '—' : amberSkus}
            sub="Monitor — 4–8 weeks left"
            subColor={amberSkus > 0 ? 'var(--amber)' : 'var(--text3)'}
            barColor="var(--amber)"
            barPct={amberSkus > 0 ? Math.min(amberSkus * 3, 100) : 0}
          />
          <KpiCard
            label="OVERALL MARGIN"
            value={loading ? '—' : marginPct != null ? `${marginPct}%` : 'N/A'}
            sub={marginPct != null ? 'Gross margin MTD' : 'Add cost data to SKUs'}
            subColor={marginPct != null ? 'var(--green)' : 'var(--text3)'}
            barColor="var(--green)"
            barPct={marginPct != null ? Math.min(marginPct, 100) : 0}
          />
        </div>

        {/* ── Main 2-column ──────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>

          {/* LEFT: Inventory Health WOI Summary */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: 'Manrope, sans-serif' }}>Inventory Health — WOI Summary</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Weeks of inventory across all active SKUs</div>
              </div>
              <Link href="/inventory" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500, whiteSpace: 'nowrap' }}>View full →</Link>
            </div>

            {/* RAG row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
              <RagMini color="var(--red)" bg="var(--red-bg)" border="var(--red-border)"
                value={loading ? '—' : redSkus} label="RED — <4 WKS" />
              <RagMini color="var(--amber)" bg="var(--amber-bg)" border="var(--amber-border)"
                value={loading ? '—' : amberSkus} label="AMBER — 4–8 WKS" />
              <RagMini color="var(--green)" bg="var(--green-bg)" border="var(--green-border)"
                value={loading ? '—' : greenSkus} label="GREEN — >8 WKS" />
            </div>

            {/* WOI Table */}
            {loading ? <TableSkeleton cols={6} rows={6} /> : !d.woi_skus?.length ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                No red/amber SKUs — inventory looks healthy!
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>SKU</th>
                      <th>NAME</th>
                      <th style={{ textAlign: 'right' }}>STOCK</th>
                      <th style={{ textAlign: 'right' }}>DRR</th>
                      <th style={{ textAlign: 'right' }}>WOI</th>
                      <th style={{ textAlign: 'right' }}>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.woi_skus.map(s => (
                      <tr key={s.sku_code}>
                        <td>
                          <div style={{ fontSize: 9, color: 'var(--text3)', lineHeight: 1 }}>{s.sku_code?.slice(0,4)}</div>
                          <div style={{ fontSize: 9, color: 'var(--text3)' }}>{s.sku_code?.slice(4)}</div>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text)', maxWidth: 160 }}>
                          <div className="truncate">{s.sku_name}</div>
                        </td>
                        <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text2)' }}>{Math.round(s.current_stock ?? 0)}</td>
                        <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text2)' }}>{fmt(s.drr_recommended)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{
                            fontSize: 12, fontWeight: 700,
                            color: s.woi_status === 'red' ? 'var(--red)' : 'var(--amber)',
                          }}>{fmt(s.woi)}w</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700,
                            color: s.woi_status === 'red' ? 'var(--red)' : 'var(--amber)',
                          }}>{s.woi_status?.toUpperCase()}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* RIGHT column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Pre-Season Alerts */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'Manrope, sans-serif' }}>⚡ Pre-Season Alerts</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                    {loading ? '—' : `${d.seasonal_alerts?.length || 0} seasons within ordering horizon`}
                  </div>
                </div>
                <Link href="/seasonal/pre-season-alert" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>View →</Link>
              </div>
              {loading ? <Skeleton rows={3} /> : !d.seasonal_alerts?.length ? (
                <div style={{ fontSize: 13, color: 'var(--text3)', padding: '8px 0' }}>No upcoming season alerts</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {d.seasonal_alerts.slice(0, 4).map((s, i) => {
                    const colors = [
                      { text: 'var(--accent2)', bg: '#EFF6FF', border: 'var(--blue-border)', range: `${monthLabel(s.start_month)}–${monthLabel(s.end_month)}` },
                      { text: 'var(--amber)',   bg: 'var(--amber-bg)', border: 'var(--amber-border)', range: `${monthLabel(s.start_month)}–${monthLabel(s.end_month)}` },
                      { text: 'var(--purple)',  bg: 'var(--purple-bg)', border: 'var(--purple-border)', range: `${monthLabel(s.start_month)}–${monthLabel(s.end_month)}` },
                      { text: 'var(--green)',   bg: 'var(--green-bg)', border: 'var(--green-border)', range: `${monthLabel(s.start_month)}–${monthLabel(s.end_month)}` },
                    ][i % 4];
                    return (
                      <div key={s.name} style={{
                        padding: '10px 12px', borderRadius: 8,
                        background: colors.bg, border: `1px solid ${colors.border}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: colors.text }}>{s.name}</div>
                          <div style={{ fontSize: 10, color: colors.text, background: 'rgba(255,255,255,0.6)', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                            {colors.range}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>
                          {s.sku_count} SKUs · Gap: <strong>{s.gap_units} units</strong>
                        </div>
                        {s.latest_order_date && (
                          <div style={{ fontSize: 11, color: colors.text, display: 'flex', alignItems: 'center', gap: 4 }}>
                            🕐 Order by {new Date(s.latest_order_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Customer Outstanding */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'Manrope, sans-serif' }}>Customer Outstanding</div>
                <Link href="/outstanding" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>View →</Link>
              </div>
              {loading ? <Skeleton rows={2} /> : (
                <>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    {[
                      { label: '0–30 days',  val: aging.b0_30,   color: 'var(--green)' },
                      { label: '31–60 days', val: aging.b31_60,  color: 'var(--accent2)' },
                      { label: '61–90 days', val: aging.b61_90,  color: 'var(--amber)' },
                      { label: '91–180 d',   val: aging.b91_180, color: '#E05C2A' },
                      { label: '180+ days',  val: aging.b180plus,color: 'var(--red)' },
                    ].map(b => (
                      <div key={b.label} style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: b.color, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '-0.03em' }}>
                          {formatL(b.val)}
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2, lineHeight: 1.2 }}>{b.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                    Total outstanding: <strong style={{ color: 'var(--text)' }}>{formatL(aging.b0_30 + aging.b31_60 + aging.b61_90 + aging.b91_180 + aging.b180plus)}</strong>
                    {' '}across <strong>{aging.customers}</strong> customers
                  </div>
                </>
              )}
            </div>

          </div>
        </div>

        {/* ── Bottom section ──────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, marginTop: 16 }}>

          {/* Top SKUs by Gross Margin % */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'Manrope, sans-serif' }}>Top SKUs by Gross Margin %</div>
              <Link href="/profitability" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>View full →</Link>
            </div>
            {loading ? <Skeleton rows={4} /> : !d.top_margin_skus?.length ? (
              <div style={{ fontSize: 13, color: 'var(--text3)', padding: '12px 0' }}>
                Add cost prices to SKUs to see margin data
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {d.top_margin_skus.map((s, i) => {
                  const pct = parseFloat(s.margin_pct || 0);
                  const BAR_COLORS = ['var(--accent)', 'var(--purple)', 'var(--accent2)', 'var(--green)', 'var(--amber)'];
                  return (
                    <div key={s.sku_code} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 16, fontSize: 11, color: 'var(--text3)', fontWeight: 700, textAlign: 'right', flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
                          {s.sku_name}
                        </div>
                        <div style={{ height: 5, borderRadius: 99, background: 'var(--surface2)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: BAR_COLORS[i % BAR_COLORS.length], borderRadius: 99 }} />
                        </div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace', minWidth: 40, textAlign: 'right' }}>
                        {pct.toFixed(1)}%
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', minWidth: 56, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                        {formatL(s.revenue)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Volume–Profit Divergence */}
          <div className="card">
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'Manrope, sans-serif', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16 }}>⚠</span> Volume–Profit Divergence
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>High-volume, low-margin SKUs to review</div>
            </div>
            {loading ? <Skeleton rows={3} /> : !d.divergent_skus?.length ? (
              <div style={{ fontSize: 13, color: 'var(--green)', padding: '12px 0' }}>
                ✓ No high-volume low-margin SKUs detected
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {d.divergent_skus.map((s, i) => {
                  const pct = parseFloat(s.margin_pct || 0);
                  return (
                    <div key={s.sku_code} style={{
                      padding: '10px 0',
                      borderBottom: i < d.divergent_skus.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.sku_name}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            <span className="mono" style={{ fontSize: 9, color: 'var(--text3)', background: 'var(--surface2)', padding: '1px 4px', borderRadius: 3 }}>{s.sku_code}</span>
                            <span style={{ fontSize: 10, color: 'var(--text3)' }}>High volume, low margin</span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>#{s.vol_rank} by sales</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', fontFamily: 'JetBrains Mono, monospace' }}>{pct.toFixed(1)}%</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Monthly Sales Trend + Top SKUs + Recent Imports ─────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px 260px', gap: 16, marginTop: 16 }}>

          {/* Monthly Sales Trend (6 months bar chart) */}
          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'Manrope, sans-serif', marginBottom: 14 }}>Monthly Sales Trend</div>
            {loading ? <Skeleton rows={4} /> : !d.monthly_sales_trend?.length ? (
              <div style={{ fontSize: 13, color: 'var(--text3)', padding: '12px 0' }}>No sales data yet</div>
            ) : (
              <MiniBarChart data={d.monthly_sales_trend} />
            )}
          </div>

          {/* Top 5 SKUs by Sales MTD */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'Manrope, sans-serif' }}>Top SKUs — MTD</div>
              <Link href="/skus" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>All →</Link>
            </div>
            {loading ? <Skeleton rows={5} /> : !d.top_skus?.length ? (
              <div style={{ fontSize: 13, color: 'var(--text3)', padding: '8px 0' }}>No sales this month</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {d.top_skus.map((s, i) => (
                  <div key={s.sku_code} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 0',
                    borderBottom: i < d.top_skus.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{ width: 18, fontSize: 11, fontWeight: 700, color: 'var(--text3)', textAlign: 'center', flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.sku_name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{s.sku_code}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>{formatL(s.total_value)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{Number(s.qty).toFixed(1)} units</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Imports */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'Manrope, sans-serif' }}>Recent Imports</div>
              <Link href="/import/history" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>All →</Link>
            </div>
            {loading ? <Skeleton rows={5} /> : !d.recent_imports?.length ? (
              <div style={{ fontSize: 13, color: 'var(--text3)', padding: '8px 0' }}>No imports yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {d.recent_imports.map((imp, i) => {
                  const statusColor = { completed: 'var(--green)', failed: 'var(--red)', processing: 'var(--amber)', pending: 'var(--text3)' }[imp.status] || 'var(--text3)';
                  return (
                    <div key={imp.id} style={{
                      padding: '7px 0',
                      borderBottom: i < d.recent_imports.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{imp.file_name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'capitalize' }}>{imp.data_type}</div>
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: statusColor, flexShrink: 0, marginLeft: 6, textTransform: 'uppercase' }}>
                          {imp.status}
                        </div>
                      </div>
                      {imp.records_imported != null && (
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                          {imp.records_imported}/{imp.records_total} rows
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function MiniBarChart({ data }) {
  const max = Math.max(...data.map(d => parseFloat(d.total_value || 0)));
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 80 }}>
        {data.map(d => {
          const v = parseFloat(d.total_value || 0);
          const pct = max > 0 ? (v / max) * 100 : 0;
          return (
            <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: '100%', height: 70, display: 'flex', alignItems: 'flex-end' }}>
                <div style={{
                  width: '100%', height: `${Math.max(pct, 4)}%`,
                  background: 'var(--accent)', borderRadius: '3px 3px 0 0', opacity: 0.85,
                  transition: 'height 0.4s ease',
                  position: 'relative',
                }} title={`${d.month}: ₹${Math.round(v).toLocaleString('en-IN')}`} />
              </div>
              <div style={{ fontSize: 9, color: 'var(--text3)', textAlign: 'center' }}>
                {d.month?.slice(5)}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text3)' }}>
        <span>6-month sales trend</span>
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>
          {formatL(parseFloat(data[data.length - 1]?.total_value || 0))} latest
        </span>
      </div>
    </div>
  );
}
function KpiCard({ label, value, sub, subColor, barColor, barPct }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '20px 20px 16px',
      boxShadow: 'var(--shadow)',
      display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Accent glow bar at top */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: barColor || 'var(--accent)', borderRadius: '12px 12px 0 0' }} />
      <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, fontFamily: 'Work Sans, sans-serif' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em', fontFamily: 'Manrope, sans-serif', lineHeight: 1, marginBottom: 6 }}>{value}</div>
      <div style={{ fontSize: 11, color: subColor || 'var(--text3)', marginBottom: 12, minHeight: 14, fontFamily: 'Work Sans, sans-serif' }}>{sub}</div>
      <div style={{ height: 4, borderRadius: 99, background: 'var(--surface2)', overflow: 'hidden', marginTop: 'auto' }}>
        <div style={{ height: '100%', width: `${barPct || 0}%`, background: barColor || 'var(--accent)', borderRadius: 99, transition: 'width 0.6s ease', opacity: 0.85 }} />
      </div>
    </div>
  );
}

function RagMini({ color, bg, border, value, label }) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 26, fontWeight: 800, color, fontFamily: 'Manrope, sans-serif', letterSpacing: '-0.04em', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 5, fontFamily: 'Work Sans, sans-serif' }}>{label}</div>
    </div>
  );
}

function Skeleton({ rows }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ height: 13, borderRadius: 5, background: 'var(--surface2)', opacity: 0.7 }} />
      ))}
    </div>
  );
}

function TableSkeleton({ cols, rows }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} style={{ flex: c === 1 ? 2 : 1, height: 11, borderRadius: 4, background: 'var(--surface2)', opacity: 0.6 }} />
          ))}
        </div>
      ))}
    </div>
  );
}
