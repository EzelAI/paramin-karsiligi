import { ASSETS, type AssetId } from '@paramin-karsiligi/shared';

const tl = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 });

export const formatTL = (v: number | null | undefined) => (v == null ? '—' : tl.format(v));
export const formatTLShort = (v: number) => `${compact.format(v)} ₺`;

export function formatNumber(v: number | null | undefined, digits = 2) {
  if (v == null) return '—';
  return v.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatUnits(assetId: AssetId, v: number | null | undefined) {
  const a = ASSETS[assetId];
  if (v == null) return '—';
  // Para birimi sembolleri başta, diğer birimler (gr, adet) sonda
  return a.unit.length === 1 ? `${a.unit}${formatNumber(v, a.decimals)}` : `${formatNumber(v, a.decimals)} ${a.unit}`;
}

export function formatPct(v: number | null | undefined) {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${formatNumber(v, 1)}%`;
}

/** Oran (0.25) → "+25,0%" */
export function formatRate(v: number | null | undefined) {
  return v == null ? '—' : formatPct(v * 100);
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export function formatMonth(ym: string) {
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

/**
 * Türkçe yazılmış tutarı sayıya çevirir: "50.000" → 50000, "1.250,50" → 1250.5, "2 milyon" desteklenmez.
 * Virgül varsa ondalık ayracıdır; yoksa noktalar binlik ayracı sayılır.
 */
export function parseAmount(input: string): number {
  const cleaned = input.replace(/[^\d,.]/g, '');
  if (!cleaned) return NaN;
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/\./g, '');
  return Number(normalized);
}
