import { describe, expect, it } from 'vitest';
import {
  compareInstallment,
  impliedMonthlyRate,
  monthlyFromDailyCompounded,
  netDepositRatePct,
  type InstallmentOffer,
} from './installment';

const offer = (o: Partial<InstallmentOffer> = {}): InstallmentOffer => ({
  cashPrice: 120_000,
  downPayment: 0,
  count: 12,
  installment: 10_000,
  firstAfterMonths: 1,
  ...o,
});

describe('peşin mi taksit mi', () => {
  it('faizsiz taksit, getiri yoksa eşittir', () => {
    const c = compareInstallment(offer(), { annualReturnPct: 0, annualInflationPct: null });
    expect(c.totalPrice).toBe(120_000);
    expect(c.markup).toBe(0);
    expect(c.presentValue).toBeCloseTo(120_000, 6);
    expect(c.advantage).toBeCloseTo(0, 6);
    expect(c.endBalance).toBeCloseTo(0, 6);
    expect(c.impliedMonthlyRate).toBeCloseTo(0, 9);
    expect(c.realTotal).toBeNull();
  });

  it('faizsiz taksit, mevduat getirisi varken taksit avantajlı', () => {
    const c = compareInstallment(offer(), { annualReturnPct: 40, annualInflationPct: 30 });
    expect(c.advantage).toBeGreaterThan(0);
    expect(c.endBalance).toBeGreaterThan(0);
    // Son bakiye = avantajın son taksit tarihine taşınmış değeri
    expect(c.endBalance).toBeCloseTo(c.advantage * Math.pow(1 + c.returnMonthlyRate, 12), 4);
    expect(c.realTotal!).toBeLessThan(120_000);
  });

  it('teklifin içindeki faizi bulur', () => {
    // 100.000 peşin yerine bir ay sonra 110.000: aylık %10
    expect(impliedMonthlyRate(offer({ cashPrice: 100_000, count: 1, installment: 110_000 }))).toBeCloseTo(0.1, 9);
    // Peşinat sonrası finanse edilen tutar
    const m = impliedMonthlyRate(offer({ cashPrice: 150_000, downPayment: 50_000, count: 1, installment: 105_000 }));
    expect(m).toBeCloseTo(0.05, 9);
    // Taksitli toplam peşinden ucuzsa negatif
    expect(impliedMonthlyRate(offer({ installment: 9_000 }))!).toBeLessThan(0);
    // Peşinat peşin fiyatı karşılıyorsa finansman yok
    expect(impliedMonthlyRate(offer({ downPayment: 120_000 }))).toBeNull();
  });

  it('getiri teklifin faizine eşitse fark sıfırdır', () => {
    const o = offer({ installment: 11_000 });
    const m = impliedMonthlyRate(o)!;
    const c = compareInstallment(o, { annualReturnPct: 0, annualInflationPct: null });
    // Aylık m'ye denk gelen günlük bileşik yıllık faiz
    const annualPct = (Math.pow(1 + m, 12 / 365) - 1) * 365 * 100;
    expect(monthlyFromDailyCompounded(annualPct)).toBeCloseTo(m, 12);
    const even = compareInstallment(o, { annualReturnPct: annualPct, annualInflationPct: null });
    expect(even.advantage).toBeCloseTo(0, 4);
    expect(even.endBalance).toBeCloseTo(0, 4);
    expect(c.advantage).toBeLessThan(0);
  });

  it('ilk taksit bugünse iskonto edilmez', () => {
    const c = compareInstallment(offer({ firstAfterMonths: 0, count: 1, installment: 120_000 }), {
      annualReturnPct: 50,
      annualInflationPct: 50,
    });
    expect(c.presentValue).toBe(120_000);
    expect(c.realTotal).toBe(120_000);
    expect(c.endBalance).toBe(0);
  });

  it('net mevduat faizi', () => {
    expect(netDepositRatePct(40, 0, 15)).toBeCloseTo(34, 9);
    expect(netDepositRatePct(10, -12, 15)).toBe(0);
  });
});
