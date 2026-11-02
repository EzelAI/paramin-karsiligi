import { describe, expect, it } from 'vitest';
import { PriceCalculator } from './priceCalc';
import { DEFAULT_SETTINGS } from './settings';
import { toIsoDate } from './dates';

type Points = [string, number][];

/** Ham seri tablosundan hesap sınıfı için kaynak */
const calc = (table: Record<string, Points>) =>
  new PriceCalculator(
    {
      series: (key) => ({ dates: (table[key] ?? []).map(([d]) => d), values: (table[key] ?? []).map(([, v]) => v) }),
      lastFetchedAt: (key) => (table[key] ? '2026-11-03T00:00:00Z' : null),
    },
    () => DEFAULT_SETTINGS,
  );

const status = (c: PriceCalculator, id: string) => c.status().find((s) => s.assetId === id)!;

describe('faiz: gerçek mevduat faizi ve yedek', () => {
  it('EVDS mevduat serisi varsa onu kullanır', () => {
    const c = calc({ TCMB_POLICY: [['2020-01-01', 10]], EVDS_DEPOSIT: [['2020-01-03', 40], ['2026-10-23', 43.3]] });
    const s = status(c, 'FAIZ');
    expect(s.ratePct).toBe(43.3);
    expect(s.rateKind).toBe('deposit');
    expect(s.sourceLastDate).toBe('2026-10-23');
  });

  it('seri yoksa politika faizine döner', () => {
    const c = calc({ TCMB_POLICY: [['2020-01-01', 10], ['2026-10-22', 36]] });
    const s = status(c, 'FAIZ');
    expect(s.ratePct).toBe(36);
    expect(s.rateKind).toBe('policy');
  });

  it('endeks, seçilen oranla büyür: yıllık %40 brüt, %15 stopajla günlük bileşik', () => {
    const c = calc({ EVDS_DEPOSIT: [['2005-01-01', 40]] });
    const a = c.lookup('FAIZ', '2005-12-31')!;
    const b = c.lookup('FAIZ', '2006-12-31')!;
    // Net yıllık %34 → günlük bileşik ≈ (1 + 0,34/365)^365 − 1
    expect(b / a - 1).toBeCloseTo(Math.pow(1 + 0.34 / 365, 365) - 1, 3);
    // Politika faizi aynı sayıyla verilse sonuç aynı olmalı
    const p = calc({ TCMB_POLICY: [['2005-01-01', 40]] });
    expect(p.lookup('FAIZ', '2006-12-31')! / p.lookup('FAIZ', '2005-12-31')!).toBeCloseTo(b / a, 9);
  });
});

describe('TÜFE: EVDS ve yedek', () => {
  it('EVDS serisi varsa onu kullanır', () => {
    const base = [['2024-01-01', 1], ['2024-02-01', 1], ['2024-03-01', 1]] as Points;
    const withEvds = calc({ TCMB_CPI: base, EVDS_CPI: [['2024-01-01', 5], ['2024-02-01', 5], ['2024-03-01', 5]] });
    const fallback = calc({ TCMB_CPI: base });
    const grow = (c: PriceCalculator) => c.lookup('TUFE', '2024-03-31')! / c.lookup('TUFE', '2024-01-01')!;
    expect(grow(withEvds)).toBeGreaterThan(grow(fallback));
  });
});

describe('beklentiler', () => {
  it('son anketin değerleri ve ayı', () => {
    const c = calc({
      EVDS_PKA_USD12: [['2026-09-01', 58.6049], ['2026-10-01', 59.2596]],
      EVDS_PKA_CPI12: [['2026-09-01', 23.7], ['2026-10-01', 23.89]],
    });
    expect(c.expectations()).toEqual({
      usdTry12m: { value: 59.2596, month: '2026-10' },
      cpi12m: { value: 23.89, month: '2026-10' },
    });
  });

  it('veri yoksa null', () => {
    expect(calc({}).expectations()).toEqual({ usdTry12m: null, cpi12m: null });
  });
});

describe('resmî kur çapraz kontrolü', () => {
  const today = toIsoDate(new Date());

  it('Yahoo kuru ile TCMB kuru arasındaki farkı yüzde olarak verir', () => {
    const c = calc({ 'USDTRY=X': [[today, 50]], EVDS_USD: [[today, 49.5]] });
    const o = status(c, 'USD').official!;
    expect(o.price).toBe(49.5);
    expect(o.date).toBe(today);
    expect(o.deviationPct).toBeCloseTo((50 / 49.5 - 1) * 100, 9);
  });

  it('EVDS verisi yoksa null; döviz olmayan varlıkta da null', () => {
    const c = calc({ 'USDTRY=X': [[today, 50]] });
    expect(status(c, 'USD').official).toBeNull();
    expect(status(c, 'GRAM_GOLD').official).toBeNull();
  });
});
