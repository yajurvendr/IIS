'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import { useToast } from '@/components/ui/Toast';
import api from '@/lib/api';
import { formatDate } from '@/lib/formatters';

const DAYS = [
  { value: 'mon', label: 'Monday' },
  { value: 'tue', label: 'Tuesday' },
  { value: 'wed', label: 'Wednesday' },
  { value: 'thu', label: 'Thursday' },
  { value: 'fri', label: 'Friday' },
  { value: 'sat', label: 'Saturday' },
  { value: 'sun', label: 'Sunday' },
];

function pad(n) { return String(n).padStart(2, '0'); }

function toTimeString(hour, minute) {
  return `${pad(hour)}:${pad(minute)}`;
}

function fromTimeString(str) {
  const [h, m] = str.split(':').map(Number);
  return { hour: h || 0, minute: m || 0 };
}

export default function BusySyncPage() {
  const toast = useToast();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [form, setForm] = useState({
    busy_host: '',
    busy_port: 981,
    busy_username: '',
    busy_password: '',
    busy_enabled: false,
  });

  const [schedule, setSchedule] = useState({
    tx_time: '23:00',
    masters_time: '01:00',
    masters_day: 'sun',
  });

  function loadConfig() {
    setLoading(true);
    api.get('/settings/busy-config')
      .then(r => {
        setConfig(r.data);
        setForm({
          busy_host:     r.data.busy_host || '',
          busy_port:     r.data.busy_port || 981,
          busy_username: r.data.busy_username || '',
          busy_password: '',
          busy_enabled:  r.data.busy_enabled || false,
        });
        setSchedule({
          tx_time:     toTimeString(r.data.busy_transactions_hour ?? 23, r.data.busy_transactions_minute ?? 0),
          masters_time: toTimeString(r.data.busy_masters_hour ?? 1, r.data.busy_masters_minute ?? 0),
          masters_day:  r.data.busy_masters_day || 'sun',
        });
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadConfig(); }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const tx = fromTimeString(schedule.tx_time);
      const masters = fromTimeString(schedule.masters_time);
      const payload = {
        busy_host:     form.busy_host || null,
        busy_port:     Number(form.busy_port) || 981,
        busy_username: form.busy_username || null,
        busy_enabled:  form.busy_enabled,
        busy_transactions_hour:   tx.hour,
        busy_transactions_minute: tx.minute,
        busy_masters_hour:   masters.hour,
        busy_masters_minute: masters.minute,
        busy_masters_day:    schedule.masters_day,
      };
      if (form.busy_password) payload.busy_password = form.busy_password;
      await api.patch('/settings/busy-config', payload);
      toast('Busy configuration saved.', 'success');
      setForm(f => ({ ...f, busy_password: '' }));
      loadConfig();
    } catch (err) {
      toast(err.response?.data?.detail || 'Failed to save', 'error');
    } finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const r = await api.post('/settings/busy-config/test');
      toast(r.data.message || 'Connection successful!', 'success');
    } catch (err) {
      toast(err.response?.data?.detail || 'Connection test failed', 'error');
    } finally { setTesting(false); }
  }

  async function handleSyncNow() {
    setSyncing(true);
    try {
      const r = await api.post('/settings/busy-config/sync-now');
      toast(r.data.message || 'Sync queued!', 'success');
    } catch (err) {
      toast(err.response?.data?.detail || 'Failed to trigger sync', 'error');
    } finally { setSyncing(false); }
  }

  const isConfigured = config?.busy_host && config?.busy_username;

  return (
    <>
      <Topbar title="Busy Sync Configuration" backHref="/settings" />

      {/* Status banner */}
      {!loading && (
        <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: config?.busy_enabled ? '#22c55e' : '#e5e7eb' }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {config?.busy_enabled ? 'Busy Sync Enabled' : 'Busy Sync Disabled'}
              </div>
              {config?.busy_last_sync_at && (
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  Last sync: {formatDate(config.busy_last_sync_at)}
                </div>
              )}
              {!config?.busy_last_sync_at && isConfigured && (
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  Never synced — run "Sync Now" to perform initial sync
                </div>
              )}
            </div>
          </div>
          {isConfigured && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" style={{ fontSize: 13 }}
                onClick={handleTest} disabled={testing}>
                {testing ? 'Testing…' : 'Test Connection'}
              </button>
              <button className="btn btn-primary" style={{ fontSize: 13 }}
                onClick={handleSyncNow} disabled={syncing || !config?.busy_enabled}>
                {syncing ? 'Queuing…' : 'Sync Now'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Config form */}
      <div className="card">
        <div style={{ marginBottom: 20 }}>
          <div className="card-title" style={{ marginBottom: 3 }}>Connection Settings</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Configure the BUSY Web Service connection. The BUSY application must have the
            web service running on the specified host and port (default: 981).
          </div>
        </div>

        {loading ? (
          <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</div>
        ) : (
          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, marginBottom: 24 }}>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Host / IP Address</label>
                <input className="form-input" type="text"
                  value={form.busy_host}
                  onChange={e => setForm(f => ({ ...f, busy_host: e.target.value }))}
                  placeholder="e.g. 192.168.1.10 or localhost" />
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                  IP or hostname of the machine running BUSY
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Port</label>
                <input className="form-input" type="number" min="1" max="65535"
                  value={form.busy_port}
                  onChange={e => setForm(f => ({ ...f, busy_port: e.target.value }))}
                  placeholder="981" />
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                  BUSY Web Service port (default: 981)
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">BUSY Username</label>
                <input className="form-input" type="text" autoComplete="off"
                  value={form.busy_username}
                  onChange={e => setForm(f => ({ ...f, busy_username: e.target.value }))}
                  placeholder="BUSY company username" />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">
                  BUSY Password{config?.busy_host && (
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 400 }}> (leave blank to keep existing)</span>
                  )}
                </label>
                <input className="form-input" type="password" autoComplete="new-password"
                  value={form.busy_password}
                  onChange={e => setForm(f => ({ ...f, busy_password: e.target.value }))}
                  placeholder={config?.busy_host ? '••••••• (unchanged)' : 'BUSY company password'} />
              </div>

            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.busy_enabled}
                  onChange={e => setForm(f => ({ ...f, busy_enabled: e.target.checked }))}
                  style={{ width: 16, height: 16 }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Enable Busy Sync</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    When enabled, IIS will automatically sync from BUSY on the schedule below.
                  </div>
                </div>
              </label>
            </div>

            {/* ── Sync Schedule ── */}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 20, marginBottom: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Sync Schedule</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 18 }}>
                Set when each automatic sync runs. Times are in IST (Indian Standard Time). Changes take effect immediately after saving.
              </div>

              {/* Delta Transactions */}
              <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '14px 18px', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Delta Transactions</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                      Syncs today's sales &amp; purchase vouchers. Runs daily at the selected time.
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Time (IST)</label>
                    <input
                      type="time"
                      className="form-input"
                      style={{ width: 120 }}
                      value={schedule.tx_time}
                      onChange={e => setSchedule(s => ({ ...s, tx_time: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Delta Masters */}
              <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '14px 18px', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Delta Masters</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                      Syncs items &amp; accounts modified in the last 7 days. Runs weekly on the selected day.
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Day</label>
                      <select
                        className="form-input"
                        style={{ width: 130 }}
                        value={schedule.masters_day}
                        onChange={e => setSchedule(s => ({ ...s, masters_day: e.target.value }))}
                      >
                        {DAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Time (IST)</label>
                      <input
                        type="time"
                        className="form-input"
                        style={{ width: 120 }}
                        value={schedule.masters_time}
                        onChange={e => setSchedule(s => ({ ...s, masters_time: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Full Masters (manual only) */}
              <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Full Masters</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                      Full sync of all items &amp; accounts. Recommended for initial setup or after bulk changes in BUSY.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: 13 }}
                    onClick={handleSyncNow}
                    disabled={syncing || !config?.busy_enabled}
                  >
                    {syncing ? 'Syncing…' : 'Sync Now'}
                  </button>
                </div>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: 160 }}>
              {saving ? 'Saving…' : 'Save Configuration'}
            </button>
          </form>
        )}
      </div>
    </>
  );
}
