'use client';
export default function Pagination({ page, total, limit, onChange }) {
  const tp = Math.ceil(total / limit);
  if (tp <= 1) return null;
  return (
    <div className="pagination">
      <button onClick={() => onChange(page - 1)} disabled={page <= 1}>‹</button>
      {Array.from({ length: Math.min(tp, 7) }, (_, i) => i + 1).map(p => (
        <button key={p} onClick={() => onChange(p)} className={p === page ? 'active' : ''}>{p}</button>
      ))}
      <button onClick={() => onChange(page + 1)} disabled={page >= tp}>›</button>
      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 6 }}>{total} total</span>
    </div>
  );
}
