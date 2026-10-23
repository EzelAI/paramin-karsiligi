import {
  MAIN_FIELD,
  PriceCalculator,
  seriesKey,
  SOURCES,
  toSeries,
  type AssetId,
  type InvestmentAnalysis,
  type IsoDate,
  type Payment,
  type PriceSnapshot,
  type PriceStatus,
  type Settings,
} from '@paramin-karsiligi/shared';
import type { PriceProvider } from '../providers/types';
import type { PriceRepository } from '../repositories/prices';

/** Aynı anda sağlayıcılara gönderilecek en fazla istek */
const CONCURRENCY = 4;

export class PriceService {
  private calc: PriceCalculator;
  private refreshing: Promise<void> | null = null;

  constructor(
    private repo: PriceRepository,
    private providers: Record<string, PriceProvider>,
    getSettings: () => Settings,
    private opts: { refreshMs: number; historyStart: IsoDate; log?: (msg: string) => void },
  ) {
    this.calc = new PriceCalculator(
      { series: (key) => toSeries(repo.series(key)), lastFetchedAt: (key) => repo.lastFetchedAt(key) },
      getSettings,
    );
  }

  /** Ayarlar değişince türetilmiş seriler yeniden hesaplanır */
  invalidate() {
    this.calc.invalidate();
  }

  /** Önbellek eskiyse sağlayıcılardan günceller; aynı anda tek güncelleme çalışır */
  async ensureFresh(force = false): Promise<void> {
    const stale = Object.keys(SOURCES).filter((key) => force || this.isStale(key));
    if (stale.length === 0) return;
    this.refreshing ??= this.refresh(stale).finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private isStale(key: string): boolean {
    const fetched = this.repo.lastFetchedAt(key);
    return !fetched || Date.now() - Date.parse(fetched) > this.opts.refreshMs;
  }

  private async refresh(keys: string[]) {
    const errors: string[] = [];
    await runLimited(keys, CONCURRENCY, async (key) => {
      try {
        await this.refreshSource(key);
      } catch (err) {
        errors.push(`${key}: ${(err as Error).message}`);
      }
    });
    this.calc.invalidate();
    // Önbellekte hiç verisi olmayan kaynak varsa hata ver; eski veri varsa onunla devam et
    if (errors.length) {
      this.opts.log?.(`Fiyat güncelleme hatası: ${errors.join('; ')}`);
      if (keys.some((k) => !this.repo.lastDate(k))) throw new Error(`Bazı fiyatlar alınamadı: ${errors.join('; ')}`);
    }
  }

  private async refreshSource(key: string) {
    const spec = SOURCES[key]!;
    const provider = this.providers[spec.provider];
    if (!provider) throw new Error(`Sağlayıcı yok: ${spec.provider}`);

    const last = this.repo.lastDate(key);
    // Son birkaç günü yeniden çek (gün içi fiyatlar kesinleşsin)
    const from = last && !spec.fullRefresh ? shiftDays(last, -7) : this.opts.historyStart;
    const fetched = await provider.fetch(spec.symbol, from);
    if (!fetched[MAIN_FIELD]?.length) throw new Error('boş veri');

    this.repo.saveAll(
      provider.name,
      Object.entries(fetched).map(([field, points]) => ({ key: seriesKey(key, field), points })),
      spec.fullRefresh ? 'replace' : 'upsert',
    );
    this.opts.log?.(`${key}: ${fetched[MAIN_FIELD].length} değer güncellendi`);
  }

  /** Tarihteki ya da öncesindeki en yakın günün fiyatı */
  get lookup() {
    return this.calc.lookup;
  }

  warnings(assetId: AssetId, from: IsoDate, to: IsoDate): string[] {
    return this.calc.warnings(assetId, from, to);
  }

  monthly(assetId: AssetId, from?: IsoDate) {
    return this.calc.monthly(assetId, from);
  }

  status(): PriceStatus[] {
    return this.calc.status();
  }

  analyze(payments: readonly Payment[]): InvestmentAnalysis {
    return this.calc.analyze(payments);
  }

  /** Tüm ham kaynak serileri (GitHub Pages sürümü için) */
  snapshot(): PriceSnapshot {
    const keys = Object.keys(SOURCES).flatMap((key) => [key, seriesKey(key, 'dividends')]);
    const series: PriceSnapshot['series'] = {};
    for (const key of keys) {
      const points = this.repo.series(key);
      if (points.length) series[key] = { ...toSeries(points), fetchedAt: this.repo.lastFetchedAt(key) };
    }
    return { generatedAt: new Date().toISOString(), series };
  }
}

function shiftDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function runLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item);
    }),
  );
}
