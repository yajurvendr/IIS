'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import DataTable from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import api from '@/lib/api';

const SEASON_OPTIONS = ['Summer', 'Monsoon', 'Winter', 'Festival', 'Year-Round'];

export default function BulkTagPage() {
  const toast = useToast();
  const [data, setData] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/skus', { params: { limit: 200 } }).then(r => setData(r.data.data)).finally(() => setLoading(false));
  }, []);

  function toggleSelect(id) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  function toggleAll() {
    if (selected.size === data.length) setSelected(new Set());
    else setSelected(new Set(data.map(d => d.id)));
  }

  async function handleApply() {
    if (!selected.size) return toast('Select at least one SKU', 'error');
    if (!tags.length) return toast('Select at least one season tag', 'error');
    setSaving(true);
    try {
      await api.post('/skus/bulk-tag', { sku_ids: [...selected], season_tags: tags });
      toast(`${selected.size} SKUs tagged with ${tags.join(', ')}`, 'success');
      setSelected(new Set());
    } catch (err) {
      toast(err.response?.data?.error || 'Failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Topbar title="Bulk Season Tag" backHref="/skus" backLabel="SKU Master" />

      {/* Season selector */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 10 }}>Select Season Tags to Apply</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SEASON_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => setTags(prev => prev.includes(s) ? prev.filter(t => t !== s) : [...prev, s])}
              className={`btn ${tags.includes(s) ? 'btn-primary' : 'btn-secondary'}`}
            >{s}</button>
          ))}
        </div>
        {tags.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <strong>Tags to apply:</strong> {tags.join(', ')}
            <button
              className="btn btn-accent" style={{ marginLeft: 16 }}
              onClick={handleApply} disabled={saving || !selected.size}
            >
              {saving ? 'Applying…' : `Apply to ${selected.size} SKUs`}
            </button>
          </div>
        )}
      </div>

      <DataTable
        loading={loading}
        toolbar={
          <>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{selected.size} of {data.length} selected</span>
            <button className="btn btn-secondary btn-sm" onClick={toggleAll}>
              {selected.size === data.length ? 'Deselect All' : 'Select All'}
            </button>
          </>
        }
        columns={[
          {
            key: 'id', label: '', width: 40,
            render: (v) => (
              <input type="checkbox" checked={selected.has(v)} onChange={() => toggleSelect(v)} />
            )
          },
          { key: 'sku_code', label: 'SKU Code' },
          { key: 'description', label: 'Description' },
          { key: 'brand', label: 'Brand' },
          { key: 'category', label: 'Category' },
          {
            key: 'season_tags', label: 'Current Tags',
            render: v => {
              try {
                const t = typeof v === 'string' ? JSON.parse(v || '[]') : (v || []);
                return t.length ? t.map(s => <span key={s} className="badge badge-gray" style={{ marginRight: 2 }}>{s}</span>) : <span className="text-muted">—</span>;
              } catch { return null; }
            }
          },
        ]}
        data={data}
        emptyText="No SKUs"
      />
    </>
  );
}
