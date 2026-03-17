'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/lib/auth';

const NAV = [
  { href: '/dashboard',      label: 'Dashboard',      icon: '⊞' },
  { href: '/tenants',        label: 'Tenants',         icon: '🏢' },
  { href: '/plans',          label: 'Plans',           icon: '💳' },
  { href: '/users',          label: 'Users',           icon: '👥' },
  { href: '/announcements',  label: 'Announcements',   icon: '📣' },
  { href: '/audit',          label: 'Audit Log',       icon: '🔍' },
  { href: '/health',         label: 'Platform Health', icon: '❤' },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside style={{
      position: 'fixed', left: 0, top: 0, bottom: 0, width: 'var(--sidebar-width)',
      background: 'var(--color-primary)', display: 'flex', flexDirection: 'column', zIndex: 100,
    }}>
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>IIS Admin</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Super Admin Portal</div>
      </div>
      <nav style={{ flex: 1, padding: '6px 0' }}>
        {NAV.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
              color: active ? '#fff' : 'rgba(255,255,255,0.6)',
              background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
              borderLeft: active ? '3px solid var(--color-accent)' : '3px solid transparent',
              fontSize: 13, fontWeight: active ? 600 : 400,
            }}>
              <span>{item.icon}</span>{item.label}
            </Link>
          );
        })}
      </nav>
      <button onClick={logout} style={{
        margin: '0 10px 14px', padding: '8px 12px',
        background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 6, color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 12,
      }}>⎋ Logout</button>
    </aside>
  );
}
