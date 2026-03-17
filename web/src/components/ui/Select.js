'use client';
/**
 * Select — MUI-inspired custom dropdown wrapper.
 *
 * Usage (drop-in replacement for <select className="form-select">):
 *   <Select value={val} onChange={e => setVal(e.target.value)} placeholder="All categories">
 *     <option value="a">Option A</option>
 *     <option value="b">Option B</option>
 *   </Select>
 *
 * Or with a label:
 *   <Select label="Period" value={val} onChange={...}>…</Select>
 */

export default function Select({
  children,
  value,
  onChange,
  placeholder,
  label,
  style,
  className = '',
  disabled = false,
  size = 'md',   // 'sm' | 'md'
  ...props
}) {
  const pad  = size === 'sm' ? '6px 36px 6px 12px' : '10px 40px 10px 14px';
  const fSize = size === 'sm' ? 12 : 13;
  const h    = size === 'sm' ? 32 : 40;

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 5, ...style }}>
      {label && (
        <span style={{
          fontSize: 11, fontWeight: 600, color: 'var(--text2)',
          fontFamily: 'Work Sans, sans-serif', letterSpacing: '0.01em',
        }}>
          {label}
        </span>
      )}

      <div style={{
        position: 'relative',
        display: 'inline-flex', alignItems: 'center',
        height: h,
      }}>
        {/* The actual native <select> — invisible fill */}
        <select
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={`iis-select ${className}`}
          style={{ padding: pad, fontSize: fSize, height: h, width: '100%' }}
          {...props}
        >
          {placeholder !== undefined && (
            <option value="">{placeholder}</option>
          )}
          {children}
        </select>

        {/* Custom chevron overlay — pointer-events:none so clicks pass to select */}
        <span style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          pointerEvents: 'none', display: 'flex', alignItems: 'center',
          color: 'var(--text3)',
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </div>
    </div>
  );
}
