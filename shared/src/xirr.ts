import type { IsoDate } from './types';

export interface CashFlow {
  date: IsoDate;
  /** Yatırılan para negatif, geri alınan/değer pozitif */
  amount: number;
}

const DAY_MS = 86_400_000;

/**
 * Para ağırlıklı yıllık getiri (XIRR): Σ aᵢ / (1+r)^(tᵢ/365) = 0 denklemini çözer.
 * İkiye bölme yöntemi kullanılır; işaret değişimi yoksa null döner.
 */
export function xirr(flows: readonly CashFlow[]): number | null {
  if (flows.length < 2) return null;
  if (!flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) return null;

  const t0 = Date.parse(flows[0]!.date);
  const items = flows.map((f) => ({ t: (Date.parse(f.date) - t0) / DAY_MS / 365, a: f.amount }));
  const npv = (r: number) => items.reduce((sum, { t, a }) => sum + a / Math.pow(1 + r, t), 0);

  let lo = -0.9999;
  let hi = 1;
  // Üst sınırı kök aralığa girene kadar genişlet
  while (npv(lo) * npv(hi) > 0 && hi < 1e6) hi *= 4;
  if (npv(lo) * npv(hi) > 0) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const v = npv(mid);
    if (Math.abs(v) < 1e-9 || hi - lo < 1e-12) return mid;
    if (npv(lo) * v < 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
}
