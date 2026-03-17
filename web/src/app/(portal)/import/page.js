'use client';
import { useState, useRef, useEffect } from 'react';
import Topbar from '@/components/layout/Topbar';
import { useToast } from '@/components/ui/Toast';
import api from '@/lib/api';
import Link from 'next/link';

const IMPORT_TYPES = [
  {
    value: 'sales', label: 'Sales Data',
    desc: 'Sales invoices from Busy or any accounting software',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 10h14M3 6h14M3 14h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
    color: '#1D4ED8', bg: '#DBEAFE',
  },
  {
    value: 'purchases', label: 'Purchase Data',
    desc: 'Purchase vouchers with encoded cost rates',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M4 4h12l-1.5 8H5.5L4 4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <circle cx="8" cy="16" r="1.2" fill="currentColor"/>
        <circle cx="13" cy="16" r="1.2" fill="currentColor"/>
      </svg>
    ),
    color: '#7C3AED', bg: '#EDE9FE',
  },
  {
    value: 'inventory', label: 'Inventory Snapshot',
    desc: 'Current stock / closing stock report',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="9" width="14" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M6 9V6a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
    color: '#16A34A', bg: '#DCFCE7',
  },
  {
    value: 'outstanding', label: 'Outstanding Ledger',
    desc: 'Customer outstanding / party ledger export',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M10 6v4l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
    color: '#D97706', bg: '#FEF3C7',
  },
  {
    value: 'msl', label: 'MSL / Reorder Levels',
    desc: 'Minimum stock levels from Busy or manual sheet',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M4 14l4-4 3 3 5-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    color: '#DC2626', bg: '#FEE2E2',
  },
  {
    value: 'urgent_skus', label: 'Urgent SKUs',
    desc: 'List of SKUs flagged as urgent / priority order',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 3L2 17h16L10 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M10 9v4M10 14.5v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
    color: '#EA580C', bg: '#FFF7ED',
  },
  {
    value: 'sales_invoices', label: 'Sales Invoices',
    desc: 'Busy sales invoice export — for computed outstanding method',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="4" y="2" width="12" height="16" rx="2" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
    color: '#0891B2', bg: '#ECFEFF',
  },
  {
    value: 'payment_receipts', label: 'Payment Receipts',
    desc: 'Busy receipts export — for computed outstanding method',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 5h14v12H3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M3 5l7-3 7 3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M8 11l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    color: '#059669', bg: '#ECFDF5',
  },
];

const STATUS_BADGE = { completed: 'badge-green', failed: 'badge-red', processing: 'badge-blue', pending: 'badge-gray', cancelled: 'badge-gray' };

