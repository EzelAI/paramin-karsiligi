import type { PricePoint } from '@paramin-karsiligi/shared';

export { MAIN_FIELD, type PricePoint } from '@paramin-karsiligi/shared';

/** Kaynaktan tek istekte gelen, alan adına göre seriler (ör. { value: kapanışlar, dividends: temettüler }) */
export type FetchedSeries = Record<string, PricePoint[]>;

/**
 * Fiyat verisi kaynağı. Yeni bir kaynak (ör. TCMB EVDS) eklemek için
 * bu arayüzü uygulayıp container.ts içinde kaydedin, shared/src/assetPricing.ts içinde kullanın.
 */
export interface PriceProvider {
  readonly name: string;
  /** from (dahil) tarihinden bugüne değerler; en az MAIN_FIELD alanı dolu olmalı */
  fetch(symbol: string, from: string): Promise<FetchedSeries>;
}
