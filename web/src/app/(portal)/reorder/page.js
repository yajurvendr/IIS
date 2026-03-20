'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import Topbar from '@/components/layout/Topbar';
import api from '@/lib/api';
import { formatDate, woiBadgeClass } from '@/lib/formatters';
import { useActiveBranch } from '@/components/layout/Sidebar';
import { getTenant } from '@/lib/auth';

// ── Status helpers ────────────────────────────────────────────────────────────

const REORDER_STATUS_LABELS = {
  out_of_stock:            { label: 'Out of Stock',          cls: 'badge badge-red'    },
  reorder_suggested:       { label: 'Reorder Suggested',     cls: 'badge badge-amber'  },
  msl_review_recommended:  { label: 'MSL Review',            cls: 'badge badge-amber'  },
  order_placed:            { label: 'Order Placed',          cls: 'badge badge-blue'   },
  pending_delivery:        { label: 'Pending Delivery',      cls: 'badge badge-blue'   },
};

const ORDER_STATUS_LABELS = {
  order_placed:     'Order Placed',
  pending_delivery: 'Pending Delivery',
  delivered:        'Delivered',
  cancelled:        'Cancelled',
};

function ReorderBadge({ status }) {
  const def = REORDER_STATUS_LABELS[status] || { label: status, cls: 'badge' };
  return <span className={def.cls}>{def.label}</span>;
}

// ── Inline MSL Editor ─────────────────────────────────────────────────────────

function MslEdit({ skuId, currentMsl, branchId, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(currentMsl ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (val === '' || isNaN(Number(val))) return;
    setSaving(true);
    try {
      await api.patch(`/skus/${skuId}`, { msl: Number(val), branch_id: branchId });
      setEditing(false);
      onSaved(Number(val));
    } finally { setSaving(false); }
  }

  if (!editing) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ minWidth: 30 }}>{currentMsl ?? '—'}</span>
        <button className="btn btn-ghost" style={{ padding: '1px 6px', fontSize: 11 }}
          onClick={() => { setVal(currentMsl ?? ''); setEditing(true); }}>✏</button>
      </span>
    );
  }

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input
        type="number" min={0} value={val} onChange={e => setVal(e.target.value)}
        style={{ width: 60, padding: '2px 4px', fontSize: 13 }}
        className="form-input"
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
      />
      <button className="btn btn-primary" style={{ padding: '2px 8px', fontSize: 12 }}
        onClick={save} disabled={saving}>{saving ? '…' : '✓'}</button>
      <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 12 }}
        onClick={() => setEditing(false)}>✕</button>
    </span>
  );
}

// ── Order Form (per-row) ───────────────────────────────────────────────────────

