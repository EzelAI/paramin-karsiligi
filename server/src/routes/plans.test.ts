import { newPurchasePlan } from '@paramin-karsiligi/shared';
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
    expect(plan).toMatchObject({ name: 'Araba', cashPrice: null, count: 12, amountMode: 'monthly', firstAfterMonths: 1 });

    const update = {
      ...newPurchasePlan('Araba'),
      cashPrice: 1_250_000.555,
      downPayment: 250_000,
      amount: 95_000.1,
      amountMode: 'total',
      firstAfterMonths: 0,
      returnPct: 30.6,
    };
    const updated = await app.inject({ method: 'PUT', url: `/api/plans/${plan.id}`, payload: update });
    expect(updated.statusCode).toBe(200);
    // Tutarlar kuruşa yuvarlanır
    expect(updated.json()).toMatchObject({ cashPrice: 1_250_000.56, downPayment: 250_000, amount: 95_000.1, amountMode: 'total', firstAfterMonths: 0, returnPct: 30.6, inflationPct: null });

    const list = await app.inject({ method: 'GET', url: '/api/plans' });
    expect(list.json()).toHaveLength(1);

    expect((await app.inject({ method: 'DELETE', url: `/api/plans/${plan.id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/api/plans/${plan.id}` })).statusCode).toBe(404);
  });

  it('geçersiz girişi reddeder', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/plans', payload: { ...newPurchasePlan(' '), count: 0 } });
    expect(res.statusCode).toBe(400);
  });
});
