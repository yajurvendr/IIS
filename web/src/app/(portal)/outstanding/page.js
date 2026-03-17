'use client';
import { useEffect, useState, useCallback } from 'react';
import Topbar from '@/components/layout/Topbar';
import DataTable from '@/components/ui/DataTable';
import Pagination from '@/components/ui/Pagination';
import api from '@/lib/api';
import { getTenant } from '@/lib/auth';
import { formatINR, formatDate } from '@/lib/formatters';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fillTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

function waPhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

const FOLLOWUP_STATUS_META = {
  followup_pending:    { label: 'Pending',    cls: 'badge badge-amber' },
  customer_promised:   { label: 'Promised',   cls: 'badge badge-blue'  },
  reminder_snoozed:    { label: 'Snoozed',    cls: 'badge badge-green' },
  escalation_required: { label: 'Escalated',  cls: 'badge badge-red'   },
  auto_closed:         { label: 'Closed',     cls: 'badge badge-green' },
};

function FollowupBadge({ status }) {
  const m = FOLLOWUP_STATUS_META[status] || { label: status, cls: 'badge' };
  return <span className={m.cls}>{m.label}</span>;
}

// ── Inline Follow-up Panel ────────────────────────────────────────────────────

function FollowupPanel({ customerId, customerCode, customerName, onClose }) {
  // invoice_ref = customerCode (customer-level follow-up)
  const invoiceRef = customerCode;

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Add comment / promised payment form
  const [comment, setComment] = useState('');
  const [promisedDate, setPromisedDate] = useState('');
  const [saving, setSaving] = useState(false);

  // Snooze form
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [snoozeDate, setSnoozeDate] = useState('');
  const [snoozeSaving, setSnoozeSaving] = useState(false);

  // Escalate form
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalateComment, setEscalateComment] = useState('');
  const [escalateSaving, setEscalateSaving] = useState(false);

  const loadHistory = useCallback(() => {
    setLoadingHistory(true);
    api.get('/outstanding/followups', { params: { invoice_ref: invoiceRef } })
      .then(r => setHistory(r.data.data || []))
      .finally(() => setLoadingHistory(false));
  }, [invoiceRef]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function handleAddFollowup() {
    if (!comment && !promisedDate) return;
    setSaving(true);
    try {
      await api.post('/outstanding/followups', {
        invoice_ref: invoiceRef,
        customer_id: customerId || null,
        comment: comment || null,
        promised_payment_dt: promisedDate || null,
      });
      setComment(''); setPromisedDate('');
      loadHistory();
    } finally { setSaving(false); }
  }

  async function handleSnooze() {
    if (!snoozeDate) return;
    setSnoozeSaving(true);
    try {
      await api.post('/outstanding/followups/snooze', {
        invoice_ref: invoiceRef, snoozed_until: snoozeDate,
      });
      setSnoozeOpen(false); setSnoozeDate('');
      loadHistory();
    } finally { setSnoozeSaving(false); }
  }

  async function handleEscalate() {
    setEscalateSaving(true);
    try {
      await api.post('/outstanding/followups/escalate', {
        invoice_ref: invoiceRef, comment: escalateComment || null,
      });
      setEscalateOpen(false); setEscalateComment('');
      loadHistory();
    } finally { setEscalateSaving(false); }
  }

  const latestStatus = history[0]?.followup_status;

  return (
    <div style={{
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      background: 'var(--color-surface)',
      padding: 16,
      marginTop: 4,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          Follow-up: {customerName}
          {latestStatus && <span style={{ marginLeft: 10 }}><FollowupBadge status={latestStatus} /></span>}
        </div>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onClose}>✕ Close</button>
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* Left: add new followup */}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Add Follow-up</div>

          <textarea
            className="form-input"
            placeholder="Comment / notes…"
            rows={3}
            value={comment}
            onChange={e => setComment(e.target.value)}
            style={{ width: '100%', fontSize: 13, marginBottom: 8, resize: 'vertical' }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
              Promised date:
            </label>
            <input type="date" className="form-input"
              value={promisedDate} onChange={e => setPromisedDate(e.target.value)}
              style={{ fontSize: 12, padding: '4px 8px' }} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 14px' }}
              onClick={handleAddFollowup} disabled={saving || (!comment && !promisedDate)}>
              {saving ? 'Saving…' : promisedDate ? 'Save Promised Date' : 'Add Comment'}
            </button>

            {/* Snooze */}
            {!snoozeOpen && !escalateOpen && (
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }}
                onClick={() => setSnoozeOpen(true)}>
                Snooze
              </button>
            )}

            {/* Escalate */}
            {!escalateOpen && !snoozeOpen && (
              <button className="btn btn-ghost"
                style={{ fontSize: 12, padding: '5px 12px', color: 'var(--color-danger, #e53e3e)' }}
                onClick={() => setEscalateOpen(true)}>
                Escalate
              </button>
            )}
          </div>

          {/* Snooze sub-form */}
          {snoozeOpen && (
            <div style={{ marginTop: 10, padding: 10, background: '#FFFBEB',
              border: '1px solid #FCD34D', borderRadius: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Snooze until:</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="date" className="form-input" value={snoozeDate}
                  onChange={e => setSnoozeDate(e.target.value)}
                  style={{ fontSize: 12, padding: '4px 8px' }} />
                <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 12px' }}
                  onClick={handleSnooze} disabled={snoozeSaving || !snoozeDate}>
                  {snoozeSaving ? '…' : 'Snooze'}
                </button>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => setSnoozeOpen(false)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Escalate sub-form */}
          {escalateOpen && (
            <div style={{ marginTop: 10, padding: 10, background: '#FFF5F5',
              border: '1px solid #FC8181', borderRadius: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#C53030' }}>
                Escalate to Admin:
              </div>
              <textarea className="form-input" placeholder="Reason for escalation…"
                rows={2} value={escalateComment} onChange={e => setEscalateComment(e.target.value)}
                style={{ width: '100%', fontSize: 12, marginBottom: 8, resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary"
                  style={{ fontSize: 12, padding: '4px 12px',
                    background: '#E53E3E', border: 'none', color: '#fff' }}
                  onClick={handleEscalate} disabled={escalateSaving}>
                  {escalateSaving ? '…' : 'Confirm Escalate'}
                </button>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => setEscalateOpen(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        {/* Right: history */}
        <div style={{ flex: 1, borderLeft: '1px solid var(--color-border)', paddingLeft: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>History</div>
          {loadingHistory ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Loading…</div>
          ) : history.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
              No follow-up history yet.
            </div>
          ) : (
            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map(h => (
                <div key={h.id} style={{ padding: '8px 10px', borderRadius: 6,
                  background: 'var(--color-bg)', border: '1px solid var(--color-border)', fontSize: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <FollowupBadge status={h.followup_status} />
                    <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
                      {formatDate(h.created_at)} · {h.created_by_name || 'System'}
                    </span>
                  </div>
                  {h.comment && <div style={{ marginBottom: 3 }}>{h.comment}</div>}
                  {h.promised_payment_dt && (
                    <div style={{ color: 'var(--color-primary)', fontSize: 11 }}>
                      Promised by: {formatDate(h.promised_payment_dt)}
                    </div>
                  )}
                  {h.snoozed_until && (
                    <div style={{ color: '#B7791F', fontSize: 11 }}>
                      Snoozed until: {formatDate(h.snoozed_until)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OutstandingPage() {
  const tenant = getTenant();

  const [data, setData] = useState([]);
  const [ageing, setAgeing] = useState({});
  const [totalAmount, setTotalAmount] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ ageing_bucket: '', search: '' });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // WhatsApp template
  const [templates, setTemplates] = useState([]);
  const [selectedTpl, setSelectedTpl] = useState('');

  // Expanded follow-up panels: Set of customer_code keys
  const [expandedFollowup, setExpandedFollowup] = useState(null);

  function load(p = 1) {
    setLoading(true);
    api.get('/reports/outstanding', { params: { ...filters, page: p, limit: 30 } }).then(r => {
      setData(r.data.data);
      setTotal(r.data.total || 0);
      setTotalAmount(r.data.total_amount || 0);
      setAgeing(r.data.ageing || {});
    }).finally(() => setLoading(false));
  }

  useEffect(() => { load(1); setPage(1); }, [filters]);
  useEffect(() => { if (page > 1) load(page); }, [page]);

  useEffect(() => {
    api.get('/settings/whatsapp-templates')
      .then(r => {
        const tpls = r.data.data || [];
        setTemplates(tpls);
        if (tpls.length > 0) setSelectedTpl(tpls[0].id);
      })
      .catch(() => {});
  }, []);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await api.get('/reports/outstanding/export', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = 'outstanding_report.xlsx'; a.click();
    } finally { setExporting(false); }
  }

  async function handleExportPdf() {
    setExporting(true);
    try {
      const res = await api.get('/reports/outstanding/export-pdf', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = 'outstanding_report.pdf'; a.click();
    } finally { setExporting(false); }
  }

  function sendWhatsApp(row) {
    const phone = waPhone(row.phone);
    if (!phone) return;

    const tpl = templates.find(t => t.id === selectedTpl);
    const messageBody = tpl
      ? tpl.message_body
      : 'Dear {customer_name}, your outstanding amount of {outstanding_amount} is pending. Kindly settle at the earliest. — {shop_name}';

    const dueDate = row.max_overdue_days
      ? new Date(Date.now() - parseInt(row.max_overdue_days) * 86400000)
          .toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';

    const message = fillTemplate(messageBody, {
      customer_name:      row.name || '',
      outstanding_amount: formatINR(row.total_outstanding),
      due_date:           dueDate,
      shop_name:          tenant?.name || tenant?.business_name || 'IIS',
    });

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  }

  const buckets = [
    { label: '0–30 days', key: 'bucket_0_30', filter: '0-30' },
    { label: '31–60 days', key: 'bucket_31_60', filter: '31-60' },
    { label: '61–90 days', key: 'bucket_61_90', filter: '61-90' },
    { label: '90+ days', key: 'bucket_90plus', filter: '90+' },
  ];

  return (
    <>
      <Topbar
        title="Customer Outstanding"
      />

      {/* Total + Ageing Buckets */}
      <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Total Outstanding</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-red)' }}>{formatINR(totalAmount, true)}</div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {buckets.map(b => (
            <button key={b.key} onClick={() => setFilters(f => ({ ...f, ageing_bucket: f.ageing_bucket === b.filter ? '' : b.filter }))}
              style={{
                textAlign: 'center', padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                border: `2px solid ${filters.ageing_bucket === b.filter ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background: filters.ageing_bucket === b.filter ? '#EBF8FF' : '#fff',
              }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{b.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-primary)' }}>{formatINR(ageing[b.key] || 0, true)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="form-input" placeholder="Search by customer name or phone…" value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} style={{ width: 300 }} />

          {templates.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>WA Template:</span>
              <select className="form-select" style={{ fontSize: 12, padding: '5px 30px 5px 10px' }}
                value={selectedTpl} onChange={e => setSelectedTpl(e.target.value)}>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="btn btn-secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
          <button className="btn btn-secondary" onClick={handleExportPdf} disabled={exporting}
            style={{ background: '#FFF5F5', borderColor: '#FC8181', color: '#C53030' }}>
            Export PDF
          </button>
        </div>
      </div>

      <DataTable
          loading={loading}
          columns={[
            { key: 'name', label: 'Customer Name' },
            { key: 'customer_code', label: 'Code', width: 100 },
            { key: 'phone', label: 'Phone', width: 130 },
            { key: 'invoice_count', label: 'Invoices', width: 80 },
            {
              key: 'total_outstanding', label: 'Outstanding',
              render: v => <strong style={{ color: 'var(--color-red)' }}>{formatINR(v, true)}</strong>
            },
            {
              key: 'max_overdue_days', label: 'Overdue',
              render: v => {
                const days = parseInt(v) || 0;
                const cls = days > 90 ? 'badge-red' : days > 60 ? 'badge-amber' : 'badge-green';
                return <span className={`badge ${cls}`}>{days} days</span>;
              }
            },
            {
              key: '_whatsapp', label: 'WhatsApp', width: 110,
              render: (_, row) => {
                const phone = waPhone(row.phone);
                return (
                  <button
                    onClick={() => sendWhatsApp(row)}
                    disabled={!phone}
                    title={phone ? `Send to ${row.phone}` : 'No phone number'}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      border: 'none', cursor: phone ? 'pointer' : 'not-allowed',
                      background: phone ? '#25D366' : 'var(--color-border)',
                      color: phone ? '#fff' : 'var(--color-text-muted)',
                    }}
                  >
                    <span style={{ fontSize: 14 }}>💬</span> Send
                  </button>
                );
              }
            },
            {
              key: '_followup', label: 'Follow Up', width: 120,
              render: (_, row) => {
                const key = row.customer_code || row.id;
                const active = expandedFollowup === key;
                return (
                  <button
                    className={active ? 'btn btn-primary' : 'btn btn-ghost'}
                    style={{ fontSize: 12, padding: '4px 12px' }}
                    onClick={() => setExpandedFollowup(active ? null : key)}
                  >
                    {active ? '▲ Close' : '▼ Follow Up'}
                  </button>
                );
              }
            },
          ]}
          data={data}
          emptyText="No outstanding invoices"
          expandedRow={(row) => {
            const key = row.customer_code || row.id;
            if (expandedFollowup !== key) return null;
            return (
              <FollowupPanel
                customerId={row.customer_id || row.id}
                customerCode={key}
                customerName={row.name}
                onClose={() => setExpandedFollowup(null)}
              />
            );
          }}
          footer={<Pagination page={page} total={total} limit={30} onChange={setPage} />}
        />
    </>
  );
}
