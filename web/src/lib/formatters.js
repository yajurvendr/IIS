/**
 * Format a number as Indian Rupees (INR)
 */
export function formatINR(value, compact = false) {
  const num = parseFloat(value) || 0;
  if (compact) {
    if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)}Cr`;
    if (num >= 100000)   return `₹${(num / 100000).toFixed(2)}L`;
    if (num >= 1000)     return `₹${(num / 1000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(num);
}

export function formatNumber(value) {
  return new Intl.NumberFormat('en-IN').format(parseFloat(value) || 0);
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export function woiStatusLabel(status) {
  if (status === 'red')   return 'Critical';
  if (status === 'amber') return 'Low';
  return 'Healthy';
}

export function woiBadgeClass(status) {
  if (status === 'red')   return 'badge badge-red';
  if (status === 'amber') return 'badge badge-amber';
  return 'badge badge-green';
}
