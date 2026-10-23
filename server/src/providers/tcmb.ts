import { MAIN_FIELD, type FetchedSeries, type PricePoint, type PriceProvider } from './types';

const BASE = 'https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu';
const RATES = `${BASE}/Temel+Faaliyetler/Para+Politikasi/Merkez+Bankasi+Faiz+Oranlari`;
/** Gecelik faizler (2010 öncesinde politika faizi gecelik borç alma faiziydi) */
const OVERNIGHT_URL = `${RATES}/faiz-oranlari`;
/** 1 hafta vadeli repo (20.05.2010'dan beri politika faizi) */
const ONE_WEEK_REPO_URL = `${RATES}/1+Hafta+Repo`;
const ONE_WEEK_REPO_START = '2010-05-20';
/** Tüketici fiyatları: ay, yıllık % ve aylık % değişim */
const CPI_URL = `${BASE}/Istatistikler/Enflasyon+Verileri/Tuketici+Fiyatlari`;

/**
 * TCMB politika faizi geçmişi. Yalnızca değişiklik günlerini döndürür
 * (yıllık basit faiz, %); aradaki günler bir önceki değerle geçerlidir.
 */
export class TcmbPolicyRateProvider implements PriceProvider {
  readonly name = 'tcmb';

  async fetch(): Promise<FetchedSeries> {
    const [overnight, repo] = await Promise.all([fetchTable(OVERNIGHT_URL), fetchTable(ONE_WEEK_REPO_URL)]);
    return { [MAIN_FIELD]: parsePolicyRates(overnight, repo) };
  }
}

/** TÜFE aylık % değişimleri; her nokta ilgili ayın ilk günüyle tarihlenir */
export class TcmbCpiProvider implements PriceProvider {
  readonly name = 'tcmb-cpi';

  async fetch(): Promise<FetchedSeries> {
    const points = parseCpiTable(await fetchTable(CPI_URL));
    if (points.length === 0) throw new Error('TCMB TÜFE tablosu okunamadı');
    return { [MAIN_FIELD]: points };
  }
}

export function parsePolicyRates(overnight: string[][], repo: string[][]): PricePoint[] {
  // Gecelik tabloda 2. sütun borç alma, repo tablosunda 3. sütun borç verme (politika faizi)
  const before = overnight.flatMap((r) => toPoint(r[0], r[1])).filter((p) => p.date < ONE_WEEK_REPO_START);
  const after = repo.flatMap((r) => toPoint(r[0], r[2])).filter((p) => p.date >= ONE_WEEK_REPO_START);
  if (after.length === 0) throw new Error('TCMB repo faizi tablosu okunamadı');
  return [...before, ...after].sort((a, b) => a.date.localeCompare(b.date));
}

export function parseCpiTable(rows: string[][]): PricePoint[] {
  return rows
    .flatMap((r) => {
      const m = r[0]?.match(/^(\d{2})-(\d{4})$/);
      const monthly = parseNumber(r[2]);
      return m && monthly !== null ? [{ date: `${m[2]}-${m[1]}-01`, close: monthly }] : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchTable(url: string): Promise<string[][]> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`TCMB: HTTP ${res.status}`);
  return parseHtmlTable(await res.text());
}

export function parseHtmlTable(html: string): string[][] {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((row) =>
    [...row[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((cell) =>
      cell[1]!.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim(),
    ),
  );
}

/** "7.00" / "7,00" → 7; boş, "-" ya da sayı olmayan hücre → null (boş hücre %0 sayılmamalı) */
function parseNumber(text: string | undefined): number | null {
  const t = text?.trim().replace(',', '.');
  if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** "20.05.2010" ya da "20.05.10" + "7.00" → nokta; okunamazsa boş */
function toPoint(dateText: string | undefined, rateText: string | undefined): PricePoint[] {
  const m = dateText?.trim().match(/^(\d{2})\.(\d{2})\.(\d{2}|\d{4})$/);
  const rate = parseNumber(rateText);
  if (!m || rate === null) return [];
  const year = m[3]!.length === 2 ? `20${m[3]}` : m[3];
  return [{ date: `${year}-${m[2]}-${m[1]}`, close: rate }];
}
