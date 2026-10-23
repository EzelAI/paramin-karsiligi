import type { AssetId } from './assets';
import { endOfMonth, monthOf, monthRange } from './dates';
import type { IsoDate, Payment } from './types';
import { daysBetween, xirr, type CashFlow } from './xirr';

/** Verilen tarihteki (ya da öncesindeki en yakın) birim TL fiyatı döndürür */
export type PriceLookup = (assetId: AssetId, date: IsoDate) => number | undefined;

/** Bundan kısa sürelerde yıllık getiri (XIRR) hesaplanmaz; kısa dönemi yıllığa çevirmek yanıltıcıdır */
export const MIN_XIRR_DAYS = 365;

export interface Conversion {
  /** Ödeme tarihindeki birim fiyat (TL) */
  price: number;
  /** Alım maliyeti düşüldükten sonra alınan birim (gr, $, adet) */
  units: number;
}

export interface AnalyzedPayment extends Payment {
  conversions: Partial<Record<AssetId, Conversion>>;
}

export interface RealResult {
  /** Fiyatı bulunan ödemelerin bugünkü TL karşılığı (enflasyona göre) */
  paidToday: number;
  /** currentValue - paidToday */
  gain: number;
  gainPct: number;
  /** Enflasyondan arındırılmış yıllık getiri */
  xirr: number | null;
}

export interface AssetResult {
  assetId: AssetId;
  /** Biriken toplam birim */
  totalUnits: number;
  /** Fiyatı bulunan ödemelerin TL toplamı */
  coveredPaid: number;
  coveredCount: number;
  /** Ortalama birim maliyet (TL, alım maliyeti dahil) */
  averageCost: number | null;
  currentPrice: number | null;
  /** Biriken birimlerin bugünkü TL değeri */
  currentValue: number | null;
  /** currentValue - coveredPaid */
  gain: number | null;
  /** Basit toplam getiri (%) — ödeme zamanlarını hesaba katmaz */
  gainPct: number | null;
  /** Para ağırlıklı yıllık getiri (oran; 0.25 = %25). Süre MIN_XIRR_DAYS'ten kısaysa null */
  xirr: number | null;
  /** Enflasyona göre reel sonuçlar; deflatör verisi yoksa null */
  real: RealResult | null;
  /** Fiyatı bulunamayan (hesaba katılmayan) ödeme sayısı */
  missingCount: number;
}

export interface TimelinePoint {
  month: string;
  /** Ay sonuna kadar ödenen kümülatif TL */
  paid: number;
  units: Partial<Record<AssetId, number>>;
  /** Biriken birimlerin o ay sonundaki TL değeri */
  values: Partial<Record<AssetId, number>>;
}

export interface InvestmentAnalysis {
  asOf: IsoDate;
  /** Bugüne kadar yapılmış ödemelerin toplamı */
  totalPaid: number;
  paymentCount: number;
  firstDate: IsoDate | null;
  lastDate: IsoDate | null;
  payments: AnalyzedPayment[];
  /** Değerleme tarihinden sonraki (henüz yapılmamış) ödemeler; hesaba katılmaz */
  planned: Payment[];
  plannedTotal: number;
  assets: Partial<Record<AssetId, AssetResult>>;
  timeline: TimelinePoint[];
  /** Reel hesaplarda kullanılan endeks */
  deflator: AssetId | null;
  /** Varlık verisindeki şüpheli noktalar (sunucu ekler) */
  warnings?: Partial<Record<AssetId, string[]>>;
}

export interface AnalyzeOptions {
  assets: readonly AssetId[];
  lookup: PriceLookup;
  asOf: IsoDate;
  /** Varlığın alım maliyeti oranı (0.01 = %1); verilmezse 0 */
  costRate?: (assetId: AssetId) => number;
  /** Reel getiri için fiyat endeksi (ör. TÜFE) */
  deflator?: AssetId;
}

