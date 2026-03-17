'use client';
import { useState, useEffect } from 'react';
import { getUser } from '@/lib/auth';
export default function Topbar({ title, actions }) {
  const [user, setUser] = useState(null);
  useEffect(() => { setUser(getUser()); }, []);
  return (
    <header style={{
      position: 'fixed', top: 0, left: 'var(--sidebar-width)', right: 0,
      height: 'var(--topbar-height)', background: '#fff',
      borderBottom: '1px solid var(--color-border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 22px', zIndex: 90,
    }}>
      <h1 style={{ fontSize: 17, fontWeight: 700 }}>{title}</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {actions}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>
            {user?.name?.[0]?.toUpperCase() || 'A'}
          </div>
          <span style={{ fontSize: 13 }}>{user?.name || 'Admin'}</span>
        </div>
      </div>
    </header>
  );
}
