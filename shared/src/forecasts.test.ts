import { describe, expect, it } from 'vitest';
import { GOLD_FORECAST_AVERAGE, GOLD_FORECASTS, goldBreakEvenOz, monthlyGrowth } from './forecasts';
import { monthlyFromDailyCompounded, simulateHolding } from './installment';

describe('tahmin varsayımları', () => {
  it('ortalama, listedeki tahminlerden hesaplanır', () => {
    const values = GOLD_FORECASTS.map((f) => f.value);
    expect(GOLD_FORECAST_AVERAGE).toBeGreaterThanOrEqual(Math.min(...values));
    expect(GOLD_FORECAST_AVERAGE).toBeLessThanOrEqual(Math.max(...values));
    expect(GOLD_FORECAST_AVERAGE).toBeCloseTo(values.reduce((a, b) => a + b) / values.length, 9);
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
    expect(simulateHolding(offer, 0, 0.01)).toEqual([89_000, 79_000]);
    const b = simulateHolding(offer, 0.1);
    expect(b[0]).toBeCloseTo(100_000 * 1.1 - 10_000, 6);
    expect(b[1]).toBeCloseTo(b[0]! * 1.1 - 10_000, 6);
  });
});
