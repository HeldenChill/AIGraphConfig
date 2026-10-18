const short = x => String(Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 10) / 10);

// 950, 1.5k, 412k, 4.6M
export function compact(n) {
  if (n === null || n === undefined) return '–';
  const a = Math.abs(n);
  if (a < 1000) return String(n);
  if (a < 1e6) return short(n / 1e3) + 'k';
  if (a < 1e9) return short(n / 1e6) + 'M';
  return short(n / 1e9) + 'B';
}

export function exact(n) {
  return n === null || n === undefined ? '–' : n.toLocaleString('en-US');
}

export function money(usd) {
  if (usd === null || usd === undefined) return 'no price';
  if (usd > 0 && usd < 0.01) return '<$0.01';
  return '$' + usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
