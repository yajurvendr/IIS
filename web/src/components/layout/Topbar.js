'use client';
import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { useState, useRef, useEffect } from 'react';

export default function Topbar({ title, subtitle, actions, backHref, backLabel = 'Settings' }) {
  const [user, setUser] = useState(null);
  const initials = user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U';
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);

  useEffect(() => { setUser(getUser()); }, []);

  // Close notif panel on outside click
  useEffect(() => {
    if (!notifOpen) return;
    function handle(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [notifOpen]);

  return (
    <header style={{
      position: 'fixed', top: 0, left: 'var(--sidebar-width)', right: 0,
      height: 'var(--topbar-height)',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px', zIndex: 90,
      boxShadow: '0 1px 0 var(--border)',
    }}>

      {/* Left — title */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {backHref && (
          <Link href={backHref} style={{
            fontSize: 11, color: 'var(--text3)', textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 2,
            fontWeight: 500, fontFamily: 'Work Sans, sans-serif',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}
          >
            ← {backLabel}
          </Link>
        )}
        <h1 style={{
          fontSize: 15, fontWeight: 700, color: 'var(--text)',
          letterSpacing: '-0.025em', lineHeight: 1.2,
          fontFamily: 'Manrope, sans-serif',
        }}>{title}</h1>
        {subtitle && (
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1, fontFamily: 'Work Sans, sans-serif' }}>
            {subtitle}
          </div>
        )}
      </div>

      {/* Right — actions + notification + settings + user */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {actions}

        {/* Notification bell */}
        <div ref={notifRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setNotifOpen(o => !o)}
            className={`icon-btn${notifOpen ? ' active' : ''}`}
            title="Notifications"
          >
            <BellIcon size={16} color={notifOpen ? 'var(--accent)' : 'var(--text2)'} />
          </button>

          {/* Notification dropdown */}
          {notifOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0,
              width: 300, background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: 12,
              boxShadow: 'var(--shadow-md)', zIndex: 200, overflow: 'hidden',
            }}>
              {/* Header */}
              <div style={{
                padding: '14px 16px 12px',
                borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'Manrope, sans-serif' }}>
                  Notifications
                </span>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>Today</span>
              </div>

              {/* Empty state */}
              <div style={{ padding: '28px 16px', textAlign: 'center' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'var(--surface2)', margin: '0 auto 10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <BellIcon size={20} color="var(--text3)" />
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4, fontFamily: 'Manrope, sans-serif' }}>
                  All caught up
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                  No new notifications at this time
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Settings gear */}
        <Link href="/settings">
          <button className="icon-btn" title="Settings">
            <GearIcon size={16} color="var(--text2)" />
          </button>
        </Link>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 2px' }} />

        {/* User chip */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 12px 4px 5px',
          borderRadius: 99,
          border: '1px solid var(--border)',
          background: 'var(--surface2)',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366F1 0%, #818CF8 100%)',
            color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 11, flexShrink: 0,
            fontFamily: 'Manrope, sans-serif',
          }}>
            {initials}
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', fontFamily: 'Work Sans, sans-serif' }}>
            {user?.name || 'User'}
          </span>
        </div>
      </div>
    </header>
  );
}

/* ── Icons ────────────────────────────────────────────────────────────────── */
function BellIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5A4.5 4.5 0 0 0 3.5 6c0 3-1.5 4-1.5 4h12s-1.5-1-1.5-4A4.5 4.5 0 0 0 8 1.5z"
        stroke={color} strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M9.5 13a1.5 1.5 0 0 1-3 0" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function GearIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2.5" stroke={color} strokeWidth="1.4"/>
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"
        stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}
