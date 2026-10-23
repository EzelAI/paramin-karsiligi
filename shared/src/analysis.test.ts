import { describe, expect, it } from 'vitest';
import { analyzePayments, type PriceLookup } from './analysis';
import type { AssetId } from './assets';
import { dateInMonth, monthRange } from './dates';
import type { Payment } from './types';
import { xirr } from './xirr';

/** Basit lookup: varlık başına verilen tarihten önceki en yakın fiyat */
function makeLookup(table: Partial<Record<AssetId, Record<string, number>>>): PriceLookup {
  return (asset, date) => {
    const prices = table[asset] ?? {};
    const k = Object.keys(prices)
      .filter((d) => d <= date)
      .sort()
      .at(-1);
    return k ? prices[k] : undefined;
  };
}

const gold = { '2024-01-01': 2000, '2024-02-01': 2500, '2024-03-01': 4000 };
const lookup = makeLookup({ GRAM_GOLD: gold });
const pay = (id: number, date: string, amount: number): Payment => ({ id, investmentId: 1, date, amount, note: null });

describe('analyzePayments', () => {
  it('ödemeleri grama çevirir ve bugünkü değeri hesaplar', () => {
    const r = analyzePayments([pay(1, '2024-01-15', 20000), pay(2, '2024-02-10', 50000)], {
      assets: ['GRAM_GOLD'],
      lookup,
      asOf: '2024-03-05',
    });
    const g = r.assets.GRAM_GOLD!;
    expect(r.totalPaid).toBe(70000);
    expect(g.totalUnits).toBeCloseTo(10 + 20);
    expect(g.currentValue).toBeCloseTo(120000);
    expect(g.gain).toBeCloseTo(50000);
    expect(g.averageCost).toBeCloseTo(70000 / 30);
  });

  it('fiyatı olmayan ödemeleri hariç tutar ve sayar', () => {
    const r = analyzePayments([pay(1, '2023-06-01', 1000), pay(2, '2024-01-02', 2000)], {
      assets: ['GRAM_GOLD'],
      lookup,
      asOf: '2024-01-31',
    });
    const g = r.assets.GRAM_GOLD!;
    expect(g.missingCount).toBe(1);
    expect(g.coveredCount).toBe(1);
    expect(g.totalUnits).toBeCloseTo(1);
    expect(g.coveredPaid).toBe(2000);
    expect(r.totalPaid).toBe(3000);
  });

  it('gelecek tarihli ödemeleri planlanan olarak ayırır ve hesaba katmaz', () => {
    const r = analyzePayments([pay(1, '2024-01-15', 20000), pay(2, '2024-06-15', 50000)], {
      assets: ['GRAM_GOLD'],
      lookup,
      asOf: '2024-03-05',
    });
    expect(r.totalPaid).toBe(20000);
    expect(r.paymentCount).toBe(1);
    expect(r.planned.map((p) => p.id)).toEqual([2]);
    expect(r.plannedTotal).toBe(50000);
    expect(r.assets.GRAM_GOLD!.totalUnits).toBeCloseTo(10);
    expect(r.timeline.at(-1)!.month).toBe('2024-03');
    expect(r.timeline.at(-1)!.paid).toBe(20000);
  });

  it('alım maliyetini birimden düşer', () => {
    const r = analyzePayments([pay(1, '2024-01-15', 20000)], {
      assets: ['GRAM_GOLD'],
      lookup,
      asOf: '2024-01-20',
      costRate: () => 0.02,
    });
    expect(r.assets.GRAM_GOLD!.totalUnits).toBeCloseTo(9.8);
    expect(r.assets.GRAM_GOLD!.gainPct).toBeCloseTo(-2);
  });

  it('aylık zaman serisi üretir', () => {
    const r = analyzePayments([pay(1, '2024-01-15', 20000)], { assets: ['GRAM_GOLD'], lookup, asOf: '2024-03-05' });
    expect(r.timeline.map((t) => t.month)).toEqual(['2024-01', '2024-02', '2024-03']);
    expect(r.timeline[1]!.values.GRAM_GOLD).toBeCloseTo(10 * 2500);
  });

  it('bir yıldan kısa sürede yıllık getiri vermez', () => {
    const r = analyzePayments([pay(1, '2024-01-15', 20000)], { assets: ['GRAM_GOLD'], lookup, asOf: '2024-03-05' });
    expect(r.assets.GRAM_GOLD!.xirr).toBeNull();
  });

  it('yıllık getiriyi (XIRR) ve enflasyona göre reel getiriyi hesaplar', () => {
    const l = makeLookup({
      GRAM_GOLD: { '2022-01-01': 1000, '2024-01-01': 1440 },
      TUFE: { '2022-01-01': 100, '2024-01-01': 120 },
    });
    const r = analyzePayments([pay(1, '2022-01-01', 1000)], {
      assets: ['GRAM_GOLD', 'TUFE'],
      lookup: l,
      asOf: '2024-01-01',
      deflator: 'TUFE',
    });
    const g = r.assets.GRAM_GOLD!;
    // 2 yılda %44 → yılda ~%20 (730 gün / 365)
    expect(g.xirr).toBeCloseTo(0.2, 3);
    expect(g.real!.paidToday).toBeCloseTo(1200);
    expect(g.real!.gainPct).toBeCloseTo(20);
    // reel: 1440/1200 = 1,2 iki yılda → yılda ~%9,54
    expect(g.real!.xirr).toBeCloseTo(Math.sqrt(1.2) - 1, 3);
    // Enflasyonun kendisinin reel getirisi sıfırdır
    expect(r.assets.TUFE!.real!.gainPct).toBeCloseTo(0);
  });

  it('XIRR erken ödenen parayı daha ağır tartar', () => {
    // Aynı toplam getiri, farklı zamanlama: geç ödeme daha yüksek yıllık getiri demektir
    const l = makeLookup({ GRAM_GOLD: { '2020-01-01': 100, '2024-01-01': 200 } });
    const early = analyzePayments([pay(1, '2020-01-01', 1000)], { assets: ['GRAM_GOLD'], lookup: l, asOf: '2024-01-01' });
    const late = analyzePayments([pay(1, '2023-01-01', 1000)], {
      assets: ['GRAM_GOLD'],
      lookup: makeLookup({ GRAM_GOLD: { '2023-01-01': 100, '2024-01-01': 200 } }),
      asOf: '2024-01-01',
    });
    expect(early.assets.GRAM_GOLD!.gainPct).toBeCloseTo(late.assets.GRAM_GOLD!.gainPct!);
    expect(late.assets.GRAM_GOLD!.xirr!).toBeGreaterThan(early.assets.GRAM_GOLD!.xirr!);
  });
});

