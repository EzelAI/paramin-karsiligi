import { describe, expect, it } from 'vitest';
import { buildPaymentSchedule, compareSchedule, impliedMonthlyRate, scheduleFromInstallments } from './installment';
import { customBase, defaultCustom, defaultInstallments, normalizePlan, optionToSchedule, splitAmount } from './paymentOptions';
import type { CustomOption, InstallmentsOption } from './types';

const installments = (o: Partial<InstallmentsOption> = {}): InstallmentsOption => ({
  ...defaultInstallments(),
  amount: 10_000,
  ...o,
});
const custom = (o: Partial<CustomOption> = {}): CustomOption => ({ ...defaultCustom(), ...o });

describe('ödeme takvimi', () => {
  it('bugüne denk gelen ödemeler peşine eklenir, aynı aydakiler birleşir ve sıralanır', () => {
    const s = buildPaymentSchedule(
      100,
      [
        { month: 6, amount: 10 },
        { month: 0, amount: 5 },
        { month: 6, amount: 7 },
        { month: 2, amount: 1 },
      ],
      20,
    );
    expect(s.upfront).toBe(25);
    expect(s.payments).toEqual([
      { month: 2, amount: 1 },
      { month: 6, amount: 17 },
    ]);
  });

  it('eşit taksit: ilk taksit bugünse peşine girer', () => {
    const s = scheduleFromInstallments({ cashPrice: 120, downPayment: 0, count: 3, installment: 40, firstAfterMonths: 0 });
    expect(s.upfront).toBe(40);
    expect(s.payments.map((p) => p.month)).toEqual([1, 2]);
  });

  it('faizi bulur: tek ödeme 6 ay sonra', () => {
    // 100 yerine 6 ay sonra 133: aylık ≈ %4,9
    const s = buildPaymentSchedule(100, [{ month: 6, amount: 133.1 }]);
    expect(impliedMonthlyRate(s)).toBeCloseTo(Math.pow(1.331, 1 / 6) - 1, 9);
    // Sonraki ödeme yoksa ya da her şey peşinse faiz yok
    expect(impliedMonthlyRate(buildPaymentSchedule(100, [], 100))).toBeNull();
    expect(impliedMonthlyRate(buildPaymentSchedule(100, [{ month: 3, amount: 50 }], 100))).toBeNull();
  });

  it('getiri sıfırken ve toplam eşitken karşılaştırma sıfır fark verir', () => {
    const s = buildPaymentSchedule(120_000, [
      { month: 6, amount: 60_000 },
      { month: 12, amount: 60_000 },
    ]);
    const c = compareSchedule(s, { annualReturnPct: 0, annualInflationPct: null });
    expect(c.advantage).toBeCloseTo(0, 6);
    expect(c.endBalance).toBeCloseTo(0, 6);
    expect(c.rows).toHaveLength(2);
  });

  it('faiz varken ertelenen ödeme avantajlıdır', () => {
    const s = buildPaymentSchedule(120_000, [
      { month: 6, amount: 60_000 },
      { month: 12, amount: 60_000 },
    ]);
    const c = compareSchedule(s, { annualReturnPct: 40, annualInflationPct: 30 });
    expect(c.advantage).toBeGreaterThan(0);
    expect(c.endBalance).toBeCloseTo(c.advantage * Math.pow(1 + c.returnMonthlyRate, 12), 4);
    expect(c.realTotal!).toBeLessThan(120_000);
  });
});

