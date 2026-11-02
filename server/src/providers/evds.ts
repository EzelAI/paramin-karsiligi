import { MAIN_FIELD, type FetchedSeries, type PricePoint, type PriceProvider } from './types';

/**
 * TCMB EVDS (Elektronik Veri Dağıtım Sistemi) istemcisi.
 *
 * EVDS 3 adresi; anahtar adreste değil `key` başlığında gönderilir (Nisan 2024'ten beri zorunlu). Eski adres
 * (evds2.tcmb.gov.tr/service/evds) artık yönlendirme döndürür. Anahtar ücretsizdir: EVDS'ye üye olup profil sayfasından
 * alınır, `server/.env` içine `EVDS_API_KEY=...` olarak yazılır.
 */
export const EVDS_BASE = 'https://evds3.tcmb.gov.tr/igmevdsms-dis';

/** EVDS'nin tek istekte döndürdüğü en fazla satır sayısı (gözlemlendi; fazlası sessizce kesilir) */
export const EVDS_ROW_LIMIT = 1000;

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
const addDays = (date: string, days: number) => new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);

export class EvdsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'EvdsError';
  }
}

export class EvdsClient {
  constructor(
    private readonly key: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!key.trim()) throw new EvdsError('EVDS anahtarı boş');
  }

  /** Ham istek: path "series=...&type=json" gibi adresin devamıdır. JSON yanıtı döndürür. */
  async get(path: string): Promise<unknown> {
    // Yönlendirmeyi takip etme: özel başlıklar (key) başka adrese taşınabilir
    const res = await this.fetcher(`${EVDS_BASE}/${path}`, {
      headers: { key: this.key, Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      redirect: 'manual',
    });
    if (res.status >= 300 && res.status < 400) {
      throw new EvdsError(`EVDS yönlendirme döndürdü (HTTP ${res.status}); adres değişmiş olabilir`, res.status);
    }
    if (res.status === 401 || res.status === 403) {
      throw new EvdsError('EVDS anahtarı reddedildi; anahtarı ve süresini kontrol edin', res.status);
    }
    if (!res.ok) throw new EvdsError(`EVDS: HTTP ${res.status}`, res.status);
    if (!(res.headers.get('content-type') ?? '').includes('json')) {
      throw new EvdsError('EVDS JSON yerine başka bir yanıt döndürdü');
    }
    return res.json();
  }

  /**
   * Bir ya da birkaç serinin değerleri; from ve to ISO tarih (YYYY-MM-DD).
   * EVDS tek istekte en fazla EVDS_ROW_LIMIT satır döndürür ve fazlasını sessizce keser (en eski tarafı atar). Sınıra
   * ulaşan aralık ikiye bölünüp yeniden istenir, böylece uzun günlük seriler eksiksiz gelir.
   */
  async series(codes: string[], from: string, to: string, extra = ''): Promise<EvdsItem[]> {
    const path = `series=${codes.join('-')}&startDate=${toEvdsDate(from)}&endDate=${toEvdsDate(to)}&type=json${extra}`;
    const body = (await this.get(path)) as { items?: EvdsItem[] };
    if (!Array.isArray(body.items)) throw new EvdsError('EVDS yanıtında "items" yok');
    if (body.items.length < EVDS_ROW_LIMIT || from >= to) return body.items;

    const mid = addDays(from, Math.floor(daysBetween(from, to) / 2));
    const left = await this.series(codes, from, mid, extra);
    const right = await this.series(codes, addDays(mid, 1), to, extra);
    return [...left, ...right];
  }

  /** Tek serinin noktaları (boş değerler atlanır) */
  async points(code: string, from: string, to: string, extra = ''): Promise<PricePoint[]> {
    return parseEvdsItems(await this.series([code], from, to, extra), code);
  }
}

export type EvdsItem = Record<string, unknown>;

/** "2026-11-02" → "02-11-2026" */
export function toEvdsDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

/** EVDS alan adları seri kodundaki noktaları alt çizgiye çevirir: TP.DK.USD.A → TP_DK_USD_A */
export const evdsField = (code: string) => code.replace(/\./g, '_');

/**
 * EVDS tarih biçimleri: günlük "02-11-2026", aylık "2026-11", yıllık "2026". Aylık ve yıllık değerler dönemin ilk günüyle
 * tarihlenir. Tanınmayan biçim null döner.
 */
