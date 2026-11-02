import { DEFAULT_SETTINGS, MAIN_FIELD } from '@paramin-karsiligi/shared';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../db';
import type { FetchedSeries, PriceProvider } from '../providers/types';
import { PriceRepository } from '../repositories/prices';
import { PriceService } from './priceService';

const today = new Date().toISOString().slice(0, 10);

/** Her sembol için sabit değerli iki noktalı seri döndürür */
const constant = (name: string, value: number): PriceProvider => ({
  name,
  fetch: async (): Promise<FetchedSeries> => ({
    [MAIN_FIELD]: [
      { date: '2010-06-01', close: value },
      { date: today, close: value },
    ],
  }),
});

const failing = (name: string, message: string): PriceProvider => ({
  name,
  fetch: async () => {
    throw new Error(message);
  },
});

function service(providers: Record<string, PriceProvider>) {
  const logs: string[] = [];
  const svc = new PriceService(new PriceRepository(openDatabase(':memory:')), providers, () => DEFAULT_SETTINGS, {
    refreshMs: 1000,
    historyStart: '2005-01-01',
    log: (m) => logs.push(m),
  });
  return { svc, logs };
}

const base = () => ({ yahoo: constant('yahoo', 10), tcmb: constant('tcmb', 36), 'tcmb-cpi': constant('tcmb-cpi', 1.5) });
const faiz = (svc: PriceService) => svc.status().find((s) => s.assetId === 'FAIZ')!;

describe('fiyat servisi: EVDS isteğe bağlı kaynaklar', () => {
  it('EVDS sağlayıcısı yokken hata vermez, politika faizini kullanır', async () => {
    const { svc } = service(base());
    await svc.ensureFresh(true);
    expect(faiz(svc)).toMatchObject({ ratePct: 36, rateKind: 'policy' });
    expect(svc.expectations()).toEqual({ usdTry12m: null, cpi12m: null });
  });

  it('EVDS sağlayıcısı varsa gerçek mevduat faizini, beklentileri ve resmî kuru kullanır', async () => {
    const evds: PriceProvider = {
      name: 'evds',
      fetch: async (symbol): Promise<FetchedSeries> => {
        const value = symbol === 'DEPOSIT_TRY' ? 43.3 : symbol === 'PKA_USD12' ? 59.26 : symbol === 'PKA_CPI12' ? 23.89 : 2;
        return { [MAIN_FIELD]: [{ date: today, close: value }] };
      },
    };
    const { svc } = service({ ...base(), evds });
    await svc.ensureFresh(true);
    expect(faiz(svc)).toMatchObject({ ratePct: 43.3, rateKind: 'deposit' });
    expect(svc.expectations().usdTry12m?.value).toBe(59.26);
    expect(svc.expectations().cpi12m?.value).toBe(23.89);
    // Yahoo 10, TCMB 2: çapraz kontrol hesaplanır
    expect(svc.status().find((s) => s.assetId === 'USD')!.official).not.toBeNull();
  });

  it('EVDS hata verirse güncelleme düşmez, yedek veriyle devam eder', async () => {
    const { svc, logs } = service({ ...base(), evds: failing('evds', 'EVDS anahtarı reddedildi') });
    await expect(svc.ensureFresh(true)).resolves.toBeUndefined();
    expect(faiz(svc)).toMatchObject({ ratePct: 36, rateKind: 'policy' });
    expect(logs.join(' ')).toMatch(/EVDS_DEPOSIT/);
  });

  it('zorunlu kaynak (Yahoo) alınamazsa yine hata verir', async () => {
    const { svc } = service({ ...base(), yahoo: failing('yahoo', 'ağ yok') });
    await expect(svc.ensureFresh(true)).rejects.toThrow(/Bazı fiyatlar alınamadı/);
  });
});