describe('ödeme seçeneği → takvim', () => {
  it('peşin fiyat olmadan hesaplanmaz', () => {
    expect(optionToSchedule(installments(), null).problem).toBe('Peşin fiyatı girin.');
    expect(optionToSchedule(installments(), 0).schedule).toBeNull();
  });

  it('eşit taksit: aylık tutar ve peşinat', () => {
    const r = optionToSchedule(installments({ count: 12, amount: 9_000, downPayment: 20_000 }), 100_000);
    expect(r.problem).toBeNull();
    expect(r.schedule!.upfront).toBe(20_000);
    expect(r.schedule!.payments).toHaveLength(12);
    expect(r.schedule!.payments[0]).toEqual({ month: 1, amount: 9_000 });
  });

  it('eşit taksit: taksitli toplam girilince peşinat düşülüp bölünür', () => {
    const r = optionToSchedule(installments({ count: 10, amountMode: 'total', amount: 120_000, downPayment: 20_000 }), 100_000);
    expect(r.schedule!.payments[0]!.amount).toBe(10_000);
  });

  it('eşit taksit: eksik ve geçersiz girişleri açıklar', () => {
    expect(optionToSchedule(installments({ amount: null }), 100).problem).toMatch(/taksit tutarını/);
    expect(optionToSchedule(installments({ amountMode: 'total', amount: null }), 100).problem).toMatch(/toplam tutarı/);
    expect(optionToSchedule(installments({ count: 0 }), 100).problem).toMatch(/Taksit sayısı/);
    expect(optionToSchedule(installments({ count: 2.5 }), 100).problem).toMatch(/Taksit sayısı/);
    expect(optionToSchedule(installments({ downPayment: 100 }), 100).problem).toMatch(/Peşinat/);
    expect(optionToSchedule(installments({ amountMode: 'total', amount: 20, downPayment: 30, count: 2 }), 100).problem).toMatch(/peşinattan büyük/);
    expect(optionToSchedule(installments({ firstAfterMonths: 99 }), 100).problem).toMatch(/İlk taksit/);
  });

  it('özel plan: yarısı 6 ay sonra, yarısı 12 ay sonra (tutar olarak)', () => {
    const r = optionToSchedule(
      custom({
        rows: [
          { afterMonths: 6, value: 100_000, unit: 'tl' },
          { afterMonths: 12, value: 100_000, unit: 'tl' },
        ],
      }),
      200_000,
    );
    expect(r.problem).toBeNull();
    expect(r.schedule).toEqual({
      cashPrice: 200_000,
      upfront: 0,
      payments: [
        { month: 6, amount: 100_000 },
        { month: 12, amount: 100_000 },
      ],
    });
  });

  it('özel plan: eski kayıtlardaki yüzdeler toplam fiyata, TL satırları olduğu gibi alınır', () => {
    const r = optionToSchedule(
      custom({
        totalPrice: 250_000,
        rows: [
          { afterMonths: 0, value: 20, unit: 'pct' },
          { afterMonths: 3, value: 125_000, unit: 'tl' },
          { afterMonths: 9, value: 30, unit: 'pct' },
        ],
      }),
      200_000,
    );
    expect(r.schedule!.upfront).toBe(50_000);
    expect(r.schedule!.payments).toEqual([
      { month: 3, amount: 125_000 },
      { month: 9, amount: 75_000 },
    ]);
  });

  it('özel plan: tutarlar toplam fiyattan farklı olsa da hesaplanır (fark arayüzde gösterilir)', () => {
    const eksik = optionToSchedule(custom({ rows: [{ afterMonths: 6, value: 40, unit: 'tl' }] }), 100);
    expect(eksik.problem).toBeNull();
    expect(eksik.schedule!.payments).toEqual([{ month: 6, amount: 40 }]);
  });

  it('özel plan: varsayılan satırlar boştur ve tutar istenir', () => {
    const r = optionToSchedule(defaultCustom(), 100);
    expect(r.schedule).toBeNull();
    expect(r.problem).toMatch(/1\. satır için tutarı girin/);
  });

  it('toplam fiyat tabanı: seçeneğe özel toplam, yoksa peşin fiyat', () => {
    expect(customBase(custom({ totalPrice: 120 }), 100)).toBe(120);
    expect(customBase(custom({ totalPrice: null }), 100)).toBe(100);
    expect(customBase(custom({ totalPrice: null }), null)).toBeNull();
  });

  it('özel plan: eksik ya da geçersiz satırı hangi satır olduğuyla bildirir', () => {
    expect(optionToSchedule(custom({ rows: [] }), 100).problem).toMatch(/en az bir/i);
    expect(optionToSchedule(custom({ rows: [{ afterMonths: null, value: 50, unit: 'pct' }] }), 100).problem).toMatch(/1\. satır.*kaç ay/);
    expect(
      optionToSchedule(
        custom({
          rows: [
            { afterMonths: 6, value: 50, unit: 'pct' },
            { afterMonths: 12, value: null, unit: 'pct' },
          ],
        }),
        100,
      ).problem,
    ).toMatch(/2\. satır.*yüzdeyi/);
    expect(optionToSchedule(custom({ rows: [{ afterMonths: 6, value: null, unit: 'tl' }] }), 100).problem).toMatch(/tutarı/);
    expect(optionToSchedule(custom({ rows: [{ afterMonths: 6, value: 150, unit: 'pct' }] }), 100).problem).toMatch(/100'ü aşamaz/);
    expect(optionToSchedule(custom({ rows: [{ afterMonths: -1, value: 5, unit: 'tl' }] }), 100).problem).toMatch(/kaç ay/);
  });
});

describe('tutar bölme', () => {
  it('kuruş farkı son parçaya eklenir, toplam değişmez', () => {
    expect(splitAmount(100, 2)).toEqual([50, 50]);
    const parts = splitAmount(100, 3);
    expect(parts).toEqual([33.33, 33.33, 33.34]);
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 9);
    expect(splitAmount(1_250_000.55, 4).reduce((a, b) => a + b, 0)).toBeCloseTo(1_250_000.55, 6);
    expect(splitAmount(10, 1)).toEqual([10]);
  });
});

describe('kayıt biçimi', () => {
  const base = { id: 1, name: 'Araba', cashPrice: 1_000_000, returnPct: null, inflationPct: null, createdAt: '2026-01-01' };

  it('seçeneği olmayan eski kaydı tek bir eşit taksit seçeneğine çevirir', () => {
    const p = normalizePlan({ ...base, options: null, downPayment: 250_000, count: 24, amountMode: 'total', amount: 1_300_000, firstAfterMonths: 0 });
    expect(p.options).toHaveLength(1);
    expect(p.options[0]).toMatchObject({
      id: 'taksit-1',
      kind: 'installments',
      downPayment: 250_000,
      count: 24,
      amountMode: 'total',
      amount: 1_300_000,
      firstAfterMonths: 0,
    });
    // Kimlik kayıt okundukça değişmez
    expect(normalizePlan({ ...base, options: null }).options[0]!.id).toBe('taksit-1');
  });

  it('seçenekleri olan kaydı olduğu gibi bırakır', () => {
    const options = [defaultCustom('Özel')];
    expect(normalizePlan({ ...base, options }).options).toBe(options);
  });
});
