'use client';

export default function Pagination({ page, total, limit, onChange }) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return null;

  const pages = [];
  for (let i = 1; i <= Math.min(totalPages, 7); i++) pages.push(i);

  return (
    <div className="pagination">
      <button onClick={() => onChange(page - 1)} disabled={page <= 1}>‹</button>
      {pages.map(p => (
        <button key={p} onClick={() => onChange(p)} className={p === page ? 'active' : ''}>{p}</button>
      ))}
      {totalPages > 7 && <span style={{ padding: '0 4px' }}>…{totalPages}</span>}
      <button onClick={() => onChange(page + 1)} disabled={page >= totalPages}>›</button>
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 8 }}>
        {total} total
      </span>
    </div>
  );
}