export default function ImportPage() {
  const toast = useToast();
  const fileRef = useRef();
  const [importType, setImportType] = useState('sales');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastBatch, setLastBatch] = useState(null);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [recentHistory, setRecentHistory] = useState([]);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    api.get('/branches').then(r => {
      const list = r.data || [];
      setBranches(list);
      const home = list.find(b => b.is_home_branch);
      if (home) setBranchId(home.id);
    }).catch(() => {});
    api.get('/imports', { params: { page: 1, limit: 5 } })
      .then(r => setRecentHistory(r.data.data || []))
      .catch(() => {});
  }, []);

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }

  async function handleUpload() {
    if (!file) return toast('Please select a file', 'error');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('import_type', importType);
      if (branchId) fd.append('branch_id', branchId);
      const { data } = await api.post('/imports/upload', fd);
      setLastBatch(data);
      setFile(null);
      toast(`Import queued successfully`, 'success');
      // Refresh recent history
      api.get('/imports', { params: { page: 1, limit: 5 } })
        .then(r => setRecentHistory(r.data.data || []))
        .catch(() => {});
    } catch (err) {
      toast(err.response?.data?.detail || err.response?.data?.error || 'Upload failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  const selected = IMPORT_TYPES.find(t => t.value === importType);

  return (
    <>
      <Topbar
        title="Import Data"
        subtitle="Upload CSV or XLSX files to sync your data"
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, gap: 8 }}>
        <Link href="/import/history" className="btn btn-secondary">View All History</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>

        {/* ── Left column: main form ─────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Import type selector */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Select Import Type</span>
              {selected && (
                <span className="badge badge-blue">{selected.label}</span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
              {IMPORT_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setImportType(t.value)}
                  style={{
                    padding: '14px 10px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                    border: `2px solid ${importType === t.value ? t.color : 'var(--border)'}`,
                    background: importType === t.value ? t.bg : 'var(--surface)',
                    transition: 'all 0.15s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  }}
                >
                  <span style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: importType === t.value ? t.color : 'var(--surface2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: importType === t.value ? '#fff' : 'var(--text3)',
                  }}>
                    {t.icon}
                  </span>
                  <span style={{
                    fontWeight: 600, fontSize: 12, lineHeight: 1.3,
                    color: importType === t.value ? t.color : 'var(--text)',
                  }}>{t.label}</span>
                </button>
              ))}
            </div>
            {selected && (
              <div style={{
                marginTop: 12, padding: '10px 14px',
                background: 'var(--surface2)', borderRadius: 8,
                fontSize: 12, color: 'var(--text2)',
              }}>
                {selected.desc}
              </div>
            )}
          </div>

          {/* Branch selector */}
          {branches.length > 1 && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>Assign to Branch</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setBranchId('')}
                  style={{
                    padding: '7px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 13,
                    border: `1.5px solid ${!branchId ? 'var(--accent)' : 'var(--border)'}`,
                    background: !branchId ? 'var(--accent)' : 'var(--surface)',
                    color: !branchId ? '#fff' : 'var(--text2)',
                    fontWeight: 600,
                  }}
                >
                  All / Unassigned
                </button>
                {branches.map(b => (
                  <button
                    key={b.id}
                    onClick={() => setBranchId(b.id)}
                    style={{
                      padding: '7px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 13,
                      border: `1.5px solid ${branchId === b.id ? 'var(--accent)' : 'var(--border)'}`,
                      background: branchId === b.id ? 'var(--accent)' : 'var(--surface)',
                      color: branchId === b.id ? '#fff' : 'var(--text2)',
                      fontWeight: 600,
                    }}
                  >
                    {b.branch_name}{b.is_home_branch ? ' ★' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Upload zone */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Upload File</div>
            <div
              className={`upload-zone${dragOver || file ? ' drag-over' : ''}`}
              style={{ padding: '48px 24px' }}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              {file ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12,
                    background: 'var(--green-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 15 }}>{file.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                    {(file.size / 1024).toFixed(1)} KB · Click to change
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12,
                    background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="var(--text3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 15 }}>
                    Drop file here or click to browse
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                    Supports CSV, XLSX, XLS — max 20MB
                  </div>
                </div>
              )}
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              {file && (
                <button onClick={e => { e.stopPropagation(); setFile(null); }} className="btn btn-secondary">
                  Remove
                </button>
              )}
              <button
                onClick={handleUpload}
                disabled={!file || loading}
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center', padding: '11px 0', fontSize: 14 }}
              >
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                    Uploading…
                  </span>
                ) : 'Upload & Process'}
              </button>
            </div>
          </div>

          {/* Success result */}
          {lastBatch && (
            <div className="card" style={{ borderLeft: '3px solid var(--green)', background: 'var(--green-bg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <circle cx="9" cy="9" r="8" fill="var(--green)"/>
                  <path d="M5.5 9l2.5 2.5L13 7" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span style={{ fontWeight: 700, color: 'var(--green)', fontSize: 14 }}>Import Queued Successfully</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text2)' }}>
                Batch ID: <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 6px', borderRadius: 4 }}>{lastBatch.batch_id?.slice(0, 8)}…</code>
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text3)' }}>
                Processing in background.{' '}
                <Link href="/import/history" style={{ color: 'var(--accent2)', fontWeight: 600 }}>View History →</Link>
              </div>
            </div>
          )}
        </div>

        {/* ── Right column: help + recent history ─────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Format guide */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>File Format Guide</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'SKU Code', values: 'Item Code, Part No, SKU Code, Product Code' },
                { label: 'Date Column', values: 'Date, Sale Date, Invoice Date, Voucher Date' },
                { label: 'Amount', values: 'Amount, Net Amount, Total, Sale Amount' },
              ].map(tip => (
                <div key={tip.label} style={{ paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text3)', marginBottom: 4 }}>
                    {tip.label}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>{tip.values}</div>
                </div>
              ))}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text3)', marginBottom: 4 }}>
                  Note
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                  Row 1 must be headers. Busy accounting exports are auto-detected and mapped.
                </div>
              </div>
            </div>
          </div>

          {/* Recent imports */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Recent Imports</span>
              <Link href="/import/history" style={{ fontSize: 12, color: 'var(--accent2)', fontWeight: 600 }}>View all →</Link>
            </div>
            {recentHistory.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '20px 0' }}>
                No imports yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {recentHistory.map((item, i) => (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '11px 0',
                    borderBottom: i < recentHistory.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: 'var(--surface2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700, color: 'var(--text3)',
                    }}>
                      {(item.data_type || '?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.file_name || 'Unknown file'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>
                        {item.data_type} · {item.records_imported ?? 0} rows
                      </div>
                    </div>
                    <span className={`badge ${STATUS_BADGE[item.status] || 'badge-gray'}`} style={{ fontSize: 10, flexShrink: 0 }}>
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Supported formats */}
          <div className="card" style={{ background: 'var(--surface2)' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                background: 'var(--blue-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <circle cx="9" cy="9" r="7.5" stroke="var(--blue)" strokeWidth="1.5"/>
                  <path d="M9 8.5v4M9 6h.01" stroke="var(--blue)" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Supported Formats</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
                  <strong>CSV</strong> (.csv) — comma or tab separated<br />
                  <strong>Excel</strong> (.xlsx, .xls) — first sheet is read<br />
                  Max file size: <strong>20 MB</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
