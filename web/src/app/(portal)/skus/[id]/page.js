'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Topbar from '@/components/layout/Topbar';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import api from '@/lib/api';
import { formatINR, woiBadgeClass } from '@/lib/formatters';

export default function SkuDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const [sku, setSku] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({});

  useEffect(() => {
    api.get(`/skus/${id}`).then(r => {
      setSku(r.data);
      const tags = typeof r.data.season_tags === 'string' ? JSON.parse(r.data.season_tags || '[]') : (r.data.season_tags || []);
      setForm({
        is_focus_sku: r.data.is_focus_sku || 0,
        msl_override: r.data.msl_override || '',
        lead_time_days: r.data.lead_time_days || 105,
        season_tags: tags.join(', '),
      });
    }).finally(() => setLoading(false));
  }, [id]);

  async function handleSave() {
    try {
      const tags = form.season_tags.split(',').map(t => t.trim()).filter(Boolean);
      await api.patch(`/skus/${id}`, {
        is_focus_sku: form.is_focus_sku ? 1 : 0,
        msl_override: form.msl_override ? parseInt(form.msl_override) : null,
        lead_time_days: parseInt(form.lead_time_days) || 105,
        season_tags: tags,
      });
      toast('SKU updated', 'success');
      setEditOpen(false);
      api.get(`/skus/${id}`).then(r => setSku(r.data));
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to update', 'error');
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading…</div>;
  if (!sku) return <div style={{ padding: 40 }}>SKU not found</div>;

  const tags = typeof sku.season_tags === 'string' ? JSON.parse(sku.season_tags || '[]') : (sku.season_tags || []);

  return (
    <>
      <Topbar
        title={`${sku.sku_code} — ${sku.description}`}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, gap: 8 }}>
        <button className="btn btn-secondary" onClick={() => setEditOpen(true)}>Edit SKU</button>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        {/* SKU Info */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>SKU Details</div>
          {[
            ['Code', sku.sku_code],
            ['Description', sku.description],
            ['Brand', sku.brand || '—'],
            ['Category', sku.category || '—'],
            ['Unit', sku.unit || '—'],
            ['Current Stock', sku.current_stock ?? '—'],
            ['Purchase Cost', sku.purchase_cost_decoded ? formatINR(sku.purchase_cost_decoded) : '—'],
            ['MSL Override', sku.msl_override ?? 'Auto'],
            ['Lead Time', `${sku.lead_time_days || 105} days`],
            ['Focus SKU', sku.is_focus_sku ? 'Yes' : 'No'],
            ['Season Tags', tags.length ? tags.join(', ') : '—'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border)', fontSize: 13 }}>
              <span style={{ color: 'var(--color-text-muted)' }}>{k}</span>
              <span style={{ fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Forecast */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>Forecast Metrics</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <span className={woiBadgeClass(sku.woi_status)} style={{ fontSize: 14, padding: '6px 18px' }}>
              WOI: {parseFloat(sku.woi || 0).toFixed(1)} weeks
            </span>
            {sku.pre_season_alert ? <span className="badge badge-amber">Pre-Season Alert</span> : null}
          </div>
          {[
            ['DRR (4 week)', parseFloat(sku.drr_4w || 0).toFixed(4)],
            ['DRR (13 week)', parseFloat(sku.drr_13w || 0).toFixed(4)],
            ['DRR (52 week)', parseFloat(sku.drr_52w || 0).toFixed(4)],
            ['DRR Recommended', <strong>{parseFloat(sku.drr_recommended || 0).toFixed(4)}</strong>],
            ['MSL Suggested', sku.msl_suggested ?? '—'],
            ['Target 12W Qty', sku.target_12w_qty ?? '—'],
            ['Suggested Order Qty', <strong style={{ color: 'var(--color-primary)' }}>{sku.suggested_order_qty ?? '—'}</strong>],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border)', fontSize: 13 }}>
              <span style={{ color: 'var(--color-text-muted)' }}>{k}</span>
              <span>{v}</span>
            </div>
          ))}
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--color-text-muted)' }}>
            Updated: {sku.forecast_updated_at ? new Date(sku.forecast_updated_at).toLocaleString('en-IN') : 'Never'}
          </div>
        </div>
      </div>

      {/* Sales Trend Chart */}
      {(sku.monthly_trend?.length > 0 || sku.sales_history?.length > 0) && (
        <SalesTrendChart monthly={sku.monthly_trend || []} weekly={sku.sales_history || []} />
      )}

      {/* Edit Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit SKU">
        <div className="form-group">
          <label className="form-label">
            <input type="checkbox" checked={!!form.is_focus_sku} onChange={e => setForm(f => ({ ...f, is_focus_sku: e.target.checked ? 1 : 0 }))} style={{ marginRight: 6 }} />
            Mark as Focus SKU
          </label>
        </div>
        <div className="form-group">
          <label className="form-label">MSL Override (leave blank for auto)</label>
          <input className="form-input" type="number" min="0" value={form.msl_override} onChange={e => setForm(f => ({ ...f, msl_override: e.target.value }))} placeholder="Auto" />
        </div>
        <div className="form-group">
          <label className="form-label">Lead Time (days)</label>
          <input className="form-input" type="number" min="1" value={form.lead_time_days} onChange={e => setForm(f => ({ ...f, lead_time_days: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Season Tags (comma-separated)</label>
          <input className="form-input" value={form.season_tags} onChange={e => setForm(f => ({ ...f, season_tags: e.target.value }))} placeholder="Summer, Monsoon" />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn btn-secondary" onClick={() => setEditOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
        </div>
      </Modal>
    </>
  );
}


function SalesTrendChart({ monthly, weekly }) {
  const [view, setView] = useState('monthly');
  const data = view === 'monthly' ? monthly : weekly;

  if (!data.length) return null;

  const maxQty = Math.max(...data.map(d => parseFloat(d.qty) || 0), 1);
  const maxRev = monthly.length > 0 ? Math.max(...monthly.map(d => parseFloat(d.revenue) || 0), 1) : 1;
  const totalQty = data.reduce((s, d) => s + (parseFloat(d.qty) || 0), 0);
  const totalRev = monthly.reduce((s, d) => s + (parseFloat(d.revenue) || 0), 0);

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div className="card-title">Sales Trend</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
            {view === 'monthly'
              ? `Last 12 months · ${totalQty.toFixed(0)} units · ₹${(totalRev / 1000).toFixed(1)}K revenue`
              : `Last 52 weeks · ${totalQty.toFixed(0)} units total`
            }
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['monthly', 'weekly'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600,
              border: '1px solid var(--color-border)',
              background: view === v ? 'var(--color-primary)' : 'var(--color-surface)',
              color: view === v ? '#fff' : 'var(--color-text-muted)',
              cursor: 'pointer',
            }}>{v === 'monthly' ? 'Monthly' : 'Weekly'}</button>
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div style={{ position: 'relative' }}>
        {/* Qty bars */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: view === 'weekly' ? 1 : 4, height: 100 }}>
          {data.map((d, i) => {
            const qty = parseFloat(d.qty) || 0;
            const rev = parseFloat(d.revenue) || 0;
            const h = Math.max((qty / maxQty) * 90, 2);
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div
                  title={view === 'monthly'
                    ? `${d.label}: ${qty.toFixed(0)} units · ₹${(rev / 1000).toFixed(1)}K`
                    : `Week ${d.yw}: ${qty.toFixed(0)} units`
                  }
                  style={{
                    width: '100%', borderRadius: '2px 2px 0 0',
                    background: qty > 0 ? 'var(--color-primary)' : 'var(--color-border)',
                    height: h,
                    opacity: 0.8,
                    cursor: 'default',
                    transition: 'opacity 0.1s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0.8'; }}
                />
              </div>
            );
          })}
        </div>

        {/* Month labels (only for monthly view) */}
        {view === 'monthly' && (
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            {data.map((d, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--color-text-muted)', overflow: 'hidden' }}>
                {d.label}
              </div>
            ))}
          </div>
        )}

        {/* Revenue line overlay (monthly only) */}
        {view === 'monthly' && monthly.length > 1 && (
          <svg
            style={{ position: 'absolute', top: 0, left: 0, right: 0, width: '100%', height: 100, pointerEvents: 'none' }}
            viewBox={`0 0 ${monthly.length * 30} 100`}
            preserveAspectRatio="none"
          >
            <polyline
              points={monthly.map((d, i) => {
                const x = (i + 0.5) * 30;
                const y = 100 - Math.max((parseFloat(d.revenue) || 0) / maxRev * 85, 2);
                return `${x},${y}`;
              }).join(' ')}
              fill="none"
              stroke="var(--color-green, #48BB78)"
              strokeWidth="1.5"
              strokeDasharray="4 2"
              opacity="0.7"
            />
          </svg>
        )}
      </div>

      {view === 'monthly' && (
        <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: 'var(--color-text-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--color-primary)', display: 'inline-block', opacity: 0.8 }} />
            Quantity sold
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 14, borderTop: '2px dashed var(--color-green, #48BB78)', marginBottom: 1 }} />
            Revenue trend
          </span>
        </div>
      )}
    </div>
  );
}
