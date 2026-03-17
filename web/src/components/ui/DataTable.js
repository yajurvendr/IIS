'use client';
import React from 'react';

/**
 * DataTable — self-contained MUI-style table card.
 *
 * Props:
 *   columns    — [{ key, label, width?, render?(value, row) }]
 *   data       — array of row objects
 *   loading    — boolean
 *   emptyText  — string shown when data is empty
 *   expandedRow— (row) => ReactNode | null  — renders an expanded sub-row
 *   title      — string or ReactNode — card header title
 *   subtitle   — string or ReactNode — optional subtitle below title
 *   toolbar    — ReactNode — right side of card header (buttons, search, etc.)
 *   footer     — ReactNode — e.g. <Pagination /> rendered at card bottom
 *   compact    — boolean — smaller cell padding
 *   className  — extra class on the root element
 *   style      — extra style on the root element
 */
export default function DataTable({
  columns,
  data,
  loading,
  emptyText = 'No data',
  expandedRow,
  title,
  subtitle,
  toolbar,
  footer,
  compact = false,
  className = '',
  style,
}) {
  const hasHeader = title || subtitle || toolbar;

  return (
    <div className={`iis-data-table ${className}`} style={style}>

      {/* ── Card header ─────────────────────────────────────────────────── */}
      {hasHeader && (
        <div className="idt-header">
          <div className="idt-header-left">
            {title    && <div className="idt-title">{title}</div>}
            {subtitle && <div className="idt-subtitle">{subtitle}</div>}
          </div>
          {toolbar && <div className="idt-toolbar">{toolbar}</div>}
        </div>
      )}

      {/* ── Table body ──────────────────────────────────────────────────── */}
      {loading ? (
        <div className="idt-loading">
          <div className="idt-spinner" />
          <span>Loading…</span>
        </div>
      ) : (
        <div className="idt-scroll">
          <table className={compact ? 'idt-compact' : ''}>
            <thead>
              <tr>
                {columns.map(col => (
                  <th key={col.key}
                    style={col.width ? { width: col.width, minWidth: col.width } : {}}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!data?.length ? (
                <tr>
                  <td colSpan={columns.length} className="idt-empty">
                    {emptyText}
                  </td>
                </tr>
              ) : data.map((row, i) => {
                const expandContent = expandedRow ? expandedRow(row) : null;
                const rowKey = row.id || i;
                return (
                  <React.Fragment key={rowKey}>
                    <tr>
                      {columns.map(col => (
                        <td key={col.key}>
                          {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                        </td>
                      ))}
                    </tr>
                    {expandContent && (
                      <tr className="idt-expand-row">
                        <td colSpan={columns.length}>
                          {expandContent}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Card footer (Pagination etc.) ────────────────────────────────── */}
      {footer && <div className="idt-footer">{footer}</div>}

    </div>
  );
}