export function analyzePayments(payments: readonly Payment[], opts: AnalyzeOptions): InvestmentAnalysis {
  const { assets, lookup, asOf, deflator } = opts;
  const costRate = opts.costRate ?? (() => 0);
  const sorted = [...payments].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const past = sorted.filter((p) => p.date <= asOf);
  const planned = sorted.filter((p) => p.date > asOf);

  const analyzed: AnalyzedPayment[] = past.map((p) => {
    const conversions: Partial<Record<AssetId, Conversion>> = {};
    for (const assetId of assets) {
      const price = lookup(assetId, p.date);
      if (price !== undefined && price > 0) {
        conversions[assetId] = { price, units: (p.amount * (1 - costRate(assetId))) / price };
      }
    }
    return { ...p, conversions };
  });

  const deflatorNow = deflator ? lookup(deflator, asOf) : undefined;

  const assetResults: Partial<Record<AssetId, AssetResult>> = {};
  for (const assetId of assets) {
    const covered = analyzed.filter((p) => p.conversions[assetId]);
    const totalUnits = sum(covered.map((p) => p.conversions[assetId]!.units));
    const coveredPaid = sum(covered.map((p) => p.amount));
    const currentPrice = lookup(assetId, asOf) ?? null;
    const currentValue = currentPrice !== null ? totalUnits * currentPrice : null;
    const gain = currentValue !== null ? currentValue - coveredPaid : null;

    let annual: number | null = null;
    let real: RealResult | null = null;
    if (currentValue !== null && covered.length > 0) {
      const longEnough = daysBetween(covered[0]!.date, asOf) >= MIN_XIRR_DAYS;
      if (longEnough) annual = xirr(flows(covered, currentValue, asOf, () => 1));

      if (deflatorNow !== undefined) {
        const indexAt = new Map(covered.map((p) => [p.id, lookup(deflator!, p.date)]));
        if ([...indexAt.values()].every((v) => v !== undefined && v > 0)) {
          // Her ödemeyi bugünün parasına çevir
          const scale = (p: Payment) => deflatorNow / indexAt.get(p.id)!;
          const paidToday = sum(covered.map((p) => p.amount * scale(p)));
          real = {
            paidToday,
            gain: currentValue - paidToday,
            gainPct: ((currentValue - paidToday) / paidToday) * 100,
            xirr: longEnough ? xirr(flows(covered, currentValue, asOf, scale)) : null,
          };
        }
      }
    }

    assetResults[assetId] = {
      assetId,
      totalUnits,
      coveredPaid,
      coveredCount: covered.length,
      averageCost: totalUnits > 0 ? coveredPaid / totalUnits : null,
      currentPrice,
      currentValue,
      gain,
      gainPct: gain !== null && coveredPaid > 0 ? (gain / coveredPaid) * 100 : null,
      xirr: annual,
      real,
      missingCount: analyzed.length - covered.length,
    };
  }

  return {
    asOf,
    totalPaid: sum(past.map((p) => p.amount)),
    paymentCount: past.length,
    firstDate: past[0]?.date ?? null,
    lastDate: past.at(-1)?.date ?? null,
    payments: analyzed,
    planned,
    plannedTotal: sum(planned.map((p) => p.amount)),
    assets: assetResults,
    timeline: buildTimeline(analyzed, assets, lookup, asOf),
    deflator: deflator ?? null,
  };
}

/** Ödemeler eksi, bugünkü değer artı nakit akışı; scale ile bugünün parasına çevrilebilir */
function flows(payments: Payment[], value: number, asOf: IsoDate, scale: (p: Payment) => number): CashFlow[] {
  return [...payments.map((p) => ({ date: p.date, amount: -p.amount * scale(p) })), { date: asOf, amount: value }];
}

function buildTimeline(
  payments: readonly AnalyzedPayment[],
  assets: readonly AssetId[],
  lookup: PriceLookup,
  asOf: IsoDate,
): TimelinePoint[] {
  const first = payments[0];
  if (!first) return [];

  const points: TimelinePoint[] = [];
  let i = 0;
  let paid = 0;
  const units: Partial<Record<AssetId, number>> = {};

  for (const month of monthRange(monthOf(first.date), monthOf(asOf))) {
    while (i < payments.length && monthOf(payments[i]!.date) <= month) {
      const p = payments[i]!;
      paid += p.amount;
      for (const assetId of assets) {
        const c = p.conversions[assetId];
        if (c) units[assetId] = (units[assetId] ?? 0) + c.units;
      }
      i++;
    }
    const valuationDate = month === monthOf(asOf) ? asOf : endOfMonth(month);
    const values: Partial<Record<AssetId, number>> = {};
    for (const assetId of assets) {
      const price = lookup(assetId, valuationDate);
      const u = units[assetId];
      if (price !== undefined && u !== undefined) values[assetId] = u * price;
    }
    points.push({ month, paid, units: { ...units }, values });
  }
  return points;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
