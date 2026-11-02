import { MAIN_FIELD } from '@paramin-karsiligi/shared';
import { describe, expect, it } from 'vitest';
import { EvdsClient, EvdsProvider, monthlyChanges, spliceDeposit } from './evds';

const pt = (date: string, close: number) => ({ date, close });

describe('EVDS sağlayıcı yardımcıları', () => {
  it('endeksten aylık yüzde değişim üretir (2 ondalık)', () => {
    expect(monthlyChanges([pt('2024-01-01', 100), pt('2024-02-01', 103.456), pt('2024-03-01', 106)])).toEqual([
      pt('2024-02-01', 3.46),
      pt('2024-03-01', 2.46),
    ]);
    expect(monthlyChanges([pt('2024-01-01', 100)])).toEqual([]);
  });

  it('mevduat serilerini 6 Temmuz 2012 noktasında birleştirir', () => {
    const all = [pt('2012-06-29', 9), pt('2012-07-06', 9.5), pt('2012-07-13', 9.6)];
    const retail = [pt('2012-07-06', 10), pt('2012-07-13', 10.1)];
    expect(spliceDeposit(all, retail)).toEqual([pt('2012-06-29', 9), pt('2012-07-06', 10), pt('2012-07-13', 10.1)]);
  });
});

/** Seri koduna göre sabit yanıt veren sahte EVDS */
function fakeClient(table: Record<string, Record<string, unknown>[]>, calls: string[] = []) {
  return new EvdsClient('k', async (url) => {
    const path = String(url);
    const code = /series=([^&]+)/.exec(path)![1]!;
    calls.push(`${code} ${/startDate=([^&]+)/.exec(path)![1]} ${/endDate=([^&]+)/.exec(path)![1]}`);
    return new Response(JSON.stringify({ items: table[code] ?? [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
}

describe('EvdsProvider', () => {
  it('mevduat: 2012 öncesi tüm mevduat, sonrası tasarruf mevduatı', async () => {
    const calls: string[] = [];
    const client = fakeClient(
      {
        'TP.TRY.MT02': [{ Tarih: '29-06-2012', TP_TRY_MT02: '9' }],
        'TP.TRYTAS.MT02': [
          { Tarih: '06-07-2012', TP_TRYTAS_MT02: '10' },
          { Tarih: '23-10-2026', TP_TRYTAS_MT02: '43.41' },
        ],
      },
      calls,
    );
    const out = await new EvdsProvider(client, () => '2026-11-03').fetch('DEPOSIT_TRY', '2005-01-01');
    expect(out[MAIN_FIELD]).toEqual([pt('2012-06-29', 9), pt('2012-07-06', 10), pt('2026-10-23', 43.41)]);
    expect(calls).toEqual(['TP.TRY.MT02 01-01-2005 06-07-2012', 'TP.TRYTAS.MT02 06-07-2012 03-11-2026']);
  });

  it('mevduat: başlangıç 2012 sonrasıysa yalnızca tasarruf serisi istenir', async () => {
    const calls: string[] = [];
    const client = fakeClient({ 'TP.TRYTAS.MT02': [{ Tarih: '23-10-2026', TP_TRYTAS_MT02: '43.41' }] }, calls);
    await new EvdsProvider(client, () => '2026-11-03').fetch('DEPOSIT_TRY', '2026-10-01');
    expect(calls).toEqual(['TP.TRYTAS.MT02 01-10-2026 03-11-2026']);
  });

  it('TÜFE: tüm endeks çekilir, değişimler başlangıç tarihinden itibaren verilir', async () => {
    const client = fakeClient({
      'TP.GENENDEKS.T1': [
        { Tarih: '2004-12', TP_GENENDEKS_T1: '100' },
        { Tarih: '2005-1', TP_GENENDEKS_T1: '101' },
        { Tarih: '2005-2', TP_GENENDEKS_T1: '102.01' },
      ],
    });
    const out = await new EvdsProvider(client, () => '2026-11-03').fetch('CPI', '2005-01-01');
    expect(out[MAIN_FIELD]).toEqual([pt('2005-01-01', 1), pt('2005-02-01', 1)]);
  });

  it('kur ve beklenti serileri doğrudan noktaya çevrilir; bilinmeyen sembol hata verir', async () => {
    const client = fakeClient({
      'TP.DK.USD.A.YTL': [{ Tarih: '03-11-2026', TP_DK_USD_A_YTL: '49.8827' }],
      'TP.PKAUO.S05.C.U': [{ Tarih: '2026-10', TP_PKAUO_S05_C_U: '59.2596' }],
    });
    const p = new EvdsProvider(client, () => '2026-11-03');
    expect((await p.fetch('USD', '2026-10-01'))[MAIN_FIELD]).toEqual([pt('2026-11-03', 49.8827)]);
    expect((await p.fetch('PKA_USD12', '2026-01-01'))[MAIN_FIELD]).toEqual([pt('2026-10-01', 59.2596)]);
    await expect(p.fetch('YOK', '2026-01-01')).rejects.toThrow(/Bilinmeyen/);
  });
});
