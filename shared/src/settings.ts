import type { AssetGroup } from './assets';

/**
 * Hesaplama varsayımları. Hepsi yüzde (%) ya da puan cinsindendir ve arayüzden değiştirilebilir.
 */
export interface Settings {
  /**
   * Varlık grubuna göre alım-satım maliyeti (makas + komisyon, gidiş-dönüş %).
   * Her alımda tutarın bu kadarı kesilmiş sayılır.
   */
  tradingCostPct: Record<AssetGroup, number>;
  /** Yerel piyasa (kapalıçarşı/banka) altın fiyatının uluslararası pariteye primi (%) */
  goldPremiumPct: number;
  /** Mevduat faizi stopajı (%) */
  depositWithholdingPct: number;
  /** Mevduat faizinin politika faizinden farkı (puan; negatif olabilir) */
  depositSpreadPts: number;
  /** Temettü stopajı (%) */
  dividendWithholdingPct: { us: number; tr: number };
}

export const DEFAULT_SETTINGS: Settings = {
  tradingCostPct: { gold: 1, fx: 1, interest: 0, inflation: 0, us_stock: 1, tr_stock: 0.2 },
  goldPremiumPct: 0,
  depositWithholdingPct: 15,
  depositSpreadPts: 0,
  dividendWithholdingPct: { us: 20, tr: 15 },
};

/** Eksik alanları varsayılanlarla tamamlar (eski kayıtlar ya da yeni eklenen ayarlar için) */
export function withDefaults(partial: Partial<Settings> | null | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    tradingCostPct: { ...DEFAULT_SETTINGS.tradingCostPct, ...partial?.tradingCostPct },
    dividendWithholdingPct: { ...DEFAULT_SETTINGS.dividendWithholdingPct, ...partial?.dividendWithholdingPct },
  };
}
