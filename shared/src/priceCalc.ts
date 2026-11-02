import { analyzePayments, type InvestmentAnalysis, type PriceLookup } from './analysis';
import { ASSET_IDS, ASSETS, DEFLATOR_ASSET, type AssetId } from './assets';
import { ASSET_RECIPES, sourcesOf, TR_JUMP_THRESHOLD_PCT, type AssetRecipe } from './assetPricing';
import { toIsoDate } from './dates';
import type { Settings } from './settings';
import {
  compoundIndex,
  cpiIndex,
  detectJumps,
  lastIndexAtOrBefore,
  productSeries,
  totalReturnSeries,
  type Series,
} from './seriesMath';
import type { IsoDate, Payment, PriceStatus } from './types';

/** Fiyat geçmişinin başlangıcı */
export const PRICE_HISTORY_START: IsoDate = '2005-01-01';

/** Ana değer alanı; diğer alanlar (ör. dividends) ayrı seri olarak saklanır */
export const MAIN_FIELD = 'value';

/** Kaynağın bir alanının saklandığı seri anahtarı */
export const seriesKey = (source: string, field: string) => (field === MAIN_FIELD ? source : `${source}:${field}`);

/** Ham kaynak serilerinin dışa aktarılmış hâli (GitHub Pages sürümü bu dosyayı okur) */
export interface PriceSnapshot {
  generatedAt: string;
  series: Record<string, Series & { fetchedAt: string | null }>;
}

/** TCMB Piyasa Katılımcıları Anketi'nin son 12 ay sonrası beklentileri (EVDS anahtarı yoksa null) */
export interface Expectations {
  /** 12 ay sonrası dolar/TL; month anketin ayı (YYYY-AA) */
  usdTry12m: { value: number; month: string } | null;
  /** 12 ay sonrası yıllık TÜFE (%) */
  cpi12m: { value: number; month: string } | null;
}

/** Ham seriler (veritabanı ya da anlık görüntü) */
export interface RawPriceSource {
  series(key: string): Series;
  lastFetchedAt(key: string): string | null;
}

/** Ham kaynak serilerinden ayarlara göre varlıkların TL fiyat serilerini üretir */
export class PriceCalculator {
  private cache = new Map<AssetId, Series>();
  /** Önbelleğin kurulduğu gün; faiz/TÜFE endeksi her gün uzadığı için gün değişince temizlenir */
  private cacheDay = '';

  constructor(
    private source: RawPriceSource,
    private getSettings: () => Settings,
  ) {}

  /** Ham veri ya da ayarlar değişince türetilmiş seriler yeniden hesaplanır */
  invalidate() {
    this.cache.clear();
  }

  private series(assetId: AssetId): Series {
    const today = toIsoDate(new Date());
    if (this.cacheDay !== today) {
      this.cache.clear();
      this.cacheDay = today;
    }
    let s = this.cache.get(assetId);
    if (!s) {
      s = this.build(ASSET_RECIPES[assetId], today);
      this.cache.set(assetId, s);
    }
    return s;
  }

  private raw(key: string): Series {
    return this.source.series(key);
  }

  /**
   * Faiz ve TÜFE için kullanılacak ham seri: EVDS'den gelen market serisi varsa o (bankaların gerçek mevduat faizi,
   * endeksten hesaplanan TÜFE), yoksa web sayfasından okunan source.
   */
  private rateSource(recipe: { source: string; market?: string }): { series: Series; fromMarket: boolean } {
    const market = recipe.market ? this.raw(recipe.market) : null;
    return market && market.dates.length > 0
      ? { series: market, fromMarket: true }
      : { series: this.raw(recipe.source), fromMarket: false };
  }

  private build(recipe: AssetRecipe, today: IsoDate): Series {
    const settings = this.getSettings();
    switch (recipe.type) {
      case 'product': {
        const perDate = recipe.perDate;
        return productSeries(
          recipe.sources.map((k) => this.raw(k)),
          recipe.factor,
          perDate && ((d) => perDate(d, settings)),
        );
      }
      case 'deposit':
        return compoundIndex(this.rateSource(recipe).series, PRICE_HISTORY_START, today, (rate) =>
          Math.max(0, rate + settings.depositSpreadPts) * (1 - settings.depositWithholdingPct / 100),
        );
      case 'cpi':
        return cpiIndex(this.rateSource(recipe).series, today);
      case 'stock': {
        const tr = totalReturnSeries(
          this.raw(recipe.source),
          this.raw(seriesKey(recipe.source, 'dividends')),
          settings.dividendWithholdingPct[recipe.market],
        );
        return recipe.fx ? productSeries([tr, this.raw(recipe.fx)], 1) : tr;
      }
    }
  }

