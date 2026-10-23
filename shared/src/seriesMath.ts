import type { IsoDate, PricePoint } from './types';

/** Tarihe göre artan sıralı seri */
export interface Series {
  dates: string[];
  values: number[];
}

export const toSeries = (points: PricePoint[]): Series => ({
  dates: points.map((p) => p.date),
  values: points.map((p) => p.close),
});

/**
 * Bileşen serilerini tarih birleşiminde ileri doldurarak çarpar; tüm bileşenlerin değeri
 * oluştuktan sonraki günler için nokta üretir. perDate ile tarihe bağlı katsayı uygulanabilir.
 */
export function productSeries(components: Series[], factor: number, perDate?: (date: string) => number): Series {
  const allDates = [...new Set(components.flatMap((c) => c.dates))].sort();
  const cursors = components.map(() => 0);
  const current: (number | undefined)[] = components.map(() => undefined);
  const dates: string[] = [];
  const values: number[] = [];

  for (const date of allDates) {
    components.forEach((comp, k) => {
      while (cursors[k]! < comp.dates.length && comp.dates[cursors[k]!]! <= date) current[k] = comp.values[cursors[k]!++];
    });
    if (current.every((v) => v !== undefined)) {
      dates.push(date);
      values.push((current as number[]).reduce((a, b) => a * b, factor) * (perDate ? perDate(date) : 1));
    }
  }
  return { dates, values };
}

/**
 * Yıllık faiz değişikliklerinden (%, basit) günlük bileşik endeks üretir: start günü 1,
 * sonraki her gün o gün geçerli faizle (1 + r/365) büyür. adjust ile faiz dönüştürülebilir
 * (ör. mevduat farkı ve stopaj).
 */
export function compoundIndex(
  rates: Series,
  start: IsoDate,
  end: IsoDate,
  adjust: (ratePct: number) => number = (r) => r,
): Series {
  const dates: string[] = [];
  const values: number[] = [];
  let r = 0;
  let rateIdx = 0;
  let value = 1;
  const d = new Date(start + 'T00:00:00Z');
  const last = new Date(end + 'T00:00:00Z');

  while (d <= last) {
    const iso = d.toISOString().slice(0, 10);
    while (rateIdx < rates.dates.length && rates.dates[rateIdx]! <= iso) r = adjust(rates.values[rateIdx++]!);
    if (dates.length > 0) value *= 1 + r / 100 / 365;
    // Faiz verisi başlamadan önceki günleri atla
    if (rateIdx > 0) {
      dates.push(iso);
      values.push(value);
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return { dates, values };
}

/**
 * Temettülerin net tutarının hak kullanım günü, bir önceki kapanıştan yeniden yatırıldığı
 * toplam getiri serisi: TR(t) = kapanış(t) × Π (1 + temettü × (1 - stopaj) / önceki kapanış)
 */
export function totalReturnSeries(prices: Series, dividends: Series, withholdingPct: number): Series {
  const values: number[] = [];
  let factor = 1;
  let d = 0;
  for (let i = 0; i < prices.dates.length; i++) {
    const date = prices.dates[i]!;
    while (d < dividends.dates.length && dividends.dates[d]! <= date) {
      const prev = i > 0 ? prices.values[i - 1]! : prices.values[i]!;
      // Seri başlamadan önceki temettüler yok sayılır
      if (i > 0) factor *= 1 + (dividends.values[d]! * (1 - withholdingPct / 100)) / prev;
      d++;
    }
    values.push(prices.values[i]! * factor);
  }
  return { dates: [...prices.dates], values };
}

/**
 * Aylık % değişimlerden günlük fiyat endeksi üretir. Ay M'nin değişimi M'nin sonunda
 * tamamlanmış sayılır; ay içindeki günler geometrik olarak ara değerlenir. Son yayımlanan
 * aydan sonrası sabit kalır (henüz açıklanmamış enflasyon yok sayılır).
 */
export function cpiIndex(monthlyChanges: Series, end: IsoDate): Series {
  const dates: string[] = [];
  const values: number[] = [];
  let level = 100;
  for (let i = 0; i < monthlyChanges.dates.length; i++) {
    const monthStart = new Date(monthlyChanges.dates[i]! + 'T00:00:00Z');
    const daysInMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
    const growth = 1 + monthlyChanges.values[i]! / 100;
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(monthStart);
      d.setUTCDate(day);
      dates.push(d.toISOString().slice(0, 10));
      values.push(level * Math.pow(growth, day / daysInMonth));
    }
    level *= growth;
  }
  // Son veriden bugüne düz devam
  const lastDate = dates.at(-1);
  if (lastDate && lastDate < end) {
    dates.push(end);
    values.push(level);
  }
  return { dates, values };
}

/** Günlük değişimi eşiği aşan günler (ör. düzeltilmemiş bedelsiz sermaye artırımı şüphesi) */
export function detectJumps(series: Series, thresholdPct: number): { date: string; changePct: number }[] {
  const out: { date: string; changePct: number }[] = [];
  for (let i = 1; i < series.values.length; i++) {
    const change = (series.values[i]! / series.values[i - 1]! - 1) * 100;
    if (Math.abs(change) > thresholdPct) out.push({ date: series.dates[i]!, changePct: change });
  }
  return out;
}

export function lastIndexAtOrBefore(sorted: string[], target: string): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! <= target) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
