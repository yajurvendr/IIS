'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import { useToast } from '@/components/ui/Toast';
import api from '@/lib/api';

const OPTIONS = [
  {
    value: 'direct_upload',
    label: 'Direct Ledger Upload',
    description: 'Upload the full outstanding ledger (invoices, payments, credit notes) as a single export from Busy. The outstanding balance for each customer is taken directly from the uploaded data.',
  },
  {
    value: 'computed',
    label: 'Computed from Invoices & Receipts',
    description: 'Upload separate Sales Invoices and Payment Receipts exports from Busy. The system computes each customer\'s outstanding as: total invoices − total payments received.',
  },
];

export default function OutstandingMethodPage() {
  const toast = useToast();
  const [method, setMethod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/settings/outstanding-method')
      .then(r => setMethod(r.data.outstanding_method))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await api.patch('/settings/outstanding-method', { outstanding_method: method });
      toast('Outstanding method updated', 'success');
    } catch (err) {
      toast(err.response?.data?.detail || 'Failed to save', 'error');
    } finally { setSaving(false); }
  }

  return (
    <>
      <Topbar title="Outstanding Method" backHref="/settings" />

      <div className="card">
        <div style={{ marginBottom: 20 }}>
          <div className="card-title" style={{ marginBottom: 3 }}>Customer Outstanding Calculation</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Choose how customer outstanding balances are calculated across the platform.
          </div>
        </div>

        {loading ? (
          <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            {OPTIONS.map(opt => (
              <div
                key={opt.value}
                onClick={() => setMethod(opt.value)}
                style={{
                  padding: '16px 18px',
                  borderRadius: 10,
                  border: `2px solid ${method === opt.value ? 'var(--color-primary, #6366F1)' : 'var(--color-border)'}`,
                  background: method === opt.value ? 'var(--color-primary-light, #EEF2FF)' : 'var(--color-surface)',
                  cursor: 'pointer',
                  display: 'flex',
                  gap: 14,
                  alignItems: 'flex-start',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                  border: `2px solid ${method === opt.value ? 'var(--color-primary, #6366F1)' : 'var(--color-border)'}`,
                  background: method === opt.value ? 'var(--color-primary, #6366F1)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {method === opt.value && (
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text)', marginBottom: 4 }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                    {opt.description}
                  </div>
                </div>
              </div>
            ))}

            <div style={{
              marginTop: 4, padding: '12px 14px',
              background: 'var(--color-surface-2, #F8FAFC)',
              borderRadius: 8, fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.7,
            }}>
              <strong>Note:</strong> When using <em>Computed</em> method, upload <strong>Sales Invoices</strong> and <strong>Payment Receipts</strong> via Data Import instead of the Outstanding Ledger.
              Changing this setting takes effect immediately on the next page load.
            </div>
          </div>
        )}

        {!loading && (
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ minWidth: 140 }}>
            {saving ? 'Saving…' : 'Save Method'}
          </button>
        )}
      </div>
    </>
  );
}