describe('xirr', () => {
  it('tek dönemlik getiriyi bulur', () => {
    expect(
      xirr([
        { date: '2023-01-01', amount: -1000 },
        { date: '2024-01-01', amount: 1100 },
      ]),
    ).toBeCloseTo(0.1, 6);
  });

  it('kayıpta negatif getiri verir', () => {
    expect(
      xirr([
        { date: '2023-01-01', amount: -1000 },
        { date: '2024-01-01', amount: 500 },
      ]),
    ).toBeCloseTo(-0.5, 6);
  });

  it('çok yüksek getiriyi de bulur', () => {
    expect(
      xirr([
        { date: '2023-01-01', amount: -100 },
        { date: '2024-01-01', amount: 3000 },
      ]),
    ).toBeCloseTo(29, 4);
  });

  it('işaret değişimi yoksa null döner', () => {
    expect(xirr([{ date: '2023-01-01', amount: -1000 }])).toBeNull();
    expect(
      xirr([
        { date: '2023-01-01', amount: 100 },
        { date: '2024-01-01', amount: 100 },
      ]),
    ).toBeNull();
  });
});

describe('dates', () => {
  it('ay aralığı üretir', () => {
    expect(monthRange('2024-11', '2025-02')).toEqual(['2024-11', '2024-12', '2025-01', '2025-02']);
  });
  it('ay sonunu aşan günü sabitler', () => {
    expect(dateInMonth('2024-02', 31)).toBe('2024-02-29');
  });
});
