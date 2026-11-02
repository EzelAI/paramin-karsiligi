/**
 * Alacaklarım sayfasındaki "peşin parayı altında/dolarda tutsaydım" hesabının tahmin varsayımları.
 *
 * Tahminler sık değişir; tek bir kuruma güvenmek yerine yayımlanmış tahminlerin ortalaması kullanılır.
 * Güncellerken listeyi ve FORECASTS_COMPILED_AT tarihini değiştirmeniz yeterli; ekrandaki metin buradan üretilir.
 * Kullanıcı Hesaplama varsayımları ekranından kendi değerini girebilir (Settings.forecast).
 */
import type { Expectations } from './priceCalc';

export interface ForecastSource {
  /** Kurum ve tahminin türü */
  source: string;
  value: number;
}

/** Tahminlerin derlendiği tarih */
export const FORECASTS_COMPILED_AT = '2026-10-24';

/** Tahminler bu kadar günden eskiyse ekranda güncel olmayabileceği uyarısı gösterilir */
export const FORECAST_STALE_DAYS = 90;

/** Tahminlerin derlendiği tarihten bu yana geçen gün */
export function forecastAgeDays(today: Date = new Date()): number {
  return Math.floor((today.getTime() - Date.parse(FORECASTS_COMPILED_AT)) / 86_400_000);
}

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

/**
 * 12 ay sonrası dolar/TL beklentisi: EVDS anahtarı yokken kullanılan, elle yazılmış son bilinen değer. Anahtar varsa
 * anketin en güncel değeri otomatik gelir (usdTryReference).
 */
export const USDTRY_FORECAST: ForecastSource = {
  source: 'TCMB Piyasa Katılımcıları Anketi (Ekim 2026), 12 ay sonrası',
  value: 59.26,
};

const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** "2026-10" → "Ekim 2026" */
export function monthName(month: string): string {
  const [y, m] = month.split('-');
  return `${MONTH_NAMES[Number(m) - 1] ?? m} ${y}`;
}

/** Dolar/TL için başvurulacak beklenti: anketten gelen güncel değer varsa o (live), yoksa elle yazılmış son değer */
export function usdTryReference(expectations: Pick<Expectations, 'usdTry12m'> | null | undefined): ForecastSource & { live: boolean } {
  const e = expectations?.usdTry12m;
  return e
    ? { value: e.value, source: `TCMB Piyasa Katılımcıları Anketi (${monthName(e.month)}), 12 ay sonrası`, live: true }
    : { ...USDTRY_FORECAST, live: false };
}

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
