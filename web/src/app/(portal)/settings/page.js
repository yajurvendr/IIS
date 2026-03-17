'use client';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';

const SECTIONS = [
  {
    title: 'General',
    description: 'Core business settings and inventory targets.',
    items: [
      {
        href: '/settings/general',
        label: 'General Settings',
        description: 'Update business name, contact email, and phone number.',
        icon: GearIcon,
        color: '#3B82F6',
        bg: '#EFF6FF',
      },
      {
        href: '/settings/inventory-targets',
        label: 'Inventory Targets',
        description: 'Configure WOI thresholds, target stock cover, and lead time.',
        icon: TargetIcon,
        color: '#EF4444',
        bg: '#FEF2F2',
      },
    ],
  },
  {
    title: 'Catalog',
    description: 'Manage your product master and seasonal strategy.',
    items: [
      {
        href: '/skus',
        label: 'SKU Master',
        description: 'View and manage all products, focus flags, and cost data.',
        icon: TagIcon,
        color: '#3B82F6',
        bg: '#EFF6FF',
      },
      {
        href: '/seasonal/calendar',
        label: 'Seasonal Planning',
        description: 'Configure season tags, peak windows, and pre-season alerts.',
        icon: SeasonIcon,
        color: '#F59E0B',
        bg: '#FFFBEB',
      },
    ],
  },
  {
    title: 'Operations',
    description: 'Configure branches, vendors, and import behaviour.',
    items: [
      {
        href: '/settings/branches',
        label: 'Branch Management',
        description: 'Add or manage inventory locations and home branches.',
        icon: BranchIcon,
        color: '#8B5CF6',
        bg: '#F5F3FF',
      },
      {
        href: '/settings/vendors',
        label: 'Vendor Management',
        description: 'Maintain supplier contacts and vendor codes.',
        icon: VendorIcon,
        color: '#10B981',
        bg: '#ECFDF5',
      },
      {
        href: '/settings/column-mappings',
        label: 'Column Mappings',
        description: 'Override default import headers for your file format.',
        icon: MappingIcon,
        color: '#6366F1',
        bg: '#EEF2FF',
      },
      {
        href: '/settings/cost-decoder',
        label: 'Cost Decoder',
        description: 'Set up the formula to decode encoded purchase costs.',
        icon: KeyIcon,
        color: '#64748B',
        bg: '#F1F5F9',
      },
      {
        href: '/settings/outstanding-method',
        label: 'Outstanding Method',
        description: 'Choose between direct ledger upload or computed from invoices & receipts.',
        icon: LedgerIcon,
        color: '#D97706',
        bg: '#FEF3C7',
      },
    ],
  },
  {
    title: 'Communications',
    description: 'Manage outgoing messages to customers.',
    items: [
      {
        href: '/settings/whatsapp-templates',
        label: 'WhatsApp Templates',
        description: 'Create and manage WhatsApp message templates for your customers.',
        icon: WhatsAppIcon,
        color: '#25D366',
        bg: '#F0FFF4',
      },
    ],
  },
  {
    title: 'Integrations',
    description: 'Connect IIS with external accounting and ERP systems.',
    items: [
      {
        href: '/settings/busy-sync',
        label: 'Busy Sync',
        description: 'Sync items, customers, and transactions from BUSY accounting software.',
        icon: SyncIcon,
        color: '#7C3AED',
        bg: '#F5F3FF',
      },
    ],
  },
];

export default function SettingsPage() {
  return (
    <>
      <Topbar title="Settings" />

      {/* ── Section grids ─────────────────────────────────────────────────── */}
      {SECTIONS.map(section => (
        <div key={section.title} style={{ marginBottom: 28 }}>
          <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>
              {section.title}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
              {section.description}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
            {section.items.map(item => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                  <div
                    style={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 12,
                      padding: '16px',
                      cursor: 'pointer',
                      transition: 'box-shadow 0.15s, border-color 0.15s, transform 0.12s',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.boxShadow = `0 4px 20px rgba(0,0,0,0.07)`;
                      e.currentTarget.style.borderColor = item.color;
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div style={{
                      width: 38, height: 38, borderRadius: 10,
                      background: item.bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Icon size={18} color={item.color} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 3 }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.55 }}>
                        {item.description}
                      </div>
                    </div>
                    <div style={{ marginTop: 'auto', fontSize: 12, color: item.color, fontWeight: 600 }}>
                      Open →
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

/* ── Icons ────────────────────────────────────────────────────────────────── */
function GearIcon({ size = 18, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="2.5" stroke={color} strokeWidth="1.4"/>
    <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
  </svg>;
}
function TargetIcon({ size = 18, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.4"/>
    <circle cx="8" cy="8" r="3.5" stroke={color} strokeWidth="1.4"/>
    <circle cx="8" cy="8" r="1" fill={color}/>
  </svg>;
}
function LedgerIcon({ size = 18, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <rect x="2" y="1" width="12" height="14" rx="1.5" stroke={color} strokeWidth="1.3"/>
    <path d="M5 5h6M5 8h6M5 11h4" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
  </svg>;
}
function TagIcon({ size = 18, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M2 2h5.5l6.5 6.5-5.5 5.5L2 7.5V2z" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
    <circle cx="5" cy="5" r="1" fill={color}/>
  </svg>;
}
function SeasonIcon({ size = 18, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="3" stroke={color} strokeWidth="1.5"/>
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
  </svg>;
}
function BranchIcon({ size = 18, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <rect x="1" y="1" width="5" height="4" rx="1" stroke={color} strokeWidth="1.3"/>
    <rect x="10" y="1" width="5" height="4" rx="1" stroke={color} strokeWidth="1.3"/>
    <rect x="5.5" y="11" width="5" height="4" rx="1" stroke={color} strokeWidth="1.3"/>
    <path d="M3.5 5v2.5H8v3M12.5 5v2.5H8" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
function VendorIcon({ size = 18, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M1 4h14l-1.5 7H2.5L1 4z" stroke={color} strokeWidth="1.4" strokeLinejoin="round"/>
    <path d="M4 4L5 1h6l1 3" stroke={color} strokeWidth="1.4" strokeLinejoin="round"/>
    <circle cx="5.5" cy="13.5" r="1.2" fill={color}/>
    <circle cx="10.5" cy="13.5" r="1.2" fill={color}/>
  </svg>;
}
function MappingIcon({ size = 18, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <rect x="1" y="1" width="14" height="14" rx="2" stroke={color} strokeWidth="1.3"/>
    <path d="M4 5h3M4 8h8M4 11h6" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M9 5h3" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
  </svg>;
}
function KeyIcon({ size = 18, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <circle cx="5.5" cy="8" r="3.5" stroke={color} strokeWidth="1.4"/>
    <path d="M8.5 8h6M12 7v2M14 7v2" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
  </svg>;
}
function WhatsAppIcon({ size = 18, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.4"/>
    <path d="M5.5 6.5C5.5 8.5 7.5 11 10 11l.5-1.5-1.5-.5-.5 1c-1.2-.5-2-1.5-2.5-2.5l1-.5-.5-1.5L5.5 6.5z" fill={color}/>
  </svg>;
}
function SyncIcon({ size = 18, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M2.5 8A5.5 5.5 0 0 1 13 5.5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M13.5 8A5.5 5.5 0 0 1 3 10.5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M11 3.5l2 2 2-2" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M5 12.5l-2-2-2 2" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