function OrderForm({ row, branchId, leadTimeDays, isAdmin, onRefresh }) {
  const hasOrder = !!row.order_id;
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(row.suggested_order_qty || 1);
  const [useSystemLead, setUseSystemLead] = useState(true);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState(row.order_status || 'order_placed');
  const [saving, setSaving] = useState(false);

  // Compute system delivery date string for display
  const sysDelivery = (() => {
    const d = new Date(); d.setDate(d.getDate() + leadTimeDays);
    return d.toISOString().slice(0, 10);
  })();

  async function placeOrder() {
    if (!qty || qty <= 0) return;
    setSaving(true);
    try {
      const payload = {
        sku_id: row.sku_id,
        branch_id: branchId || row.branch_id || '',
        ordered_qty: Number(qty),
        use_system_lead_time: useSystemLead,
        notes: notes || null,
      };
      if (!useSystemLead) payload.expected_delivery_dt = deliveryDate;
      await api.post('/reorder/orders', payload);
      setOpen(false);
      onRefresh();
    } finally { setSaving(false); }
  }

  async function updateOrder() {
    setSaving(true);
    try {
      const payload = {};
      if (qty && qty > 0) payload.ordered_qty = Number(qty);
      if (!useSystemLead && deliveryDate) payload.expected_delivery_dt = deliveryDate;
      if (notes) payload.notes = notes;
      if (isAdmin) payload.status = status;
      await api.patch(`/reorder/orders/${row.order_id}`, payload);
      setOpen(false);
      onRefresh();
    } finally { setSaving(false); }
  }

  if (!open) {
    if (hasOrder) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Ordered: <strong>{row.ordered_qty}</strong> · Exp: {formatDate(row.expected_delivery_dt)}
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {ORDER_STATUS_LABELS[row.order_status] || row.order_status}
          </span>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', marginTop: 2 }}
            onClick={() => { setQty(row.ordered_qty); setNotes(row.order_notes || ''); setStatus(row.order_status); setOpen(true); }}>
            Update Order
          </button>
        </div>
      );
    }
    return (
      <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 12px' }}
        onClick={() => { setQty(row.suggested_order_qty || 1); setNotes(''); setOpen(true); }}>
        Mark as Ordered
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 220, padding: 10,
      border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-surface)' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ fontSize: 12, minWidth: 60 }}>Qty:</label>
        <input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)}
          className="form-input" style={{ width: 80, padding: '3px 6px', fontSize: 13 }} />
      </div>

      <div>
        <div style={{ fontSize: 12, marginBottom: 4 }}>Expected Delivery:</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', marginBottom: 4 }}>
          <input type="radio" checked={useSystemLead} onChange={() => setUseSystemLead(true)} />
          System ({leadTimeDays}d · {formatDate(sysDelivery)})
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
          <input type="radio" checked={!useSystemLead} onChange={() => setUseSystemLead(false)} />
          Custom date:&nbsp;
          <input type="date" className="form-input" style={{ fontSize: 12, padding: '2px 4px' }}
            disabled={useSystemLead} value={deliveryDate}
            onChange={e => setDeliveryDate(e.target.value)} />
        </label>
      </div>

      {isAdmin && hasOrder && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, minWidth: 60 }}>Status:</label>
          <select className="form-input" style={{ fontSize: 12, padding: '3px 28px 3px 8px' }}
            value={status} onChange={e => setStatus(e.target.value)}>
            {Object.entries(ORDER_STATUS_LABELS).map(([v, l]) =>
              <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      )}

      <input className="form-input" placeholder="Notes (optional)" value={notes}
        onChange={e => setNotes(e.target.value)} style={{ fontSize: 12, padding: '3px 6px' }} />

      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 12px' }}
          onClick={hasOrder ? updateOrder : placeOrder} disabled={saving}>
          {saving ? 'Saving…' : hasOrder ? 'Update' : 'Confirm Order'}
        </button>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }}
          onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

// ── Bucket Table ──────────────────────────────────────────────────────────────

