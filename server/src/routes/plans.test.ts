import { defaultCustom, defaultInstallments, newPurchasePlan, type PaymentOption } from '@paramin-karsiligi/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { createContainer } from '../container';

describe('alacaklarım API', async () => {
  const c = createContainer({ dbPath: ':memory:' });
  const app = await buildApp(c);
  afterAll(() => app.close());

  it('ürün ekler, günceller ve siler', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/plans', payload: newPurchasePlan('Araba') });
    expect(created.statusCode).toBe(201);
    const plan = created.json();
    expect(plan).toMatchObject({ name: 'Araba', cashPrice: null, returnPct: null });
    // Yeni ürün tek bir eşit taksit seçeneğiyle başlar
    expect(plan.options).toHaveLength(1);
    expect(plan.options[0]).toMatchObject({ kind: 'installments', count: 12, amountMode: 'monthly', firstAfterMonths: 1, amount: null });

    const options: PaymentOption[] = [
      { ...defaultInstallments('24 taksit'), downPayment: 250_000, amount: 95_000.1, amountMode: 'total', firstAfterMonths: 0, count: 24 },
      {
        ...defaultCustom('Yarısı 6 ay sonra'),
        totalPrice: 1_300_000.555,
        rows: [
          { afterMonths: 6, value: 50, unit: 'pct' },
          { afterMonths: 12, value: 650_000, unit: 'tl' },
        ],
      },
    ];
    const update = { ...newPurchasePlan('Araba'), cashPrice: 1_250_000.555, options, returnPct: 30.6 };
    const updated = await app.inject({ method: 'PUT', url: `/api/plans/${plan.id}`, payload: update });
    expect(updated.statusCode).toBe(200);
    const body = updated.json();
    // Tutarlar kuruşa yuvarlanır, seçenekler sırasıyla geri gelir
    expect(body).toMatchObject({ cashPrice: 1_250_000.56, returnPct: 30.6, inflationPct: null });
    expect(body.options).toHaveLength(2);
    expect(body.options[0]).toMatchObject({ name: '24 taksit', downPayment: 250_000, amount: 95_000.1, amountMode: 'total', firstAfterMonths: 0, count: 24 });
    expect(body.options[1]).toMatchObject({
      kind: 'custom',
      name: 'Yarısı 6 ay sonra',
      totalPrice: 1_300_000.56,
      rows: [
        { afterMonths: 6, value: 50, unit: 'pct' },
        { afterMonths: 12, value: 650_000, unit: 'tl' },
      ],
    });

    // Yeniden okununca aynı
    const read = await app.inject({ method: 'GET', url: `/api/plans/${plan.id}` });
    expect(read.json().options).toEqual(body.options);
    expect((await app.inject({ method: 'GET', url: '/api/plans' })).json()).toHaveLength(1);

    expect((await app.inject({ method: 'DELETE', url: `/api/plans/${plan.id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/api/plans/${plan.id}` })).statusCode).toBe(404);
  });

  it('seçenek özelliğinden önce oluşturulmuş kaydı tek taksit seçeneği olarak okur', async () => {
    c.db
      .prepare(
        `INSERT INTO purchase_plans (id, name, cash_kurus, down_kurus, installment_count, amount_mode, amount_kurus, first_after_months)
         VALUES (900, 'Eski', 10000000, 2500000, 24, 'monthly', 400000, 0)`,
      )
      .run();
    const res = await app.inject({ method: 'GET', url: '/api/plans/900' });
    expect(res.statusCode).toBe(200);
    const plan = res.json();
    expect(plan).toMatchObject({ name: 'Eski', cashPrice: 100_000 });
    expect(plan.options).toHaveLength(1);
    expect(plan.options[0]).toMatchObject({ kind: 'installments', downPayment: 25_000, count: 24, amount: 4_000, firstAfterMonths: 0 });
  });

  it('geçersiz girişi reddeder', async () => {
    const bad = (patch: object) => app.inject({ method: 'POST', url: '/api/plans', payload: { ...newPurchasePlan('X'), ...patch } });
    expect((await bad({ name: ' ' })).statusCode).toBe(400);
    expect((await bad({ options: [] })).statusCode).toBe(400);
    expect((await bad({ options: [{ ...defaultInstallments(), count: 0 }] })).statusCode).toBe(400);
    const same = defaultInstallments();
    expect((await bad({ options: [same, same] })).statusCode).toBe(400);
    expect((await bad({ options: Array.from({ length: 9 }, () => defaultInstallments()) })).statusCode).toBe(400);
  });
});
