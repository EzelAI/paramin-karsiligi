import type { InstallmentComparison, PaymentSchedule } from '@paramin-karsiligi/shared';
import type { ReactNode } from 'react';
import { formatMonthFromNow, formatNumber, formatPct, formatRate, formatTL } from '../lib/format';
import { HoldingComparison, type Market } from './HoldingComparison';

/** Fark peşin fiyatın bu oranından küçükse "neredeyse aynı" denir */
const SAME_THRESHOLD = 0.005;

/** Seçili ödeme seçeneğinin sonucu: karar, göstergeler, tutma karşılaştırması ve ödeme planı */
export function PlanResult(props: {
  optionName: string;
  result: InstallmentComparison;
  schedule: PaymentSchedule;
  returnPct: number;
  inflationPct: number | null;
  market: Market | null;
}) {
  const { result: r, schedule } = props;
  const same = Math.abs(r.advantage) < schedule.cashPrice * SAME_THRESHOLD;
  const planWins = r.advantage > 0;
  const rateText = `yıllık %${formatNumber(props.returnPct, 1)} net faizle`;

  return (
    <>
      <section className={`panel verdict ${same ? '' : planWins ? 'good' : 'bad'}`}>
        <div className="muted small">{props.optionName}</div>
        <div className="hero-value">
          {same ? 'İkisi neredeyse aynı' : planWins ? 'Bu plan daha avantajlı' : 'Peşin daha avantajlı'}
        </div>
        <p>
          {same ? (
            <>Ödemelerin bugünkü değeri peşin fiyata çok yakın ({formatTL(Math.abs(r.advantage))} fark).</>
          ) : planWins ? (
            <>
              Bu planla almak bugünün parasıyla <strong>{formatTL(r.advantage)}</strong> daha ucuz. Peşin parayı {rateText}{' '}
              mevduata koyup ödemeleri oradan yaparsanız son ödemeden sonra elinizde{' '}
              <strong>{formatTL(r.endBalance)}</strong> kalır.
            </>
          ) : (
            <>
              Bu planla almak bugünün parasıyla <strong>{formatTL(-r.advantage)}</strong> daha pahalı. Peşin parayı{' '}
              {rateText} mevduata koyup ödemeleri oradan yapmaya kalksanız son ödemede{' '}
              <strong>{formatTL(-r.endBalance)}</strong> eksik kalır.
            </>
          )}
        </p>
      </section>

      <div className="metrics">
        <Metric title="Toplam ödeme" value={formatTL(r.totalPrice)} color="var(--muted)">
          peşine göre {formatPct(r.markupPct * 100)} ({r.markup >= 0 ? '+' : ''}
          {formatTL(r.markup)})
        </Metric>
        <Metric title="Ödemelerin bugünkü değeri" value={formatTL(r.presentValue)} color="var(--gold)">
          {rateText} iskonto edildi
        </Metric>
        <Metric
          title="Planın faizi"
          value={r.impliedAnnualRate == null ? '—' : `%${formatNumber(r.impliedAnnualRate * 100, 1)}`}
          color={r.impliedAnnualRate != null && r.impliedAnnualRate < r.returnAnnualRate ? 'var(--up)' : 'var(--down)'}
        >
          yıllık bileşik (aylık {formatRate(r.impliedMonthlyRate)}); mevduat yıllık bileşik %
          {formatNumber(r.returnAnnualRate * 100, 1)}
        </Metric>
        {r.realTotal != null && (
          <Metric title="Bugünün parasıyla" value={formatTL(r.realTotal)} color="#6b7bd6">
            ödemelerin toplamı, yıllık %{formatNumber(props.inflationPct ?? 0, 1)} enflasyonla
          </Metric>
        )}
      </div>

      <p className="muted small">
        Planın faizi paranızın getirisinden düşük olduğu sürece ileri tarihli ödeme kârlıdır. Toplam ödeme peşin fiyata
        eşit olsa bile (faizsiz plan) ödemeler ertelendiği sürece paranız faiz kazandığı için plan genelde avantajlıdır.
      </p>

      {props.market && <HoldingComparison schedule={schedule} result={r} market={props.market} />}

      <details className="panel fold">
        <summary>
          <span className="fold-title">Ödeme planı</span>
          <span className="fold-meta">
            {r.rows.length + (r.upfront > 0 ? 1 : 0)} ödeme, ay ay bugünkü değeri ve mevduatta kalan
          </span>
        </summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ay</th>
                <th className="num">Ödeme</th>
                <th className="num" title={`${rateText} bugüne indirgenmiş değer`}>
                  Bugünkü değeri
                </th>
                {r.realTotal != null && (
                  <th className="num" title="Beklenen enflasyona göre bugünün parasıyla">
                    Bugünün parasıyla
                  </th>
                )}
                <th className="num" title="Peşin fiyat mevduatta, ödemeler oradan yapılıyor">
                  Mevduatta kalan
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Bugün</td>
                <td className="num">{r.upfront > 0 ? `${formatTL(r.upfront)} peşin` : '—'}</td>
                <td className="num">{r.upfront > 0 ? formatTL(r.upfront) : '—'}</td>
                {r.realTotal != null && <td className="num">{r.upfront > 0 ? formatTL(r.upfront) : '—'}</td>}
                <td className="num">{formatTL(schedule.cashPrice - r.upfront)}</td>
              </tr>
              {r.rows.map((row, i) => (
                <tr key={i}>
                  <td>
                    {formatMonthFromNow(row.month)} <span className="muted small">({i + 1}. ödeme)</span>
                  </td>
                  <td className="num">{formatTL(row.amount)}</td>
                  <td className="num">{formatTL(row.presentValue)}</td>
                  {r.realTotal != null && <td className="num">{formatTL(row.realValue)}</td>}
                  <td className={`num ${row.balanceAfter < 0 ? 'down' : ''}`}>{formatTL(row.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

function Metric(props: { title: string; value: string; color: string; children: ReactNode }) {
  return (
    <div className="metric" style={{ borderTopColor: props.color }}>
      <div className="label">{props.title}</div>
      <div className="compare-value">{props.value}</div>
      <div className="muted small">{props.children}</div>
    </div>
  );
}
