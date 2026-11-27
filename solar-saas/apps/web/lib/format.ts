const nf = (digits: number) =>
  new Intl.NumberFormat('th-TH', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export const fmt = (n: number, digits = 0): string =>
  Number.isFinite(n) ? nf(digits).format(n) : '–';

export const baht = (n: number, digits = 0): string => `฿${fmt(n, digits)}`;

export const pct = (ratio: number, digits = 1): string =>
  Number.isFinite(ratio) ? `${(ratio * 100).toFixed(digits)}%` : '–';
