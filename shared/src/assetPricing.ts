import type { AssetId } from './assets';
import type { Settings } from './settings';

const TROY_OUNCE_GRAMS = 31.1034768;

/** Sağlayıcıdan çekilen ham veri kaynağı; alanları price_points tablosunda "anahtar" ve "anahtar:alan" olarak saklanır */
export interface SourceSpec {
  provider: 'yahoo' | 'tcmb' | 'tcmb-cpi' | 'evds';
  symbol: string;
  /**
   * Yoksa ya da alınamazsa hata sayılmaz: bu kaynağa dayanan hesaplar bir yedeğe döner (ör. EVDS anahtarı yokken
   * politika faizi). Sağlayıcı hiç kurulu değilse (anahtar yok) kaynak atlanır.
   */
  optional?: boolean;
  /**
   * Her güncellemede tüm geçmiş yeniden çekilir. Bölünme olan hisselerde gerekli
   * (geçmiş fiyatlar geriye dönük düzeltilir) ve tabloyu bütün olarak veren kaynaklarda.
   */
  fullRefresh?: boolean;
}

export const SOURCES: Record<string, SourceSpec> = {
  GLD: { provider: 'yahoo', symbol: 'GLD' },
  'USDTRY=X': { provider: 'yahoo', symbol: 'USDTRY=X' },
  'EURTRY=X': { provider: 'yahoo', symbol: 'EURTRY=X' },
  TCMB_POLICY: { provider: 'tcmb', symbol: 'POLICY', fullRefresh: true },
  TCMB_CPI: { provider: 'tcmb-cpi', symbol: 'CPI', fullRefresh: true },
  // TCMB EVDS (EVDS_API_KEY gerekir). Anahtar yoksa atlanır; yukarıdaki web sayfası kaynaklarına dönülür.
  /** Bankaların yeni açılan TL mevduatına verdiği faiz (yıllık %, haftalık) */
  EVDS_DEPOSIT: { provider: 'evds', symbol: 'DEPOSIT_TRY', fullRefresh: true, optional: true },
  /** TÜFE aylık % değişimleri (EVDS endeksinden) */
  EVDS_CPI: { provider: 'evds', symbol: 'CPI', fullRefresh: true, optional: true },
  /** Resmî döviz kuru (alış), Yahoo verisinin çapraz kontrolü için */
  EVDS_USD: { provider: 'evds', symbol: 'USD', optional: true },
  EVDS_EUR: { provider: 'evds', symbol: 'EUR', optional: true },
  /** Piyasa Katılımcıları Anketi: 12 ay sonrası dolar/TL ve TÜFE beklentisi (aylık) */
  EVDS_PKA_USD12: { provider: 'evds', symbol: 'PKA_USD12', fullRefresh: true, optional: true },
  EVDS_PKA_CPI12: { provider: 'evds', symbol: 'PKA_CPI12', fullRefresh: true, optional: true },
};

/**
 * Bir varlığın TL birim fiyatının nasıl hesaplanacağı:
 * - product: kaynakların çarpımı × katsayı (perDate ile tarihe/ayara bağlı ek katsayı)
 * - deposit: günlük bileşik mevduat endeksi (ayarlardaki fark ve stopajla). Faiz olarak market kaynağı (bankaların
 *   gerçek mevduat faizi) varsa o, yoksa source (politika faizi) kullanılır.
 * - cpi: TÜFE aylık değişimlerinden fiyat endeksi; market varsa o, yoksa source
 * - stock: net temettü yeniden yatırılmış toplam getiri (fx verilirse TL'ye çevrilir)
 */
export type AssetRecipe =
  | { type: 'product'; sources: string[]; factor: number; perDate?: (date: string, s: Settings) => number }
  | { type: 'deposit'; source: string; market?: string }
  | { type: 'cpi'; source: string; market?: string }
  | { type: 'stock'; source: string; market: 'us' | 'tr'; fx?: string };

/**
 * GLD fonunun pay başına altın miktarı: 18.11.2004'te 0,1 ons, yıllık %0,40 yönetim ücretiyle azalır.
 * GLD fiyatı ÷ bu miktar ≈ spot ons fiyatı (vadeli kontratın taşıma primi ve vade geçişi sıçramaları olmadan).
 */
export function gldOuncesPerShare(date: string): number {
  const years = (Date.parse(date) - Date.parse('2004-11-18')) / (365.25 * 86_400_000);
  return 0.1 * Math.pow(1 - 0.004, years);
}

function stock(symbol: string, market: 'us' | 'tr'): AssetRecipe {
  const key = market === 'tr' ? `${symbol}.IS` : symbol;
  // Bölünmelerde geçmiş fiyatlar değiştiği için tamamı yeniden çekilir
  SOURCES[key] = { provider: 'yahoo', symbol: key, fullRefresh: true };
  return market === 'us' ? { type: 'stock', source: key, market, fx: 'USDTRY=X' } : { type: 'stock', source: key, market };
}

export const ASSET_RECIPES: Record<AssetId, AssetRecipe> = {
  GRAM_GOLD: {
    type: 'product',
    sources: ['GLD', 'USDTRY=X'],
    factor: 1 / TROY_OUNCE_GRAMS,
    perDate: (date, s) => (1 + s.goldPremiumPct / 100) / gldOuncesPerShare(date),
  },
  USD: { type: 'product', sources: ['USDTRY=X'], factor: 1 },
  EUR: { type: 'product', sources: ['EURTRY=X'], factor: 1 },
  FAIZ: { type: 'deposit', source: 'TCMB_POLICY', market: 'EVDS_DEPOSIT' },
  TUFE: { type: 'cpi', source: 'TCMB_CPI', market: 'EVDS_CPI' },

  SPY: stock('SPY', 'us'),
  QQQ: stock('QQQ', 'us'),
  AAPL: stock('AAPL', 'us'),
  MSFT: stock('MSFT', 'us'),
  NVDA: stock('NVDA', 'us'),
  AMZN: stock('AMZN', 'us'),
  GOOGL: stock('GOOGL', 'us'),
  META: stock('META', 'us'),
  TSLA: stock('TSLA', 'us'),

  XU100: stock('XU100', 'tr'),
  THYAO: stock('THYAO', 'tr'),
  ASELS: stock('ASELS', 'tr'),
  BIMAS: stock('BIMAS', 'tr'),
  KCHOL: stock('KCHOL', 'tr'),
  TUPRS: stock('TUPRS', 'tr'),
  GARAN: stock('GARAN', 'tr'),
  AKBNK: stock('AKBNK', 'tr'),
  EREGL: stock('EREGL', 'tr'),
  SISE: stock('SISE', 'tr'),
  FROTO: stock('FROTO', 'tr'),
};

/** BIST'te günlük fiyat limiti ±%10–20 olduğundan bunu aşan değişim veri hatası şüphesidir */
export const TR_JUMP_THRESHOLD_PCT = 25;

export function sourcesOf(recipe: AssetRecipe): string[] {
  if (recipe.type === 'product') return recipe.sources;
  if (recipe.type === 'stock') return recipe.fx ? [recipe.source, recipe.fx] : [recipe.source];
  return recipe.market ? [recipe.source, recipe.market] : [recipe.source];
}