  /** Tarihteki ya da öncesindeki en yakın günün fiyatı */
  lookup: PriceLookup = (assetId, date) => {
    const { dates, values } = this.series(assetId);
    const idx = lastIndexAtOrBefore(dates, date);
    return idx >= 0 ? values[idx] : undefined;
  };

  /** Varlığın verisinde [from, to] aralığındaki şüpheli noktalar (kullanıcıya gösterilir) */
  warnings(assetId: AssetId, from: IsoDate, to: IsoDate): string[] {
    const recipe = ASSET_RECIPES[assetId];
    if (recipe.type !== 'stock' || recipe.market !== 'tr') return [];
    return detectJumps(this.raw(recipe.source), TR_JUMP_THRESHOLD_PCT)
      .filter((j) => j.date >= from && j.date <= to)
      .map(
      (j) => `${j.date} tarihinde tek günde %${j.changePct.toFixed(0)} değişim (düzeltilmemiş bedelsiz/bölünme olabilir)`,
    );
  }

  /** Aylık örneklenmiş seri (her ayın son günü) */
  monthly(assetId: AssetId, from?: IsoDate): { date: IsoDate; price: number }[] {
    const { dates, values } = this.series(assetId);
    const out: { date: IsoDate; price: number }[] = [];
    for (let i = 0; i < dates.length; i++) {
      const d = dates[i]!;
      if (from && d < from) continue;
      if (i === dates.length - 1 || dates[i + 1]!.slice(0, 7) !== d.slice(0, 7)) out.push({ date: d, price: values[i]! });
    }
    return out;
  }

  status(): PriceStatus[] {
    return ASSET_IDS.map((assetId) => {
      const recipe = ASSET_RECIPES[assetId];
      const { dates, values } = this.series(assetId);
      const fetched = sourcesOf(recipe)
        .map((s) => this.source.lastFetchedAt(s))
        .filter((v): v is string => v !== null);
      const rate = recipe.type === 'deposit' || recipe.type === 'cpi' ? this.rateSource(recipe) : null;
      const sourceSeries = rate?.series ?? null;
      return {
        assetId,
        firstDate: dates[0] ?? null,
        lastDate: dates.at(-1) ?? null,
        lastPrice: values.at(-1) ?? null,
        lastFetchedAt: fetched.sort()[0] ?? null,
        ratePct: recipe.type === 'deposit' ? (sourceSeries!.values.at(-1) ?? null) : null,
        rateKind: recipe.type === 'deposit' ? (rate!.fromMarket ? 'deposit' : 'policy') : null,
        official: this.officialRate(assetId),
        // Faizde son karar tarihi, TÜFE'de son açıklanan ay
        sourceLastDate: sourceSeries?.dates.at(-1) ?? null,
      };
    });
  }

  /** TCMB resmî kuru ve varlığın fiyatıyla farkı (yalnızca USD ve EUR; veri yoksa null) */
  private officialRate(assetId: AssetId): PriceStatus['official'] {
    const key = assetId === 'USD' ? 'EVDS_USD' : assetId === 'EUR' ? 'EVDS_EUR' : null;
    if (!key) return null;
    const official = this.raw(key);
    const date = official.dates.at(-1);
    const price = official.values.at(-1);
    const ours = date ? this.lookup(assetId, date) : undefined;
    if (date === undefined || price === undefined || ours === undefined || !(price > 0)) return null;
    return { price, date, deviationPct: (ours / price - 1) * 100 };
  }

  /** Piyasa Katılımcıları Anketi'nin en son beklentileri */
  expectations(): Expectations {
    const last = (key: string) => {
      const s = this.raw(key);
      const date = s.dates.at(-1);
      const value = s.values.at(-1);
      return date !== undefined && value !== undefined ? { value, month: date.slice(0, 7) } : null;
    };
    return { usdTry12m: last('EVDS_PKA_USD12'), cpi12m: last('EVDS_PKA_CPI12') };
  }

  /** Bir yatırımın ödemelerini tüm varlıklarla karşılaştırır */
  analyze(payments: readonly Payment[]): InvestmentAnalysis {
    const { tradingCostPct } = this.getSettings();
    const analysis = analyzePayments(payments, {
      assets: ASSET_IDS,
      lookup: this.lookup,
      asOf: toIsoDate(new Date()),
      costRate: (id) => (tradingCostPct[ASSETS[id].group] ?? 0) / 100,
      deflator: DEFLATOR_ASSET,
    });
    // Yalnızca yatırım dönemine düşen veri sorunları sonucu etkiler
    const { firstDate, asOf } = analysis;
    const warnings = firstDate
      ? Object.fromEntries(
          ASSET_IDS.map((id) => [id, this.warnings(id, firstDate, asOf)] as const).filter(([, w]) => w.length > 0),
        )
      : {};
    return { ...analysis, warnings };
  }
}
