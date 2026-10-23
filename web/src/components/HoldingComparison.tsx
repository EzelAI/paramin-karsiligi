import {
  FORECAST_STALE_DAYS,
  forecastAgeDays,
  FORECASTS_COMPILED_AT,
  GOLD_FORECAST_AVERAGE,
  GOLD_FORECASTS,
  goldBreakEvenOz,
  monthlyGrowth,
  simulateHolding,
  USDTRY_FORECAST,
  type InstallmentComparison,
  type InstallmentOffer,
  type Settings,
} from '@paramin-karsiligi/shared';
import { useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { formatDate, formatMonthFromNow, formatNumber, formatRate, formatTL, formatTLShort } from '../lib/format';

/** Güncel ons ($) ve dolar/TL; tahminlerden büyüme oranı bulmak için */
export interface Market {
  goldOz: number;
  usdTry: number;
  settings: Settings;
}

type OptionId = 'deposit' | 'gold' | 'usd';

interface Option {
  id: OptionId;
  name: string;
  note: string;
  /** Grafik rengi: açık/koyu temada ayrı adımlar (styles.css) */
  color: string;
  monthly: number;
  costRate: number;
}

type View = 'spend' | 'keep';

const VIEWS: Record<View, { label: string; hint: string }> = {
  keep: {
    label: 'Paranın büyümesi',
    hint: 'Peşin paranın (peşinat düşülmüş) taksit süresince nasıl büyüyeceği; taksitler düşülmez.',
  },
  spend: {
    label: 'Taksitler ödenirken',
    hint: 'Peşin parayı bekletip her ay taksiti oradan öderseniz kalan para. Sıfırın altı, paranın taksitlere yetmediğini gösterir.',
  },
};

const usd = (v: number) => `$${formatNumber(v, 0)}`;
const annual = (monthly: number) => Math.pow(1 + monthly, 12) - 1;

/**
 * Peşin parayı mevduat yerine altında ya da dolarda tutup taksitleri oradan ödeseydiniz.
 * Altın ve kur için yayımlanmış tahminlerin ortalaması (ya da kullanıcının tahmini) varsayılır ve ekranda yazılır.
 */
export function HoldingComparison({ offer, result, market }: { offer: InstallmentOffer; result: InstallmentComparison; market: Market }) {
  const [view, setView] = useState<View>('keep');
  const { settings } = market;
  const ozTarget = settings.forecast.goldUsdOz ?? GOLD_FORECAST_AVERAGE;
  const usdTarget = settings.forecast.usdTry ?? USDTRY_FORECAST.value;
  const ozOwn = settings.forecast.goldUsdOz != null;
  const usdOwn = settings.forecast.usdTry != null;

  const usdMonthly = monthlyGrowth(market.usdTry, usdTarget);
  const goldMonthly = (1 + monthlyGrowth(market.goldOz, ozTarget)) * (1 + usdMonthly) - 1;
  const breakEven = goldBreakEvenOz(market.goldOz, result.returnMonthlyRate, usdMonthly);

  const options: Option[] = [
    { id: 'deposit', name: 'Mevduat', note: 'net faiz sabit kalırsa', color: 'var(--c-faiz)', monthly: result.returnMonthlyRate, costRate: 0 },
    {
      id: 'gold',
      name: 'Gram altın',
      note: ozOwn ? 'sizin tahmininiz' : 'ortalama tahmin',
      color: 'var(--c-gold)',
      monthly: goldMonthly,
      costRate: settings.tradingCostPct.gold / 100,
    },
    {
      id: 'usd',
      name: 'Dolar',
      note: usdOwn ? 'sizin tahmininiz' : 'TCMB anketi',
      color: 'var(--c-usd)',
      monthly: usdMonthly,
      costRate: settings.tradingCostPct.fx / 100,
    },
  ];

  // Taksitler düşülerek ve düşülmeden bakiyeler; ilk nokta bugün, alım maliyeti kesilmiş başlangıç
  const keepOffer = { ...offer, installment: 0 };
  const start = offer.cashPrice - offer.downPayment;
  const series = Object.fromEntries(
    options.map((o) => [
      o.id,
      {
        spend: [start * (1 - o.costRate), ...simulateHolding(offer, o.monthly, o.costRate)],
        keep: [start * (1 - o.costRate), ...simulateHolding(keepOffer, o.monthly, o.costRate)],
      },
    ]),
  ) as Record<OptionId, Record<View, number[]>>;

  const months = [0, ...result.rows.map((r) => r.month)];
  const data = months.map((m, i) => ({
    label: i === 0 ? 'Bugün' : `${formatMonthFromNow(m)}`,
    step: i === 0 ? 'Başlangıç' : view === 'spend' ? `${i}. taksit sonrası` : `${i}. taksit ayı`,
    ...Object.fromEntries(options.map((o) => [o.id, series[o.id][view][i]!])),
  }));

  const end = (id: OptionId, v: View = 'spend') => series[id][v].at(-1)!;
  const best = options.reduce((a, b) => (end(b.id) > end(a.id) ? b : a)).id;

  return (
    <section className="card">
      <h2>Peşin parayı nerede tutsaydınız?</h2>
      <p className="muted small hint-top">
        Taksitli alıp peşin parayı bekletirseniz son taksitten sonra elinizde kalan (alım-satım maliyeti düşülmüş).
      </p>

      <div className="holding-cards">
        {options.map((o) => {
          const v = end(o.id);
          const diff = v - end('deposit');
          return (
            <div key={o.id} className={`holding-card${o.id === best ? ' best' : ''}`} style={{ borderTopColor: o.color }}>
              <div className="holding-head">
                <span className="label">{o.name}</span>
                {o.id === best && <span className="badge" title="Yukarıdaki varsayımlara göre">En çok kalan</span>}
              </div>
              <div className={`compare-value ${v < 0 ? 'down' : ''}`}>{formatTL(v)}</div>
              <div className="muted small">
                yıllık {formatRate(annual(o.monthly))} · {o.note}
              </div>
              <div className={`small strong ${o.id === 'deposit' ? 'muted' : diff >= 0 ? 'up' : 'down'}`}>
                {o.id === 'deposit' ? 'karşılaştırma tabanı' : `mevduata göre ${diff >= 0 ? '+' : ''}${formatTL(diff)}`}
              </div>
            </div>
          );
        })}
      </div>

      <div className="tabs" role="tablist">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
            {VIEWS[v].label}
          </button>
        ))}
      </div>
      <p className="muted small hint-top">{VIEWS[view].hint}</p>

      <div className="chart holding-chart">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 12 }} minTickGap={16} />
            <YAxis tickFormatter={formatTLShort} tick={{ fill: 'var(--muted)', fontSize: 12 }} width={72} />
            {view === 'spend' && <ReferenceLine y={0} stroke="var(--muted)" />}
            <Tooltip content={<ChartTooltip options={options} />} cursor={{ stroke: 'var(--muted)', strokeWidth: 1 }} />
            <Legend formatter={(name: string) => <span className="legend-text">{name}</span>} />
            {options.map((o) => (
              <Line
                key={o.id}
                type="monotone"
                dataKey={o.id}
                name={o.name}
                stroke={o.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <details className="table-toggle">
        <summary>Tablo olarak göster</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ay</th>
                {options.map((o) => (
                  <th key={o.id} className="num">
                    {o.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={i}>
                  <td>
                    {d.label} <span className="muted small">({d.step})</span>
                  </td>
                  {options.map((o) => (
                    <td key={o.id} className={`num ${series[o.id][view][i]! < 0 ? 'down' : ''}`}>
                      {formatTL(series[o.id][view][i])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="assumption">
        <strong>Varsayım ({formatDate(FORECASTS_COMPILED_AT)} itibarıyla)</strong>
        {forecastAgeDays() > FORECAST_STALE_DAYS && (
          <p className="warning">
            Bu tahminler {Math.floor(forecastAgeDays() / 30)} aydan eski ve güncel olmayabilir. Güncel tahminleri
            kontrol edin ya da kendi tahmininizi girin.
          </p>
        )}
        <ul>
          <li>
            Ons altın 12 ay sonra <strong>{usd(ozTarget)}</strong>
            {ozOwn ? (
              <> (sizin tahmininiz; yayımlanmış tahminlerin ortalaması {usd(GOLD_FORECAST_AVERAGE)}).</>
            ) : (
              <>
                : {GOLD_FORECASTS.length} tahminin ortalaması (
                {GOLD_FORECASTS.map((f) => `${f.source} ${usd(f.value)}`).join(' · ')}).
              </>
            )}{' '}
            Bugün {usd(market.goldOz)}.
          </li>
          <li>
            Dolar/TL 12 ay sonra <strong>{formatNumber(usdTarget)}</strong>
            {usdOwn
              ? ` (sizin tahmininiz; ${USDTRY_FORECAST.source} ${formatNumber(USDTRY_FORECAST.value)})`
              : ` (${USDTRY_FORECAST.source})`}
            . Bugün {formatNumber(market.usdTry)}.
          </li>
          <li>
            Fiyatların bugünden bu hedeflere düzenli arttığı, taksitler 12 aydan uzunsa aynı yıllık hızla sürdüğü
            varsayılır. Mevduat faizinin de sabit kaldığı varsayılır.
          </li>
          <li>
            Altının mevduatla başa baş olması için onsun 12 ayda <strong>{usd(breakEven)}</strong> olması gerekir; bunun
            üstünde altın, altında mevduat kazandırır.
          </li>
        </ul>
        <p className="muted small">
          Tahminler sık değişir ve çoğu zaman tutmaz: LBMA'nın 1997–2024 incelemesine göre analist ortalaması tek bir yılda
          ortalama %9 yanılıyor. Kendi tahmininizi <em>Hesaplama varsayımları</em> ekranından girebilirsiniz. Bu
          karşılaştırma bir senaryo hesabıdır, altın, döviz ya da mevduat için alım-satım önerisi değildir.
        </p>
      </div>
    </section>
  );
}

/** Değer önde, ad arkada; seri rengi yalnızca kısa çizgi anahtarında */
function ChartTooltip({ active, payload, options }: TooltipProps<number, string> & { options: Option[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]!.payload as { label: string; step: string } & Record<OptionId, number>;
  return (
    <div className="chart-tooltip">
      <div className="muted small">
        {point.label} · {point.step}
      </div>
      {[...options]
        .sort((a, b) => point[b.id] - point[a.id])
        .map((o) => (
          <div key={o.id} className="tooltip-row">
            <span className="key" style={{ background: o.color }} />
            <strong className={point[o.id] < 0 ? 'down' : ''}>{formatTL(point[o.id])}</strong>
            <span className="muted">{o.name}</span>
          </div>
        ))}
    </div>
  );
}
