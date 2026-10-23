/**
 * Karşılaştırma yapılabilen varlıklar. Yeni bir varlık eklemek için buraya
 * tanım, sunucuda da server/src/services/assetPricing.ts içine fiyat tarifi ekleyin.
 */
export const ASSET_GROUPS = {
  gold: 'Altın',
  fx: 'Döviz',
  interest: 'Faiz',
  inflation: 'Enflasyon',
  us_stock: 'ABD Borsası',
  tr_stock: 'Borsa İstanbul',
} as const;

export type AssetGroup = keyof typeof ASSET_GROUPS;

export interface AssetDef {
  id: string;
  label: string;
  shortLabel: string;
  group: AssetGroup;
  /**
   * unit: birim fiyatı olan varlık (gr, $, adet)
   * index: birim anlamsız, yalnızca büyüme önemli (ör. faiz)
   */
  kind: 'unit' | 'index';
  /** Miktar gösterimi: gr, $, € ya da adet */
  unit: string;
  decimals: number;
  color: string;
  /** Hesaplama varsayımı ya da kısıt hakkında kısa not */
  note?: string;
}

const def = <T extends Record<string, Omit<AssetDef, 'id'>>>(defs: T) =>
  Object.fromEntries(Object.entries(defs).map(([id, d]) => [id, { id, ...d }])) as {
    [K in keyof T]: T[K] & { id: K };
  };

const stock = (label: string, shortLabel: string, group: 'us_stock' | 'tr_stock', color: string) =>
  ({ label, shortLabel, group, kind: 'unit', unit: 'adet', decimals: 2, color }) as const;

export const ASSETS = def({
  GRAM_GOLD: {
    label: 'Gram Altın (24 ayar)',
    shortLabel: 'Altın',
    group: 'gold',
    kind: 'unit',
    unit: 'gr',
    decimals: 2,
    color: '#d4a017',
    note: 'Spot ons fiyatından (GLD fonundan türetilmiş) parite + ayarlardaki yerel prim',
  },
  USD: { label: 'Amerikan Doları', shortLabel: 'USD', group: 'fx', kind: 'unit', unit: '$', decimals: 2, color: '#2e7d32' },
  EUR: { label: 'Euro', shortLabel: 'EUR', group: 'fx', kind: 'unit', unit: '€', decimals: 2, color: '#1565c0' },
  FAIZ: {
    label: 'Mevduat faizi',
    shortLabel: 'Faiz',
    group: 'interest',
    kind: 'index',
    unit: '',
    decimals: 2,
    color: '#8e24aa',
    note: 'TCMB politika faizi ± ayarlardaki fark, stopaj düşülmüş, günlük bileşik',
  },
  TUFE: {
    label: 'Enflasyon (TÜFE)',
    shortLabel: 'Enflasyon',
    group: 'inflation',
    kind: 'index',
    unit: '',
    decimals: 2,
    color: '#757575',
    note: 'Paranın yalnızca değerini koruması: ödemelerin bugünkü TL karşılığı',
  },

  SPY: stock('S&P 500 (SPY)', 'S&P 500', 'us_stock', '#c62828'),
  QQQ: stock('Nasdaq 100 (QQQ)', 'Nasdaq 100', 'us_stock', '#ef6c00'),
  AAPL: stock('Apple', 'Apple', 'us_stock', '#546e7a'),
  MSFT: stock('Microsoft', 'Microsoft', 'us_stock', '#0288d1'),
  NVDA: stock('NVIDIA', 'NVIDIA', 'us_stock', '#76b900'),
  AMZN: stock('Amazon', 'Amazon', 'us_stock', '#ff9900'),
  GOOGL: stock('Alphabet (Google)', 'Google', 'us_stock', '#4285f4'),
  META: stock('Meta', 'Meta', 'us_stock', '#0866ff'),
  TSLA: stock('Tesla', 'Tesla', 'us_stock', '#cc0000'),

  XU100: {
    ...stock('BIST 100 Endeksi', 'BIST 100', 'tr_stock', '#00897b'),
    note: 'Fiyat endeksi: temettü dahil değil, doğrudan alınamaz (endeks fonuna yaklaşık karşılık)',
  },
  THYAO: stock('Türk Hava Yolları', 'THYAO', 'tr_stock', '#c8102e'),
  ASELS: stock('Aselsan', 'ASELS', 'tr_stock', '#1a237e'),
  BIMAS: stock('BİM', 'BIMAS', 'tr_stock', '#d81b60'),
  KCHOL: stock('Koç Holding', 'KCHOL', 'tr_stock', '#3949ab'),
  TUPRS: stock('Tüpraş', 'TUPRS', 'tr_stock', '#f4511e'),
  GARAN: stock('Garanti BBVA', 'GARAN', 'tr_stock', '#00a19a'),
  AKBNK: stock('Akbank', 'AKBNK', 'tr_stock', '#e53935'),
  EREGL: stock('Ereğli Demir Çelik', 'EREGL', 'tr_stock', '#6d4c41'),
  SISE: stock('Şişecam', 'SISE', 'tr_stock', '#5e35b1'),
  FROTO: stock('Ford Otosan', 'FROTO', 'tr_stock', '#003478'),
});

export type AssetId = keyof typeof ASSETS;

export const ASSET_IDS = Object.keys(ASSETS) as AssetId[];
export const PRIMARY_ASSET: AssetId = 'GRAM_GOLD';
/** Özet kartlarında ve grafikte varsayılan olarak öne çıkanlar */
export const FEATURED_ASSETS: AssetId[] = ['FAIZ', 'USD', 'EUR', 'SPY', 'XU100'];
/** Reel (enflasyondan arındırılmış) hesaplarda kullanılan fiyat endeksi */
export const DEFLATOR_ASSET: AssetId = 'TUFE';

export function isAssetId(value: string): value is AssetId {
  return value in ASSETS;
}

export function getAsset(id: AssetId): AssetDef {
  return ASSETS[id];
}
