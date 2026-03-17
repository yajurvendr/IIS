'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import { useToast } from '@/components/ui/Toast';
import api from '@/lib/api';

const IMPORT_TYPES = [
  { value: 'sales', label: 'Sales Data' },
  { value: 'purchases', label: 'Purchase Data' },
  { value: 'inventory', label: 'Inventory Snapshot' },
  { value: 'outstanding', label: 'Outstanding Ledger' },
  { value: 'msl', label: 'MSL / Reorder Levels' },
];

const DEFAULT_FIELDS = {
  sales:       ['sku_code', 'sku_name', 'brand', 'category', 'unit', 'quantity', 'rate', 'total_value', 'invoice_no', 'sale_date', 'customer_name', 'customer_code'],
  purchases:   ['sku_code', 'sku_name', 'brand', 'category', 'unit', 'quantity', 'rate_encoded', 'total_value', 'invoice_no', 'purchase_date', 'vendor_name'],
  inventory:   ['sku_code', 'sku_name', 'brand', 'quantity_on_hand', 'snapshot_date'],
  outstanding: ['customer_name', 'customer_code', 'phone', 'transaction_date', 'transaction_type', 'amount', 'reference_no'],
  msl:         ['sku_code', 'sku_name', 'msl_busy'],
};

export default function ColumnMappingsPage() {
  const toast = useToast();
  const [activeType, setActiveType] = useState('sales');
  const [mappings, setMappings] = useState({}); // { "field_name": { id, aliases: [] } }
  const [loading, setLoading] = useState(false);
  const [editField, setEditField] = useState(null);
  const [aliasInput, setAliasInput] = useState('');
  const [saving, setSaving] = useState(false);

  function load(type) {
    setLoading(true);
    api.get('/settings/column-mappings', { params: { import_type: type } })
      .then(r => {
        const m = {};
        (r.data.data || []).forEach(row => {
          m[row.field_name] = { id: row.id, aliases: row.aliases || [] };
        });
        setMappings(m);
      })
      .catch(() => toast('Failed to load mappings', 'error'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(activeType); }, [activeType]);

  function openEdit(field) {
    const existing = mappings[field];
    setAliasInput(existing ? existing.aliases.join(', ') : '');
    setEditField(field);
  }

  async function handleSave() {
    const aliases = aliasInput.split(',').map(s => s.trim()).filter(Boolean);
    setSaving(true);
    try {
      await api.post('/settings/column-mappings', {
        import_type: activeType,
        field_name: editField,
        aliases,
      });
      toast('Column mapping saved', 'success');
      setEditField(null);
      load(activeType);
    } catch (err) {
      toast(err.response?.data?.detail || 'Save failed', 'error');
    } finally { setSaving(false); }
  }

  async function handleDelete(field) {
    const m = mappings[field];
    if (!m) return;
    if (!confirm(`Remove custom mapping for "${field}"? The built-in defaults will be used instead.`)) return;
    try {
      await api.delete(`/settings/column-mappings/${m.id}`);
      toast('Mapping removed', 'success');
      load(activeType);
    } catch (err) {
      toast('Delete failed', 'error');
    }
  }

  const fields = DEFAULT_FIELDS[activeType] || [];

  return (
    <>
      <Topbar title="Column Mapping Overrides" backHref="/settings" />

      <div style={{ maxWidth: 760 }}>
        <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
            Override the default column name aliases used when importing files. Custom aliases are
            checked first — if your file uses non-standard headers, add them here so they are
            recognised automatically on every import.
          </p>
        </div>

        {/* Type tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {IMPORT_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setActiveType(t.value)}
              className={activeType === t.value ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ fontSize: 13 }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading…</div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                  {['Field', 'Custom Aliases', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--color-text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fields.map((field, i) => {
                  const custom = mappings[field];
                  return (
                    <tr key={field} style={{ borderBottom: '1px solid var(--color-border)', background: i % 2 === 1 ? 'var(--color-bg)' : '#fff' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 500, fontFamily: 'monospace' }}>{field}</td>
                      <td style={{ padding: '10px 14px', color: custom ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
                        {custom && custom.aliases.length > 0
                          ? custom.aliases.map(a => (
                              <span key={a} style={{ display: 'inline-block', background: '#EBF8FF', color: 'var(--color-primary)', borderRadius: 4, padding: '1px 7px', fontSize: 11, marginRight: 4, marginBottom: 2 }}>{a}</span>
                            ))
                          : <span style={{ fontStyle: 'italic', fontSize: 12 }}>Using defaults</span>
                        }
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {custom
                          ? <span style={{ fontSize: 11, background: '#F0FFF4', color: '#276749', borderRadius: 10, padding: '2px 8px', fontWeight: 600 }}>Custom</span>
                          : <span style={{ fontSize: 11, background: 'var(--color-bg)', color: 'var(--color-text-muted)', borderRadius: 10, padding: '2px 8px' }}>Default</span>
                        }
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => openEdit(field)} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }}>
                            {custom ? 'Edit' : 'Add'}
                          </button>
                          {custom && (
                            <button onClick={() => handleDelete(field)} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12, color: '#C53030' }}>
                              Reset
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editField && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: 480 }}>
            <div className="card-title" style={{ marginBottom: 6 }}>Custom Aliases for <code>{editField}</code></div>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16 }}>
              Enter comma-separated column header names that your files use for this field.
              These will be checked before the built-in defaults.
            </p>
            <div className="form-group">
              <label className="form-label">Aliases (comma-separated)</label>
              <input
                className="form-input"
                value={aliasInput}
                placeholder="e.g. Prod Code, Item No, Article"
                onChange={e => setAliasInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditField(null)} className="btn btn-secondary">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                {saving ? 'Saving…' : 'Save Aliases'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