function BucketTable({ rows, label, branchId, leadTimeDays, isAdmin, onRefresh, onMslSaved }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: collapsed ? 0 : 16,
        cursor: 'pointer' }} onClick={() => setCollapsed(c => !c)}>
        <strong style={{ fontSize: 15 }}>{label}</strong>
        <span className="badge" style={{ background: 'var(--color-primary)', color: '#fff' }}>
          {rows.length}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-text-muted)' }}>
          {collapsed ? '▶ Show' : '▼ Hide'}
        </span>
      </div>

      {!collapsed && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                {['SKU Code','SKU Name','Brand','Stock','DRR/d','WOI','MSL','Sugg. Qty','Status','Order'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-muted)' }}>
                  No items in this bucket
                </td></tr>
              )}
              {rows.map(row => (
                <tr key={row.sku_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{row.sku_code}</td>
                  <td style={{ padding: '8px 10px', maxWidth: 200 }}>{row.sku_name}</td>
                  <td style={{ padding: '8px 10px' }}>{row.brand || '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{parseFloat(row.effective_stock || 0).toFixed(0)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{parseFloat(row.drr_recommended || 0).toFixed(2)}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span className={woiBadgeClass(row.woi_status)}>
                      {parseFloat(row.woi || 0).toFixed(1)}w
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    {isAdmin
                      ? <MslEdit skuId={row.sku_id} currentMsl={row.msl} branchId={branchId}
                          onSaved={v => onMslSaved(row.sku_id, v)} />
                      : (row.msl ?? '—')}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>
                    {row.suggested_order_qty}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <ReorderBadge status={row.reorder_status} />
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <OrderForm row={row} branchId={branchId} leadTimeDays={leadTimeDays}
                      isAdmin={isAdmin} onRefresh={onRefresh} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ReorderPage() {
  const [activeBranch] = useActiveBranch();
  const tenant = getTenant();
  const isAdmin = tenant?.role === 'tenant_admin';

  const [bucket1, setBucket1] = useState([]);
  const [bucket2, setBucket2] = useState([]);
  const [summary, setSummary] = useState({ bucket1_count: 0, bucket2_count: 0, lead_time_days: 15 });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const uploadRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/reorder/', { params: { branch_id: activeBranch?.id || '' } })
      .then(r => {
        setBucket1(r.data.bucket1 || []);
        setBucket2(r.data.bucket2 || []);
        setSummary(r.data.summary || {});
      })
      .finally(() => setLoading(false));
  }, [activeBranch]);

  useEffect(() => { load(); }, [load]);

  function handleMslSaved(bucketSetter, skuId, newMsl) {
    bucketSetter(prev => prev.map(r => r.sku_id === skuId ? { ...r, msl: newMsl } : r));
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await api.get('/reorder/export', {
        params: { branch_id: activeBranch?.id || '' },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = 'smart_reorder.xlsx'; a.click();
    } finally { setExporting(false); }
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post(
        `/reorder/bulk-upload?branch_id=${activeBranch?.id || ''}`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setUploadResult(res.data);
      load();
    } catch (err) {
      setUploadResult({ message: err.response?.data?.detail || 'Upload failed', errors: [] });
    } finally {
      setUploading(false);
      if (uploadRef.current) uploadRef.current.value = '';
    }
  }

  const totalItems = summary.bucket1_count + summary.bucket2_count;

  return (
    <>
      <Topbar
        title="Smart Reorder"
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)', alignSelf: 'center' }}>
          Lead time: <strong>{summary.lead_time_days}d</strong>
        </span>
        <button className="btn btn-secondary" onClick={handleExport} disabled={exporting || loading} style={{ fontSize: 13 }}>
          {exporting ? 'Downloading…' : 'Download Excel'}
        </button>
        <label className="btn btn-secondary" style={{ fontSize: 13, cursor: uploading ? 'wait' : 'pointer' }}>
          {uploading ? 'Uploading…' : 'Upload Excel'}
          <input ref={uploadRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={handleUpload} disabled={uploading} />
        </label>
        <button className="btn btn-ghost" onClick={load} disabled={loading} style={{ fontSize: 13 }}>
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      {/* Upload result banner */}
      {uploadResult && (
        <div style={{
          marginBottom: 16, padding: '10px 16px', borderRadius: 8,
          background: uploadResult.errors?.length ? '#FFF5F5' : '#F0FFF4',
          border: `1px solid ${uploadResult.errors?.length ? '#FC8181' : '#68D391'}`,
          fontSize: 13,
        }}>
          <strong>{uploadResult.message}</strong>
          {uploadResult.errors?.length > 0 && (
            <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
              {uploadResult.errors.map((e, i) => <li key={i} style={{ color: '#C53030' }}>{e}</li>)}
            </ul>
          )}
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', marginLeft: 12 }}
            onClick={() => setUploadResult(null)}>✕</button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--color-text-muted)', fontSize: 14 }}>
          Loading reorder data…
        </div>
      ) : totalItems === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--color-text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>All clear — no reorder action needed</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>
            No SKUs with MSL set are below reorder threshold for the selected branch.
          </div>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            <div className="card" style={{ flex: 1, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-danger)' }}>
                {summary.bucket1_count}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Priority SKUs</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Sold in last 7 days</div>
              </div>
            </div>
            <div className="card" style={{ flex: 1, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-warning, #f59e0b)' }}>
                {summary.bucket2_count}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Broad Scan</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Red/Amber WOI or OOS</div>
              </div>
            </div>
            <div className="card" style={{ flex: 1, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-primary)' }}>
                {totalItems}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Total Items</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Needing attention</div>
              </div>
            </div>
          </div>

          <BucketTable
            rows={bucket1}
            label="Bucket 1 — Priority (Sold in Last 7 Days)"
            branchId={activeBranch?.id || ''}
            leadTimeDays={summary.lead_time_days}
            isAdmin={isAdmin}
            onRefresh={load}
            onMslSaved={(skuId, v) => handleMslSaved(setBucket1, skuId, v)}
          />

          <BucketTable
            rows={bucket2}
            label="Bucket 2 — Broad Scan (Red/Amber WOI)"
            branchId={activeBranch?.id || ''}
            leadTimeDays={summary.lead_time_days}
            isAdmin={isAdmin}
            onRefresh={load}
            onMslSaved={(skuId, v) => handleMslSaved(setBucket2, skuId, v)}
          />
        </>
      )}
    </>
  );
}
