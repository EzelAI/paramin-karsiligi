import { MAIN_FIELD, type FetchedSeries, type PricePoint, type PriceProvider } from './types';

interface ChartResponse {
  chart: {
    result:
      | {
          meta: { gmtoffset: number };
          timestamp?: number[];
          indicators: { quote: { close: (number | null)[] }[] };
          events?: { dividends?: Record<string, { amount: number; date: number }> };
        }[]
      | null;
    error: { description: string } | null;
  };
}

/**
 * Yahoo Finance günlük verisi.
 * value: bölünmelere göre düzeltilmiş, temettüye göre düzeltilmemiş kapanış
 * dividends: hisse başına brüt temettü (bölünmelere göre düzeltilmiş), hak kullanım gününde
 */
export class YahooFinanceProvider implements PriceProvider {
  readonly name = 'yahoo';

  async fetch(symbol: string, from: string): Promise<FetchedSeries> {
    const period1 = Math.floor(Date.parse(from + 'T00:00:00Z') / 1000);
    const period2 = Math.floor(Date.now() / 1000) + 86400;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d&events=div`;

    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`Yahoo ${symbol}: HTTP ${res.status}`);
    const body = (await res.json()) as ChartResponse;
    const result = body.chart.result?.[0];
    if (!result) throw new Error(`Yahoo ${symbol}: ${body.chart.error?.description ?? 'veri yok'}`);

    // Borsanın yerel saatine göre gün
    const toDate = (ts: number) => new Date((ts + result.meta.gmtoffset) * 1000).toISOString().slice(0, 10);

    const closes = result.indicators.quote[0]?.close ?? [];
    const byDate = new Map<string, number>();
    (result.timestamp ?? []).forEach((ts, i) => {
      const close = closes[i];
      if (close != null && Number.isFinite(close) && close > 0) byDate.set(toDate(ts), close);
    });

    const dividends: PricePoint[] = Object.values(result.events?.dividends ?? {})
      .filter((d) => Number.isFinite(d.amount) && d.amount > 0)
      .map((d) => ({ date: toDate(d.date), close: d.amount }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { [MAIN_FIELD]: [...byDate].map(([date, close]) => ({ date, close })), dividends };
  }
}
