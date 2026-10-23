import { describe, expect, it } from 'vitest';
import { gldOuncesPerShare } from './assetPricing';
import { compoundIndex, cpiIndex, detectJumps, productSeries, totalReturnSeries, type Series } from './seriesMath';

const s = (entries: [string, number][]): Series => ({ dates: entries.map((e) => e[0]), values: entries.map((e) => e[1]) });

describe('compoundIndex', () => {
  it('yıllık faizi günlük bileşik uygular', () => {
    const { dates, values } = compoundIndex(s([['2024-01-01', 36.5]]), '2024-01-01', '2024-01-11');
    expect(dates).toHaveLength(11);
    expect(values[0]).toBe(1);
    expect(values[10]).toBeCloseTo(1.001 ** 10, 10);
  });

  it('faiz değişikliğini değişiklik gününden itibaren uygular', () => {
    const { values } = compoundIndex(
      s([
        ['2024-01-01', 0],
        ['2024-01-03', 365],
      ]),
      '2024-01-01',
      '2024-01-04',
    );
    expect(values).toEqual([1, 1, 1.01, 1.01 * 1.01]);
  });

  it('stopaj ve fark ayarını uygular', () => {
    // (%40 + 10 puan) × (1 − %20) = %40 net
    const { values } = compoundIndex(s([['2024-01-01', 40]]), '2024-01-01', '2024-01-02', (r) => (r + 10) * 0.8);
    expect(values[1]).toBeCloseTo(1 + 0.4 / 365, 12);
  });

  it('faiz verisi başlamadan önceki günleri atlar', () => {
    const { dates } = compoundIndex(s([['2024-01-03', 10]]), '2024-01-01', '2024-01-04');
    expect(dates).toEqual(['2024-01-03', '2024-01-04']);
  });
});

describe('productSeries', () => {
  it('eksik günleri bir önceki değerle doldurur ve iki seri başlayınca üretir', () => {
    const gold = s([
      ['2024-01-01', 10],
      ['2024-01-03', 12],
    ]);
    const fx = s([
      ['2024-01-02', 2],
      ['2024-01-03', 3],
      ['2024-01-04', 4],
    ]);
    const r = productSeries([gold, fx], 0.5);
    expect(r.dates).toEqual(['2024-01-02', '2024-01-03', '2024-01-04']);
    expect(r.values).toEqual([10 * 2 * 0.5, 12 * 3 * 0.5, 12 * 4 * 0.5]);
  });

  it('tarihe bağlı katsayıyı uygular', () => {
    const r = productSeries([s([['2024-01-01', 10]])], 1, () => 1.1);
    expect(r.values[0]).toBeCloseTo(11);
  });
});

describe('totalReturnSeries', () => {
  const prices = s([
    ['2024-01-01', 100],
    ['2024-01-02', 98],
    ['2024-01-03', 99],
  ]);
  const div = s([['2024-01-02', 2]]);

  it('stopajsız temettüyü önceki kapanıştan yeniden yatırır', () => {
    const r = totalReturnSeries(prices, div, 0);
    expect(r.values[0]).toBe(100);
    expect(r.values[1]).toBeCloseTo(98 * 1.02);
    expect(r.values[2]).toBeCloseTo(99 * 1.02);
  });

  it('stopajı temettüden düşer', () => {
    const r = totalReturnSeries(prices, div, 25);
    expect(r.values[2]).toBeCloseTo(99 * (1 + 1.5 / 100));
  });
});

describe('cpiIndex', () => {
  it('aylık değişimleri birleştirir ve ay içinde ara değer verir', () => {
    const r = cpiIndex(
      s([
        ['2024-01-01', 10],
        ['2024-02-01', 10],
      ]),
      '2024-03-15',
    );
    const at = (d: string) => r.values[r.dates.indexOf(d)]!;
    expect(at('2024-01-31')).toBeCloseTo(110);
    expect(at('2024-02-29')).toBeCloseTo(121);
    // Açıklanmamış ay: son değerle sabit
    expect(r.dates.at(-1)).toBe('2024-03-15');
    expect(r.values.at(-1)).toBeCloseTo(121);
    expect(at('2024-01-16')).toBeGreaterThan(100);
    expect(at('2024-01-16')).toBeLessThan(110);
  });
});

describe('detectJumps', () => {
  it('eşiği aşan günlük değişimleri bulur', () => {
    const r = detectJumps(
      s([
        ['2024-01-01', 100],
        ['2024-01-02', 105],
        ['2024-01-03', 52],
      ]),
      25,
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.date).toBe('2024-01-03');
  });
});

describe('gldOuncesPerShare', () => {
  it('fon açılışında 0,1 ons, sonra yılda %0,4 azalır', () => {
    expect(gldOuncesPerShare('2004-11-18')).toBeCloseTo(0.1, 6);
    expect(gldOuncesPerShare('2014-11-18')).toBeCloseTo(0.1 * 0.996 ** 10, 4);
  });
});
