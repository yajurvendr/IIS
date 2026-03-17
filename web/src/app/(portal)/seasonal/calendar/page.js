'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import api from '@/lib/api';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Known season → active months (0-indexed). Used as fallback for un-mapped custom tags.
const KNOWN_SEASON_MONTHS = {
  summer:     [2, 3, 4, 5],
  monsoon:    [5, 6, 7, 8],
  winter:     [9, 10, 11, 0],
  festival:   [7, 8, 9, 10],
  'year-round': [0,1,2,3,4,5,6,7,8,9,10,11],
};

function getSeasonMonths(tag) {
  return KNOWN_SEASON_MONTHS[tag.toLowerCase()] || [];
}

// Pastel color palette — cycles for custom tags
const PALETTE = [
  { bg: 'rgba(99,102,241,0.15)', dot: '#6366F1' },
  { bg: 'rgba(236,72,153,0.15)', dot: '#EC4899' },
  { bg: 'rgba(245,158,11,0.15)', dot: '#F59E0B' },
  { bg: 'rgba(16,185,129,0.15)', dot: '#10B981' },
  { bg: 'rgba(239,68,68,0.15)',  dot: '#EF4444' },
  { bg: 'rgba(14,165,233,0.15)', dot: '#0EA5E9' },
  { bg: 'rgba(168,85,247,0.15)', dot: '#A855F7' },
];

export default function SeasonCalendarPage() {
  const [skusByTag, setSkusByTag] = useState({});   // { tagName: [sku, ...] }
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);   // { tag, monthIdx } | null

  useEffect(() => {
    api.get('/skus', { params: { limit: 2000 } }).then(r => {
      const byTag = {};
      for (const sku of r.data.data || []) {
        let tags = sku.season_tags;
        try { tags = typeof tags === 'string' ? JSON.parse(tags || '[]') : (tags || []); } catch { tags = []; }
        for (const t of tags) {
          if (!byTag[t]) byTag[t] = [];
          byTag[t].push(sku);
        }
      }
      setSkusByTag(byTag);
    }).finally(() => setLoading(false));
  }, []);

  const now = new Date().getMonth();
  const tags = Object.keys(skusByTag).sort();
  const tagColor = Object.fromEntries(tags.map((t, i) => [t, PALETTE[i % PALETTE.length]]));

  function handleCell(tag, monthIdx) {
    const months = getSeasonMonths(tag);
    if (!months.includes(monthIdx)) return; // not an active month for this tag
    setSelected(prev =>
      prev?.tag === tag && prev?.monthIdx === monthIdx ? null : { tag, monthIdx }
    );
  }

  // SKUs to show in the expanded panel
  const expandedSkus = selected ? skusByTag[selected.tag] || [] : [];

  return (
    <>
      <Topbar title="Season Calendar" backHref="/settings" />

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading…</div>
      ) : !tags.length ? (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--color-text-muted)' }}>
          No SKUs tagged with seasons yet.{' '}
          <Link href="/skus/bulk-tag" style={{ color: 'var(--color-primary-light)' }}>Bulk Tag SKUs →</Link>
        </div>
      ) : (
        <>
          {/* ── Calendar grid ──────────────────────────────────────────────── */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ minWidth: 700, borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: 130, textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid var(--color-border)' }}>Season</th>
                    {MONTHS.map((m, i) => (
                      <th key={m} style={{
                        textAlign: 'center', padding: '10px 6px', fontSize: 12,
                        fontWeight: i === now ? 800 : 500,
                        color: i === now ? '#fff' : 'var(--color-text)',
                        background: i === now ? 'var(--color-primary)' : undefined,
                        borderBottom: '1px solid var(--color-border)',
                        borderRadius: i === now ? '4px 4px 0 0' : undefined,
                      }}>{m}</th>
                    ))}
                    <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: 12, borderBottom: '1px solid var(--color-border)' }}>SKUs</th>
                  </tr>
                </thead>
                <tbody>
                  {tags.map(tag => {
                    const months = getSeasonMonths(tag);
                    const color = tagColor[tag];
                    return (
                      <tr key={tag}>
                        <td style={{ padding: '10px 12px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--color-border)' }}>
                          <span style={{
                            display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                            background: color.dot, marginRight: 7,
                          }} />
                          {tag}
                        </td>
                        {MONTHS.map((_, i) => {
                          const active = months.includes(i);
                          const isSelected = selected?.tag === tag && selected?.monthIdx === i;
                          return (
                            <td key={i} style={{ textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid var(--color-border)' }}>
                              {active ? (
                                <button
                                  onClick={() => handleCell(tag, i)}
                                  title={`${tag} — ${MONTHS[i]}: ${skusByTag[tag]?.length || 0} SKUs`}
                                  style={{
                                    width: 28, height: 28, borderRadius: '50%', border: 'none',
                                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    background: isSelected ? color.dot : color.bg,
                                    outline: isSelected ? `2px solid ${color.dot}` : 'none',
                                    outlineOffset: 2,
                                    transition: 'all 0.15s',
                                  }}
                                >
                                  {i === now && (
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: isSelected ? '#fff' : color.dot, display: 'block' }} />
                                  )}
                                </button>
                              ) : null}
                            </td>
                          );
                        })}
                        <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, color: color.dot, borderBottom: '1px solid var(--color-border)' }}>
                          {skusByTag[tag]?.length || 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Click a colored dot to see SKUs for that season</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                Highlighted column = current month
              </span>
            </div>
          </div>

          {/* ── Expanded SKU Panel ─────────────────────────────────────────── */}
          {selected && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                    <span style={{ color: tagColor[selected.tag].dot }}>{selected.tag}</span>
                    {' '}— {MONTHS[selected.monthIdx]} ({expandedSkus.length} SKUs)
                  </h3>
                </div>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-muted)' }}>×</button>
              </div>

              {expandedSkus.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No SKUs for this tag.</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {expandedSkus.map(s => (
                    <Link key={s.id} href={`/skus/${s.id}`} style={{
                      display: 'inline-block', padding: '4px 10px', borderRadius: 6,
                      background: tagColor[selected.tag].bg,
                      color: tagColor[selected.tag].dot,
                      fontWeight: 600, fontSize: 12, textDecoration: 'none',
                      border: `1px solid ${tagColor[selected.tag].dot}30`,
                    }}>
                      {s.sku_code}
                      {s.sku_name && (
                        <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: 4, fontSize: 11 }}>
                          {s.sku_name.length > 30 ? s.sku_name.slice(0, 30) + '…' : s.sku_name}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Season summary (always visible) ────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {tags.map(tag => {
              const months = getSeasonMonths(tag);
              const color = tagColor[tag];
              const count = skusByTag[tag]?.length || 0;
              const isCurrentlyActive = months.includes(now);
              return (
                <div key={tag} className="card" style={{ padding: 14, borderLeft: `3px solid ${color.dot}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{tag}</div>
                    {isCurrentlyActive && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: color.bg, color: color.dot }}>
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: color.dot, marginTop: 4 }}>{count}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                    {months.map(m => MONTHS[m]).join(', ') || 'Custom'}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
