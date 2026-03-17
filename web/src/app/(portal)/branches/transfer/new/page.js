'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Topbar from '@/components/layout/Topbar';
import api from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

export default function NewTransferPage() {
  const router = useRouter();
  const toast  = useToast();

  const [branches, setBranches] = useState([]);
  const [skuSearch, setSkuSearch] = useState('');
  const [skuResults, setSkuResults] = useState([]);
  const [selectedSku, setSelectedSku] = useState(null);
  const [searching, setSearching] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    transfer_date: today,
    sku_id: '',
    from_branch_id: '',
    to_branch_id: '',
    quantity: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/branches/').then(r => setBranches(r.data || []));
  }, []);

  // SKU search with debounce
  useEffect(() => {
    if (skuSearch.length < 2) { setSkuResults([]); return; }
    const t = setTimeout(() => {
      setSearching(true);
      api.get('/skus/', { params: { search: skuSearch, limit: 10 } })
        .then(r => setSkuResults(r.data.data || []))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [skuSearch]);

  function selectSku(sku) {
    setSelectedSku(sku);
    setForm(f => ({ ...f, sku_id: sku.id }));
    setSkuSearch(sku.sku_code + ' — ' + sku.sku_name);
    setSkuResults([]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr('');
    if (!form.sku_id) { setErr('Please select a SKU'); return; }
    if (!form.from_branch_id || !form.to_branch_id) { setErr('Both branches are required'); return; }
    if (form.from_branch_id === form.to_branch_id) { setErr('Source and destination must differ'); return; }
    if (!form.quantity || parseFloat(form.quantity) <= 0) { setErr('Quantity must be positive'); return; }

    setSaving(true);
    try {
      await api.post('/branches/transfers', {
        ...form,
        quantity: parseFloat(form.quantity),
      });
      toast('Transfer recorded', 'success');
      router.push('/branches/transfer/log');
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Failed to record transfer');
    } finally { setSaving(false); }
  }

  const activeBranches = branches.filter(b => b.is_active);

  return (
    <>
      <Topbar title="Record Stock Transfer" subtitle="Move stock between branches" />

      <div style={{ maxWidth: 560 }}>
        <div className="card">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Date */}
              <div>
                <label className="form-label">Transfer Date *</label>
                <input type="date" className="form-input" value={form.transfer_date}
                  onChange={e => setForm(f => ({...f, transfer_date: e.target.value}))} required />
              </div>

              {/* SKU Search */}
              <div style={{ position: 'relative' }}>
                <label className="form-label">SKU *</label>
                <input className="form-input" value={skuSearch}
                  onChange={e => { setSkuSearch(e.target.value); setSelectedSku(null); setForm(f => ({...f, sku_id: ''})); }}
                  placeholder="Search by code or name…" autoComplete="off" />
                {searching && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>Searching…</div>}
                {skuResults.length > 0 && (
                  <div style={{
                    position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%',
                    background: 'var(--color-card)', border: '1px solid var(--color-border)',
                    borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto',
                  }}>
                    {skuResults.map(s => (
                      <div key={s.id}
                        onClick={() => selectSku(s)}
                        style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--color-border)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                      >
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{s.sku_code}</div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{s.sku_name}</div>
                      </div>
                    ))}
                  </div>
                )}
                {selectedSku && (
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-green)', fontWeight: 500 }}>
                    ✓ {selectedSku.sku_code} — {selectedSku.sku_name}
                    {selectedSku.current_stock != null && ` (Stock: ${selectedSku.current_stock})`}
                  </div>
                )}
              </div>

              {/* From Branch */}
              <div>
                <label className="form-label">From Branch *</label>
                <select className="form-select" value={form.from_branch_id}
                  onChange={e => setForm(f => ({...f, from_branch_id: e.target.value}))} required>
                  <option value="">Select source branch…</option>
                  {activeBranches.map(b => (
                    <option key={b.id} value={b.id}>{b.branch_code} — {b.branch_name}</option>
                  ))}
                </select>
              </div>

              {/* To Branch */}
              <div>
                <label className="form-label">To Branch *</label>
                <select className="form-select" value={form.to_branch_id}
                  onChange={e => setForm(f => ({...f, to_branch_id: e.target.value}))} required>
                  <option value="">Select destination branch…</option>
                  {activeBranches
                    .filter(b => b.id !== form.from_branch_id)
                    .map(b => (
                      <option key={b.id} value={b.id}>{b.branch_code} — {b.branch_name}</option>
                    ))}
                </select>
              </div>

              {/* Quantity */}
              <div>
                <label className="form-label">Quantity *</label>
                <input type="number" className="form-input" value={form.quantity} min="0.001" step="0.001"
                  onChange={e => setForm(f => ({...f, quantity: e.target.value}))} placeholder="0" required />
              </div>

              {/* Notes */}
              <div>
                <label className="form-label">Notes</label>
                <textarea className="form-input" rows={2} value={form.notes}
                  onChange={e => setForm(f => ({...f, notes: e.target.value}))}
                  placeholder="Optional reason or reference" style={{ resize: 'vertical' }} />
              </div>

              {err && <div style={{ color: '#C53030', fontSize: 13 }}>{err}</div>}

              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={() => router.back()}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Recording…' : 'Record Transfer'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
