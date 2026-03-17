'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import api from '@/lib/api';

function StatusDot({ status }) {
  const color = status === 'ok' ? 'var(--color-green)' : 'var(--color-red)';
  return <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block', marginRight: 6 }} />;
}

export default function HealthPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api.get('/admin/health').then(r => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  return (
    <>
      <Topbar title="Platform Health" actions={<button className="btn btn-secondary" onClick={load}>Refresh</button>} />
      {loading ? <div style={{ padding: 40, textAlign: 'center' }}>Checking…</div> : !data ? (
        <div className="card" style={{ color: 'var(--color-red)' }}>Unable to reach API</div>
      ) : (
        <div style={{ maxWidth: 600 }}>
          {/* Overall status */}
          <div className="card" style={{ marginBottom: 14, borderLeft: `4px solid ${data.status === 'healthy' ? 'var(--color-green)' : 'var(--color-red)'}` }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              <StatusDot status={data.status === 'healthy' ? 'ok' : 'error'} />
              System {data.status === 'healthy' ? 'Healthy' : 'Degraded'}
            </div>
          </div>

          {/* Services */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title" style={{ marginBottom: 12 }}>Services</div>
            {[
              { label: 'Database (MySQL)', status: data.db?.status, error: data.db?.error },
              { label: 'Cache (Redis)', status: data.redis?.status, error: data.redis?.error },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--color-border)' }}>
                <div>
                  <StatusDot status={s.status} />
                  {s.label}
                  {s.error && <div style={{ fontSize: 11, color: 'var(--color-red)', marginTop: 2 }}>{s.error}</div>}
                </div>
                <span className={`badge ${s.status === 'ok' ? 'badge-green' : 'badge-red'}`}>{s.status}</span>
              </div>
            ))}
          </div>

          {/* System Info */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>System Info</div>
            {[
              ['Active Tenants', data.active_tenants],
              ['API Uptime', `${Math.floor(data.uptime / 3600)}h ${Math.floor((data.uptime % 3600) / 60)}m`],
              ['Heap Used', `${Math.round(data.memory?.heapUsed / 1024 / 1024)} MB`],
              ['Heap Total', `${Math.round(data.memory?.heapTotal / 1024 / 1024)} MB`],
              ['RSS', `${Math.round(data.memory?.rss / 1024 / 1024)} MB`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--color-border)', fontSize: 13 }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{k}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
