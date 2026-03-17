'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout, getTenant, getUser } from '@/lib/auth';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

// Global branch context — simple module-level state (no Redux needed)
let _activeBranch = null; // { id, branch_code, branch_name } or null = consolidated
const _listeners = new Set();
export function getActiveBranch() { return _activeBranch; }
export function setActiveBranch(b) { _activeBranch = b; _listeners.forEach(fn => fn(b)); }
export function useActiveBranch() {
  const [branch, setBranch] = useState(_activeBranch);
  useEffect(() => {
    _listeners.add(setBranch);
    return () => _listeners.delete(setBranch);
  }, []);
  return [branch, setActiveBranch];
}

export default function Sidebar() {
  const pathname = usePathname();
  const [tenant, setTenant] = useState(null);
  const [user, setUser] = useState(null);
  const [badges, setBadges] = useState({ seasonal: 0, urgent: 0 });
  const [branches, setBranches] = useState([]);
  const [activeBranch, _setActiveBranch] = useActiveBranch();
  const [branchOpen, setBranchOpen] = useState(false);

  useEffect(() => {
    setTenant(getTenant());
    setUser(getUser());
  }, []);

  useEffect(() => {
    api.get('/dashboard').then(r => {
      setBadges({
        seasonal: r.data.seasonal_alerts?.length || 0,
        urgent:   r.data.urgent_skus || 0,
      });
    }).catch(() => {});
    api.get('/branches/').then(r => setBranches(r.data || [])).catch(() => {});
  }, []);

  const NAV_GROUPS = [
    {
      label: 'MAIN',
      items: [
        { href: '/dashboard', label: 'Dashboard',   icon: DashIcon },
        { href: '/import',    label: 'Data Import', icon: UploadIcon },
      ],
    },
    {
      label: 'INVENTORY',
      items: [
        { href: '/inventory',              label: 'Inventory Health',  icon: BoxIcon },
        { href: '/branches/comparison',    label: 'Branch Comparison', icon: BranchIcon },
        { href: '/branches/transfer/log',  label: 'Stock Transfers',   icon: TransferIcon },
      ],
    },
    {
      label: 'ORDERS',
      items: [
        { href: '/po-advisor',                label: 'PO Advisor',    icon: ClipboardIcon },
        { href: '/reorder',                   label: 'Smart Reorder', icon: ReorderIcon },
        { href: '/seasonal/pre-season-alert', label: 'Urgent SKUs',   icon: AlertIcon, badgeKey: 'urgent', badgeColor: '#EF4444' },
      ],
    },
    {
      label: 'REPORTS',
      items: [
        { href: '/reports/sales-forecast',           label: 'Sales Forecast',   icon: ForecastIcon },
        { href: '/reports/top-300',                  label: 'Top 300 SKUs',     icon: RankIcon },
        { href: '/reports/focus-sku',                label: 'Focus SKUs',       icon: StarIcon },
        { href: '/reports/msl-review',               label: 'MSL Review',       icon: MslIcon },
        { href: '/reports/volume-profit-divergence', label: 'Volume vs Profit', icon: DivergenceIcon },
      ],
    },
    {
      label: 'FINANCE',
      items: [
        { href: '/profitability', label: 'Profitability', icon: TrendIcon },
        { href: '/outstanding',   label: 'Outstanding',   icon: ReceiptIcon },
      ],
    },
  ];

  const initials = user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U';

  return (
    <aside style={{
      position: 'fixed', left: 0, top: 0, bottom: 0,
      width: 'var(--sidebar-width)',
      background: 'var(--sb-bg)',
      borderRight: '1px solid var(--sb-border)',
      display: 'flex', flexDirection: 'column',
      zIndex: 100,
      overflowY: 'auto',
    }}>

      {/* ── Brand ──────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '18px 16px 16px',
        borderBottom: '1px solid var(--sb-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          {/* Logo mark — gradient square */}
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #6366F1 0%, #818CF8 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 13, color: '#fff', letterSpacing: '-0.02em',
            flexShrink: 0, boxShadow: '0 4px 12px rgba(99,102,241,0.45)',
          }}>IIS</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#F1F5F9', letterSpacing: '-0.02em' }}>
              Inventory Intelligence
            </div>
            <div style={{ fontSize: 11, color: 'var(--sb-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
              {tenant?.name || 'Your Business'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Branch Selector ────────────────────────────────────────────────── */}
      {branches.length > 0 && (
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--sb-border)', position: 'relative' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--sb-text-muted)', letterSpacing: '0.08em', marginBottom: 5, textTransform: 'uppercase' }}>
            Branch View
          </div>
          <button
            onClick={() => setBranchOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 10px', borderRadius: 8,
              border: '1px solid var(--sb-surface)',
              background: 'var(--sb-surface)',
              cursor: 'pointer', fontFamily: 'inherit',
              color: 'var(--sb-text)', fontSize: 12, fontWeight: 500,
            }}
          >
            <BranchIcon size={13} color="var(--sb-active-text)" />
            <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeBranch ? `${activeBranch.branch_code} — ${activeBranch.branch_name}` : 'All Branches'}
            </span>
            <span style={{ fontSize: 9, color: 'var(--sb-text-muted)' }}>▾</span>
          </button>

          {branchOpen && (
            <div style={{
              position: 'absolute', left: 12, right: 12, top: '100%', zIndex: 200,
              background: '#1E293B', border: '1px solid #334155',
              borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', overflow: 'hidden',
            }}>
              {[null, ...branches].map((b, i) => {
                const isActive = b === null ? !activeBranch : activeBranch?.id === b.id;
                return (
                  <div key={b?.id || 'all'}
                    onClick={() => { _setActiveBranch(b); setBranchOpen(false); }}
                    style={{
                      padding: '9px 12px', cursor: 'pointer', fontSize: 12,
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? '#A5B4FC' : '#CBD5E1',
                      background: isActive ? 'rgba(99,102,241,0.15)' : 'transparent',
                      borderBottom: i < branches.length ? '1px solid #334155' : 'none',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = isActive ? 'rgba(99,102,241,0.15)' : 'transparent'; }}
                  >
                    {b === null
                      ? 'All Branches (Consolidated)'
                      : <><span style={{ fontWeight: 600 }}>{b.branch_code}</span> — {b.branch_name}
                        {b.is_home_branch && <span style={{ fontSize: 10, color: 'var(--sb-text-muted)', marginLeft: 6 }}>HQ</span>}
                      </>
                    }
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <nav style={{ flex: 1, padding: '8px 0 8px' }}>
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            {/* Section label */}
            <div style={{
              fontSize: 10, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.1em',
              color: 'var(--sb-text-muted)',
              padding: '16px 20px 5px',
            }}>
              {group.label}
            </div>

            {group.items.map(item => {
              const active = pathname === item.href ||
                pathname.startsWith(item.href + '/') ||
                (item.activeAlso || []).some(p => pathname === p || pathname.startsWith(p + '/'));
              const Icon = item.icon;
              const badge = item.badgeKey ? badges[item.badgeKey] : null;

              return (
                <Link key={item.href} href={item.href} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 16px 8px 20px',
                  margin: '1px 8px',
                  borderRadius: 9,
                  color: active ? 'var(--sb-active-text)' : 'var(--sb-text)',
                  background: active ? 'var(--sb-active-bg)' : 'transparent',
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  transition: 'all 0.13s',
                  textDecoration: 'none',
                  position: 'relative',
                  borderLeft: active ? '3px solid #6366F1' : '3px solid transparent',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--sb-hover-bg)'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  <Icon size={15} color={active ? '#818CF8' : '#64748B'} />
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {badge > 0 && (
                    <span style={{
                      background: item.badgeColor || '#6366F1',
                      color: '#fff', fontSize: 10, fontWeight: 700,
                      padding: '1px 6px', borderRadius: 99,
                      minWidth: 18, textAlign: 'center',
                    }}>{badge}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── Trial badge ────────────────────────────────────────────────────── */}
      {tenant?.status === 'trial' && (
        <div style={{
          margin: '0 10px 10px',
          padding: '10px 12px',
          background: 'rgba(245,158,11,0.12)',
          borderRadius: 9,
          border: '1px solid rgba(245,158,11,0.25)',
        }}>
          <div style={{ fontSize: 11, color: '#FCD34D', fontWeight: 700 }}>Trial Mode</div>
          <div style={{ fontSize: 10, color: 'var(--sb-text-muted)', marginTop: 2 }}>Upgrade to unlock all features</div>
        </div>
      )}

      {/* ── User + Logout ──────────────────────────────────────────────────── */}
      <div style={{
        borderTop: '1px solid var(--sb-border)',
        padding: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
          {/* Avatar */}
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366F1 0%, #818CF8 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0,
            boxShadow: '0 2px 8px rgba(99,102,241,0.4)',
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#F1F5F9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name || 'User'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--sb-text-muted)', textTransform: 'capitalize' }}>
              {user?.role?.replace('_', ' ') || 'Tenant User'}
            </div>
          </div>
        </div>

        <button onClick={logout} style={{
          width: '100%', padding: '7px 10px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--sb-surface)',
          borderRadius: 8, color: 'var(--sb-text-muted)',
          cursor: 'pointer', fontSize: 12, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: 'inherit', transition: 'all 0.13s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; e.currentTarget.style.color = '#FCA5A5'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--sb-text-muted)'; e.currentTarget.style.borderColor = 'var(--sb-surface)'; }}>
          <LogoutIcon size={13} color="currentColor" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

/* ── Icons ─────────────────────────────────────────────────────────────── */
function DashIcon({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <rect x="1" y="1" width="6" height="6" rx="1.5" fill={color}/>
    <rect x="9" y="1" width="6" height="6" rx="1.5" fill={color} fillOpacity="0.4"/>
    <rect x="1" y="9" width="6" height="6" rx="1.5" fill={color} fillOpacity="0.4"/>
    <rect x="9" y="9" width="6" height="6" rx="1.5" fill={color}/>
  </svg>;
}
function UploadIcon({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M8 10V2M5 5l3-3 3 3" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2 12v2h12v-2" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
function BoxIcon({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M2 5.5L8 2l6 3.5v5L8 14l-6-3.5v-5z" stroke={color} strokeWidth="1.4" strokeLinejoin="round"/>
    <path d="M8 2v12M2 5.5l6 3.5 6-3.5" stroke={color} strokeWidth="1.4" strokeLinejoin="round"/>
  </svg>;
}
function BranchIcon({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <rect x="1" y="1" width="5" height="4" rx="1" stroke={color} strokeWidth="1.3"/>
    <rect x="10" y="1" width="5" height="4" rx="1" stroke={color} strokeWidth="1.3"/>
    <rect x="5.5" y="11" width="5" height="4" rx="1" stroke={color} strokeWidth="1.3"/>
    <path d="M3.5 5v2.5H8v3M12.5 5v2.5H8" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
function TransferIcon({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M2 5h12M11 2l3 3-3 3" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M14 11H2M5 8l-3 3 3 3" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
function ClipboardIcon({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <rect x="3" y="3" width="10" height="12" rx="1.5" stroke={color} strokeWidth="1.4"/>
    <path d="M6 3V2.5C6 1.67 6.67 1 7.5 1h1C9.33 1 10 1.67 10 2.5V3" stroke={color} strokeWidth="1.4"/>
    <path d="M6 7h4M6 10h3" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
  </svg>;
}
function ReorderIcon({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M2 4h12M2 8h8M2 12h5" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
    <circle cx="13" cy="11" r="2.5" stroke={color} strokeWidth="1.3"/>
    <path d="M13 9.5v1.5l1 1" stroke={color} strokeWidth="1.2" strokeLinecap="round"/>
  </svg>;
}
function AlertIcon({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M8 1l7 13H1L8 1z" stroke={color} strokeWidth="1.4" strokeLinejoin="round"/>
    <path d="M8 6v3.5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="8" cy="11.5" r="0.75" fill={color}/>
  </svg>;
}
function ForecastIcon({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M1 13L5 8l3 2.5L11 5l4 3" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 3h3v3" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
function RankIcon({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <rect x="1" y="9" width="3" height="6" rx="1" fill={color} fillOpacity="0.4"/>
    <rect x="6" y="5" width="3" height="10" rx="1" fill={color} fillOpacity="0.7"/>
    <rect x="11" y="1" width="4" height="14" rx="1" fill={color}/>
  </svg>;
}
function StarIcon({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M8 1l2 4.5h4.5L11 8.5l1.5 5L8 11l-4.5 2.5L5 8.5 1.5 5.5H6L8 1z" stroke={color} strokeWidth="1.3" strokeLinejoin="round"/>
  </svg>;
}
function MslIcon({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <rect x="1" y="1" width="14" height="14" rx="2" stroke={color} strokeWidth="1.3"/>
    <path d="M4 8h8M4 5h5M4 11h6" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
  </svg>;
}
function DivergenceIcon({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M2 14l4-8 2 4 4-8" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="14" cy="4" r="1.5" fill={color} fillOpacity="0.6"/>
  </svg>;
}
function TrendIcon({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M2 12l4-4 3 2 5-6" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M10 4h4v4" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
function ReceiptIcon({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M3 2h10v13l-2-1.5L9 15l-2-1.5L5 15l-2-1.5V2z" stroke={color} strokeWidth="1.4" strokeLinejoin="round"/>
    <path d="M6 6h4M6 9h3" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
  </svg>;
}
function GearIcon({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.8"/>
  </svg>;
}
function LogoutIcon({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M10 5l3 3-3 3M13 8H6" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
