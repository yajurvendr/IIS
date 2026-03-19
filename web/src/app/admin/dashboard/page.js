'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import api from '@/lib/api';

function StatCard({ label, value, accent }) {
  return (
    <div className="stat-card" style={accent ? { borderTop: `3px solid ${accent}` } : {}}>
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value">{value}</div>
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/dashboard').then(r => setData(r.data)).finally(() => setLoading(false));
  }, []);

  const d = data || {};

  return (
    <>
      <Topbar title="Platform Dashboard" />
      <div className="grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Total Tenants" value={loading ? '—' : d.total_tenants || 0} />
        <StatCard label="Active" value={loading ? '—' : d.active_tenants || 0} accent="var(--color-green)" />
        <StatCard label="Trial" value={loading ? '—' : d.trial_tenants || 0} accent="var(--color-amber)" />
        <StatCard label="Suspended" value={loading ? '—' : d.suspended_tenants || 0} accent="var(--color-red)" />
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        {/* Plan breakdown */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>Tenants by Plan</div>
          {!loading && d.plan_breakdown?.map(p => (
            <div key={p.plan} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--color-border)', fontSize: 13 }}>
              <span>{p.plan}</span>
              <strong>{p.cnt}</strong>
            </div>
          ))}
        </div>

        {/* Recent tenants */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>Recent Tenants</div>
          {!loading && d.recent_tenants?.map(t => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--color-border)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{t.business_name}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{t.slug}</div>
              </div>
              <span className={`badge ${t.status === 'active' ? 'badge-green' : t.status === 'trial' ? 'badge-amber' : 'badge-red'}`}>{t.status}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
