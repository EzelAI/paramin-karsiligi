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
        return compoundIndex(this.raw(recipe.source), PRICE_HISTORY_START, today, (policy) =>
          Math.max(0, policy + settings.depositSpreadPts) * (1 - settings.depositWithholdingPct / 100),
        );
      case 'cpi':
        return cpiIndex(this.raw(recipe.source), today);
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
      const sourceSeries = recipe.type === 'deposit' || recipe.type === 'cpi' ? this.raw(recipe.source) : null;
      return {
        assetId,
        firstDate: dates[0] ?? null,
        lastDate: dates.at(-1) ?? null,
        lastPrice: values.at(-1) ?? null,
        lastFetchedAt: fetched.sort()[0] ?? null,
        ratePct: recipe.type === 'deposit' ? (sourceSeries!.values.at(-1) ?? null) : null,
        // Faizde son karar tarihi, TÜFE'de son açıklanan ay
        sourceLastDate: sourceSeries?.dates.at(-1) ?? null,
      };
    });
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
