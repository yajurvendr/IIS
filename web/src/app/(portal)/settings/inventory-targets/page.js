'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import { useToast } from '@/components/ui/Toast';
import api from '@/lib/api';

export default function InventoryTargetsPage() {
  const toast = useToast();
  const [form, setForm] = useState({
    lead_time_days: '', woi_red_threshold: '', woi_amber_threshold: '', target_woi_weeks: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/settings/inventory-targets').then(r => {
      setForm({
        lead_time_days:      r.data.lead_time_days ?? '',
        woi_red_threshold:   r.data.woi_red_threshold ?? '',
        woi_amber_threshold: r.data.woi_amber_threshold ?? '',
        target_woi_weeks:    r.data.target_woi_weeks ?? '',
      });
    }).finally(() => setLoading(false));
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {};
      if (form.lead_time_days !== '')      payload.lead_time_days      = Number(form.lead_time_days);
      if (form.woi_red_threshold !== '')   payload.woi_red_threshold   = Number(form.woi_red_threshold);
      if (form.woi_amber_threshold !== '') payload.woi_amber_threshold = Number(form.woi_amber_threshold);
      if (form.target_woi_weeks !== '')    payload.target_woi_weeks    = Number(form.target_woi_weeks);
      await api.patch('/settings/inventory-targets', payload);
      toast('Inventory targets updated. Recompute forecasts to apply.', 'success');
    } catch (err) {
      toast(err.response?.data?.detail || 'Failed to save', 'error');
    } finally { setSaving(false); }
  }

  return (
    <>
      <Topbar title="Inventory Targets" backHref="/settings" />

      <div className="card">
        <div style={{ marginBottom: 20 }}>
          <div className="card-title" style={{ marginBottom: 3 }}>Forecasting & Order Targets</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Configure WOI thresholds, target stock cover, and supplier lead time.
            Changes take effect on the next forecast recompute.
          </div>
        </div>

        {loading ? (
          <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</div>
        ) : (
          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, marginBottom: 24 }}>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Target WOI (weeks)</label>
                <input className="form-input" type="number" step="0.5" min="1"
                  value={form.target_woi_weeks}
                  onChange={e => setForm(f => ({ ...f, target_woi_weeks: e.target.value }))}
                  placeholder="e.g. 12" />
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 5 }}>
                  Desired weeks of stock to hold. Used to compute suggested order qty.
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Lead Time (days)</label>
                <input className="form-input" type="number" min="1"
                  value={form.lead_time_days}
                  onChange={e => setForm(f => ({ ...f, lead_time_days: e.target.value }))}
                  placeholder="e.g. 105" />
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 5 }}>
                  Supplier lead time. Used for MSL and pre-season order date calculation.
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">WOI Red Threshold (weeks)</label>
                <input className="form-input" type="number" step="0.5" min="0.5"
                  value={form.woi_red_threshold}
                  onChange={e => setForm(f => ({ ...f, woi_red_threshold: e.target.value }))}
                  placeholder="e.g. 4" />
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 5 }}>
                  SKUs below this WOI are flagged red (critical).
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">WOI Amber Threshold (weeks)</label>
                <input className="form-input" type="number" step="0.5" min="0.5"
                  value={form.woi_amber_threshold}
                  onChange={e => setForm(f => ({ ...f, woi_amber_threshold: e.target.value }))}
                  placeholder="e.g. 8" />
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 5 }}>
                  SKUs below this WOI are flagged amber (low). Must be greater than red.
                </div>
              </div>

            </div>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: 160 }}>
              {saving ? 'Saving…' : 'Save Targets'}
            </button>
          </form>
        )}
      </div>
    </>
  );
}
