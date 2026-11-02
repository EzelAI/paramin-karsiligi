import { describe, expect, it } from 'vitest';
import { EVDS_ROW_LIMIT, EvdsClient, EvdsError, evdsField, parseEvdsDate, parseEvdsItems, toEvdsDate } from './evds';

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json;charset=UTF-8' }, ...init });

describe('EVDS biçimleri', () => {
  it('tarihleri çevirir', () => {
    expect(toEvdsDate('2026-11-02')).toBe('02-11-2026');
    expect(parseEvdsDate('02-11-2026')).toBe('2026-11-02');
    expect(parseEvdsDate('2026-1')).toBe('2026-01-01');
    expect(parseEvdsDate('2026-11')).toBe('2026-11-01');
    expect(parseEvdsDate('2026')).toBe('2026-01-01');
    expect(parseEvdsDate('2026-Q1')).toBeNull();
    expect(parseEvdsDate(undefined)).toBeNull();
  });

  it('alan adı seri kodundaki noktaları alt çizgi yapar', () => {
    expect(evdsField('TP.DK.USD.A.YTL')).toBe('TP_DK_USD_A_YTL');
  });

  it('satırlardan nokta üretir: boş ve sayı olmayan değerler atlanır, sıralanır', () => {
    const items = [
      { Tarih: '03-11-2026', TP_X: '51,5' },
      { Tarih: '02-11-2026', TP_X: 50 },
      { Tarih: '01-11-2026', TP_X: null },
      { Tarih: '31-10-2026', TP_X: '' },
      { Tarih: '30-10-2026', TP_X: '-' },
      { Tarih: 'bozuk', TP_X: '1' },
    ];
    expect(parseEvdsItems(items, 'TP.X')).toEqual([
      { date: '2026-11-02', close: 50 },
      { date: '2026-11-03', close: 51.5 },
    ]);
  });
});

describe('EvdsClient', () => {
  it('anahtarı başlıkta gönderir, adreste göndermez', async () => {
    let seen: { url: string; headers: Headers; redirect?: RequestRedirect } | undefined;
    const client = new EvdsClient('gizli-anahtar', async (url, init) => {
      seen = { url: String(url), headers: new Headers(init?.headers), redirect: init?.redirect };
      return json({ items: [{ Tarih: '02-11-2026', TP_DK_USD_A_YTL: '50.1' }] });
    });
    const points = await client.points('TP.DK.USD.A.YTL', '2026-11-01', '2026-11-02');
    expect(points).toEqual([{ date: '2026-11-02', close: 50.1 }]);
    expect(seen!.url).toBe('https://evds3.tcmb.gov.tr/igmevdsms-dis/series=TP.DK.USD.A.YTL&startDate=01-11-2026&endDate=02-11-2026&type=json');
    expect(seen!.url).not.toContain('gizli-anahtar');
    expect(seen!.headers.get('key')).toBe('gizli-anahtar');
    // Yönlendirmeyle anahtar başka adrese taşınmasın
    expect(seen!.redirect).toBe('manual');
  });

  it('anahtar reddedilince, yönlendirmede ve JSON olmayan yanıtta anlaşılır hata verir', async () => {
    const make = (res: () => Response) => new EvdsClient('k', async () => res());
    await expect(make(() => json({ status: '403' }, { status: 403 })).series(['A'], '2026-01-01', '2026-01-02')).rejects.toThrow(/anahtarı reddedildi/);
    await expect(make(() => new Response(null, { status: 302, headers: { location: 'https://x.test/' } })).series(['A'], '2026-01-01', '2026-01-02')).rejects.toThrow(/yönlendirme/);
    await expect(
      make(() => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } })).series(['A'], '2026-01-01', '2026-01-02'),
    ).rejects.toThrow(EvdsError);
    await expect(make(() => json({ foo: 1 })).series(['A'], '2026-01-01', '2026-01-02')).rejects.toThrow(/items/);
    expect(() => new EvdsClient('  ')).toThrow(/boş/);
  });

  it('1000 satır sınırında kesilen yanıtı aralığı bölerek eksiksiz tamamlar', async () => {
    // Gerçek davranışı taklit eder: istenen aralıktaki günlerin yalnızca SON 1000 satırı döner
    const DAY = 86_400_000;
    const calls: string[] = [];
    const client = new EvdsClient('k', async (url) => {
      const q = String(url);
      const iso = (m: string) => m.split('-').reverse().join('-');
      const from = Date.parse(iso(/startDate=([^&]+)/.exec(q)![1]!));
      const to = Date.parse(iso(/endDate=([^&]+)/.exec(q)![1]!));
      calls.push(q);
      const rows: Record<string, unknown>[] = [];
      for (let t = from; t <= to; t += DAY) {
        const d = new Date(t);
        rows.push({ Tarih: `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`, TP_X: String(t / DAY) });
      }
      return new Response(JSON.stringify({ items: rows.slice(-EVDS_ROW_LIMIT) }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const items = await client.series(['TP.X'], '2005-01-01', '2026-11-03');
    const days = Math.round((Date.parse('2026-11-03') - Date.parse('2005-01-01')) / DAY) + 1;
    expect(items).toHaveLength(days);
    expect(calls.length).toBeGreaterThan(1);
    // Hiçbir gün atlanmadı ve tekrarlanmadı
    const dates = parseEvdsItems(items, 'TP.X').map((p) => p.date);
    expect(new Set(dates).size).toBe(days);
    expect(dates[0]).toBe('2005-01-01');
    expect(dates.at(-1)).toBe('2026-11-03');
  });

  it('kısa aralıkta tek istek yapar', async () => {
    let n = 0;
    const client = new EvdsClient('k', async () => {
      n++;
      return new Response(JSON.stringify({ items: [{ Tarih: '02-11-2026', TP_X: '1' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    await client.series(['TP.X'], '2026-11-01', '2026-11-03');
    expect(n).toBe(1);
  });
});
