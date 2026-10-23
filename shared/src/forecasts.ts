/**
 * Alacaklarım sayfasındaki "peşin parayı altında/dolarda tutsaydım" hesabının tahmin varsayımları.
 *
 * Tahminler sık değişir; tek bir kuruma güvenmek yerine yayımlanmış tahminlerin ortalaması kullanılır.
 * Güncellerken listeyi ve FORECASTS_COMPILED_AT tarihini değiştirmeniz yeterli; ekrandaki metin buradan üretilir.
 * Kullanıcı Hesaplama varsayımları ekranından kendi değerini girebilir (Settings.forecast).
 */

export interface ForecastSource {
  /** Kurum ve tahminin türü */
  source: string;
  value: number;
}

/** Tahminlerin derlendiği tarih */
export const FORECASTS_COMPILED_AT = '2026-10-24';

/** Tahminlerin ulaştığı ufuk (ay); daha uzun taksitlerde aynı yıllık artış sürdürülür */
export const FORECAST_HORIZON_MONTHS = 12;

/**
 * Yaklaşık 12 ay sonrası için ons altın tahminleri ($/ons). J.P. Morgan'ın 2027 rakamı kaynaklar arasında
 * çeliştiği için alınmadı.
 */
export const GOLD_FORECASTS: ForecastSource[] = [
  { source: 'Reuters anketi (29 analist), 2027 ortalaması', value: 4610 },
  { source: 'Bank of America, 2027 ortalaması', value: 4813 },
  { source: 'Goldman Sachs, 2027 sonu', value: 5400 },
  { source: 'UBS, Eylül 2027', value: 5400 },
];

/** 12 ay sonrası dolar/TL beklentisi */
export const USDTRY_FORECAST: ForecastSource = {
  source: 'TCMB Piyasa Katılımcıları Anketi (Ekim 2026), 12 ay sonrası',
  value: 59.26,
};

export const average = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Ortalama ons altın tahmini ($) */
export const GOLD_FORECAST_AVERAGE = average(GOLD_FORECASTS.map((f) => f.value));

/** Bugünkü değerden ufuktaki hedefe sabit büyüme varsayımıyla aylık oran */
export function monthlyGrowth(today: number, target: number, horizonMonths = FORECAST_HORIZON_MONTHS): number {
  return Math.pow(target / today, 1 / horizonMonths) - 1;
}

/**
 * Altının mevduatla başa baş olması için onsun ufukta ulaşması gereken fiyat ($).
 * Gram altın TL getirisi ≈ (1 + ons artışı) × (1 + kur artışı); bunu mevduat getirisine eşitler.
 */
export function goldBreakEvenOz(
  todayOz: number,
  depositMonthly: number,
  usdTryMonthly: number,
  horizonMonths = FORECAST_HORIZON_MONTHS,
): number {
  return todayOz * Math.pow((1 + depositMonthly) / (1 + usdTryMonthly), horizonMonths);
}
