import { describe, expect, it } from 'vitest';
import {
  FORECAST_STALE_DAYS,
  FORECASTS_COMPILED_AT,
  forecastAgeDays,
  GOLD_FORECAST_AVERAGE,
  GOLD_FORECASTS,
  goldBreakEvenOz,
  monthlyGrowth,
  monthName,
  USDTRY_FORECAST,
  usdTryReference,
} from './forecasts';
import { monthlyFromDailyCompounded, scheduleFromInstallments, simulateHolding } from './installment';

describe('tahmin varsayımları', () => {
  it('ortalama, listedeki tahminlerden hesaplanır', () => {
    const values = GOLD_FORECASTS.map((f) => f.value);
    expect(GOLD_FORECAST_AVERAGE).toBeGreaterThanOrEqual(Math.min(...values));
    expect(GOLD_FORECAST_AVERAGE).toBeLessThanOrEqual(Math.max(...values));
    expect(GOLD_FORECAST_AVERAGE).toBeCloseTo(values.reduce((a, b) => a + b) / values.length, 9);
  });

  it('tahminlerin yaşı', () => {
    const compiled = new Date(Date.parse(FORECASTS_COMPILED_AT));
    expect(forecastAgeDays(compiled)).toBe(0);
    const later = new Date(compiled.getTime() + (FORECAST_STALE_DAYS + 1) * 86_400_000);
    expect(forecastAgeDays(later)).toBeGreaterThan(FORECAST_STALE_DAYS);
  });

  it('dolar beklentisi: anket varsa güncel değer, yoksa elle yazılan son değer', () => {
    const live = usdTryReference({ usdTry12m: { value: 61.5, month: '2026-11' } });
    expect(live).toEqual({ value: 61.5, source: 'TCMB Piyasa Katılımcıları Anketi (Kasım 2026), 12 ay sonrası', live: true });
    expect(usdTryReference({ usdTry12m: null })).toEqual({ ...USDTRY_FORECAST, live: false });
    expect(usdTryReference(null).live).toBe(false);
    expect(monthName('2026-01')).toBe('Ocak 2026');
  });

  it('aylık büyüme 12 ayda hedefe ulaşır', () => {
    expect(100 * Math.pow(1 + monthlyGrowth(100, 150), 12)).toBeCloseTo(150, 9);
    expect(monthlyGrowth(100, 100)).toBe(0);
  });

  it('başa baş ons fiyatında altın ve mevduat aynı sonucu verir', () => {
    const dep = monthlyFromDailyCompounded(30.6);
    const kur = monthlyGrowth(49.69, 59.26);
    const be = goldBreakEvenOz(4000, dep, kur);
    const goldMonthly = (1 + monthlyGrowth(4000, be)) * (1 + kur) - 1;
    expect(goldMonthly).toBeCloseTo(dep, 12);
    // Kur artışı mevduattan düşükse onsun da artması gerekir
    expect(be).toBeGreaterThan(4000);
  });

  it('peşin parayı tutma: maliyet başta kesilir, taksitler düşülür', () => {
    const offer = { cashPrice: 100_000, downPayment: 0, count: 2, installment: 10_000, firstAfterMonths: 1 };
    expect(simulateHolding(scheduleFromInstallments(offer), 0, 0.01)).toEqual([89_000, 79_000]);
    const b = simulateHolding(scheduleFromInstallments(offer), 0.1);
    expect(b[0]).toBeCloseTo(100_000 * 1.1 - 10_000, 6);
    expect(b[1]).toBeCloseTo(b[0]! * 1.1 - 10_000, 6);
  });
});