export function parseEvdsDate(text: unknown): string | null {
  const t = String(text ?? '').trim();
  let m = t.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = t.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-01`;
  m = t.match(/^(\d{4})$/);
  if (m) return `${m[1]}-01-01`;
  return null;
}

/** Yanıt satırlarından bir serinin noktaları; boş, "-" ya da sayı olmayan değerler atlanır */
export function parseEvdsItems(items: readonly EvdsItem[], code: string): PricePoint[] {
  const field = evdsField(code);
  const points: PricePoint[] = [];
  for (const item of items) {
    const date = parseEvdsDate(item['Tarih']);
    const raw = item[field];
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw.replace(',', '.')) : NaN;
    if (date && Number.isFinite(value)) points.push({ date, close: value });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

/** Kaynak anahtarlarından (shared/assetPricing.ts) EVDS seri kodlarına */
const SIMPLE_SERIES: Record<string, string> = {
  /** Döviz alış kuru (TCMB) */
  USD: 'TP.DK.USD.A.YTL',
  EUR: 'TP.DK.EUR.A.YTL',
  /** Piyasa Katılımcıları Anketi: 12 ay sonrası dolar/TL ve yıllık TÜFE beklentisi */
  PKA_USD12: 'TP.PKAUO.S05.C.U',
  PKA_CPI12: 'TP.PKAUO.S01.E.U',
};
/** Tüm mevduat sahipleri için 3 aya kadar TL mevduat faizi (2002'den), yeni açılanlar, haftalık */
const DEPOSIT_ALL = 'TP.TRY.MT02';
/** Aynısı yalnızca tasarruf (bireysel) mevduatı için; 6 Temmuz 2012'den başlar */
const DEPOSIT_RETAIL = 'TP.TRYTAS.MT02';
const RETAIL_START = '2012-07-06';
/** TÜFE genel endeksi (2003=100); aylık değişim için bir önceki ay gerekir */
const CPI_INDEX = 'TP.GENENDEKS.T1';
const CPI_INDEX_START = '2003-01-01';

/** Endeks serisinden aylık % değişim; her nokta ilgili ayın ilk günüyle tarihlenir, yayımlanan gibi 2 ondalık */
export function monthlyChanges(index: readonly PricePoint[]): PricePoint[] {
  const out: PricePoint[] = [];
  for (let i = 1; i < index.length; i++) {
    out.push({ date: index[i]!.date, close: Math.round((index[i]!.close / index[i - 1]!.close - 1) * 10_000) / 100 });
  }
  return out;
}

/**
 * Mevduat faizi serisini birleştirir: 2012 öncesi tüm mevduat sahipleri, sonrası bireysel (tasarruf) mevduat.
 * Aynı gün iki seride de varsa bireysel olan tercih edilir.
 */
export function spliceDeposit(all: readonly PricePoint[], retail: readonly PricePoint[]): PricePoint[] {
  return [...all.filter((p) => p.date < RETAIL_START), ...retail.filter((p) => p.date >= RETAIL_START)];
}

/**
 * TCMB EVDS'den fiyat sağlayıcısı: gerçek mevduat faizi, TÜFE, resmî kur ve beklenti anketi.
 * Sembol, assetPricing.ts içindeki SOURCES anahtarlarında yazan kısa addır (DEPOSIT_TRY, CPI, USD, EUR, PKA_USD12...).
 */
export class EvdsProvider implements PriceProvider {
  readonly name = 'evds';

  constructor(
    private readonly client: EvdsClient,
    private readonly today: () => string = () => new Date().toISOString().slice(0, 10),
  ) {}

  async fetch(symbol: string, from: string): Promise<FetchedSeries> {
    const to = this.today();
    if (symbol === 'DEPOSIT_TRY') {
      const retailFrom = from > RETAIL_START ? from : RETAIL_START;
      const [all, retail] = await Promise.all([
        from < RETAIL_START ? this.client.points(DEPOSIT_ALL, from, RETAIL_START) : Promise.resolve([]),
        this.client.points(DEPOSIT_RETAIL, retailFrom, to),
      ]);
      return { [MAIN_FIELD]: spliceDeposit(all, retail) };
    }
    if (symbol === 'CPI') {
      // İlk değişim için bir önceki ayın endeksi gerekir: geçmişin tamamı çekilir
      const index = await this.client.points(CPI_INDEX, CPI_INDEX_START, to);
      return { [MAIN_FIELD]: monthlyChanges(index).filter((p) => p.date >= from) };
    }
    const code = SIMPLE_SERIES[symbol];
    if (!code) throw new EvdsError(`Bilinmeyen EVDS kaynağı: ${symbol}`);
    return { [MAIN_FIELD]: await this.client.points(code, from, to) };
  }
}
