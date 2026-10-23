import {
  compareInstallment,
  netDepositRatePct,
  toIsoDate,
  type InstallmentComparison,
  type InstallmentOffer,
} from '@paramin-karsiligi/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { useMonthlyPrices, usePriceStatus, useSettings } from '../api/hooks';
import { formatMonth, formatNumber, formatPct, formatRate, formatTL, parseAmount } from '../lib/format';
import { readItem, writeItem } from '../lib/storage';

const FORM_KEY = 'altin.installmentForm';

/** Fark peşin fiyatın bu oranından küçükse "neredeyse aynı" denir */
const SAME_THRESHOLD = 0.005;

interface Form {
  cash: string;
  down: string;
  count: string;
  amountMode: 'monthly' | 'total';
  amount: string;
  first: '0' | '1';
  /** Boşsa güncel değer kullanılır */
  returnPct: string;
  inflationPct: string;
}

const EMPTY: Form = { cash: '', down: '', count: '12', amountMode: 'monthly', amount: '', first: '1', returnPct: '', inflationPct: '' };

/** "12,5" ya da "12.5" → 12.5; boşsa null */
function parsePct(s: string): number | null {
  const v = Number(s.trim().replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(v) ? null : v;
}

/** Bu aydan k ay sonrası, "Oca 2027" */
function monthLabel(k: number) {
  const now = new Date();
  return k === 0 ? 'Bugün' : formatMonth(toIsoDate(new Date(now.getFullYear(), now.getMonth() + k, 1)).slice(0, 7));
}

/** Gelecekte alınacak bir ürün için peşin fiyat ile taksitli teklifin karşılaştırması */
export function InstallmentView() {
  const [form, setForm] = useState<Form>(() => ({ ...EMPTY, ...readItem<Partial<Form>>(FORM_KEY) }));
  useEffect(() => writeItem(FORM_KEY, form), [form]);
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });

  const current = useCurrentRates();
  const returnPct = parsePct(form.returnPct) ?? current.returnPct;
  const inflationPct = parsePct(form.inflationPct) ?? current.inflationPct;

  const cash = parseAmount(form.cash);
  const down = form.down.trim() ? parseAmount(form.down) : 0;
  const count = Number(form.count);
  const amount = parseAmount(form.amount);
  const installment = form.amountMode === 'monthly' ? amount : (amount - down) / count;

  let problem: string | null = null;
  if (!(cash > 0) || !(amount > 0)) problem = 'Peşin fiyatı ve taksit tutarını girin.';
  else if (!Number.isInteger(count) || count < 1 || count > 360) problem = 'Taksit sayısı 1 ile 360 arasında olmalı.';
  else if (!(down >= 0)) problem = 'Peşinat geçerli bir tutar olmalı.';
  else if (down >= cash) problem = 'Peşinat peşin fiyattan az olmalı.';
  else if (!(installment > 0)) problem = 'Taksitli toplam fiyat peşinattan büyük olmalı.';
  else if (returnPct == null) problem = current.loading ? 'Güncel faiz yükleniyor…' : 'Paranın getirisi için bir oran girin.';

  const offer: InstallmentOffer = { cashPrice: cash, downPayment: down, count, installment, firstAfterMonths: Number(form.first) };
  const result = problem ? null : compareInstallment(offer, { annualReturnPct: returnPct!, annualInflationPct: inflationPct });

  return (
    <div className="inv-view installment">
      <header className="inv-header">
        <h1>Peşin mi, taksit mi?</h1>
        <div className="header-actions">
          <button className="btn ghost" onClick={() => setForm(EMPTY)}>
            Temizle
          </button>
        </div>
      </header>
      <p className="muted intro">
        Almayı düşündüğünüz bir ürünün peşin ve taksitli fiyatını girin. Peşin parayı faizde tutup taksitleri oradan
        ödeseydiniz hangisinin daha ucuza geleceğini hesaplar.
      </p>

      <section className="card">
        <h2>Teklif</h2>
        <div className="form-row">
          <label>
            Peşin fiyat (TL)
            <input inputMode="decimal" placeholder="100.000" value={form.cash} onChange={(e) => set({ cash: e.target.value })} />
          </label>
          <label>
            Peşinat (TL)
            <input inputMode="decimal" placeholder="0" value={form.down} onChange={(e) => set({ down: e.target.value })} />
          </label>
          <label className="narrow">
            Taksit sayısı
            <input type="number" min={1} max={360} value={form.count} onChange={(e) => set({ count: e.target.value })} />
          </label>
          <label>
            <select
              className="label-select"
              value={form.amountMode}
              onChange={(e) => set({ amountMode: e.target.value as Form['amountMode'] })}
              aria-label="Tutar türü"
            >
              <option value="monthly">Aylık taksit (TL)</option>
              <option value="total">Taksitli toplam (TL)</option>
            </select>
            <input
              inputMode="decimal"
              placeholder={form.amountMode === 'monthly' ? '9.500' : '114.000'}
              value={form.amount}
              onChange={(e) => set({ amount: e.target.value })}
            />
          </label>
          <label>
            İlk taksit
            <select value={form.first} onChange={(e) => set({ first: e.target.value as Form['first'] })}>
              <option value="1">1 ay sonra</option>
              <option value="0">Bugün</option>
            </select>
          </label>
        </div>
        {form.amountMode === 'total' && installment > 0 && Number.isFinite(installment) && (
          <p className="muted small hint">
            Toplam peşinat dahildir: aylık taksit {formatTL(installment)}.
          </p>
        )}
      </section>

      <section className="card">
        <h2>Varsayımlar</h2>
        <div className="form-row">
          <RateField
            label="Paranın getirisi (yıllık net %)"
            value={form.returnPct}
            fallback={current.returnPct}
            onChange={(v) => set({ returnPct: v })}
          />
          <RateField
            label="Beklenen enflasyon (yıllık %)"
            value={form.inflationPct}
            fallback={current.inflationPct}
            onChange={(v) => set({ inflationPct: v })}
          />
        </div>
        <p className="muted small hint">
          Boş bırakırsanız güncel değerler kullanılır: getiri için TCMB politika faizinden ayarlardaki fark ve stopajla
          bulunan net mevduat faizi
          {current.policyPct != null && ` (politika faizi %${formatNumber(current.policyPct)})`}, enflasyon için son 12
          aylık TÜFE{current.cpiMonth && ` (${formatMonth(current.cpiMonth)})`}. Gelecekteki faiz ve enflasyon bilinemez;
          farklı oranlar deneyerek sonucun nasıl değiştiğine bakın.
        </p>
      </section>

      {problem ? <p className="muted">{problem}</p> : result && <Result result={result} offer={offer} returnPct={returnPct!} inflationPct={inflationPct} />}
    </div>
  );
}

function RateField(props: { label: string; value: string; fallback: number | null; onChange: (v: string) => void }) {
  return (
    <label className="narrow-field wide">
      {props.label}
      <input
        inputMode="decimal"
        placeholder={props.fallback == null ? '' : `${formatNumber(props.fallback, 1)} (güncel)`}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}

/** Güncel net mevduat faizi ve son 12 aylık TÜFE */
function useCurrentRates() {
  const status = usePriceStatus();
  const settings = useSettings();
  const from = toIsoDate(new Date(new Date().getFullYear() - 2, 0, 1));
  const cpi = useMonthlyPrices('TUFE', from);

  const policyPct = status.data?.find((s) => s.assetId === 'FAIZ')?.ratePct ?? null;
  const returnPct =
    policyPct != null && settings.data
      ? netDepositRatePct(policyPct, settings.data.depositSpreadPts, settings.data.depositWithholdingPct)
      : null;

  // TÜFE serisi son açıklanan aydan sonra sabit: o ayın sonunu 12 ay öncesiyle karşılaştır
  const cpiMonth = status.data?.find((s) => s.assetId === 'TUFE')?.sourceLastDate?.slice(0, 7) ?? null;
  let inflationPct: number | null = null;
  if (cpiMonth && cpi.data) {
    const [y, m] = cpiMonth.split('-').map(Number) as [number, number];
    const prevMonth = `${y - 1}-${String(m).padStart(2, '0')}`;
    const last = cpi.data.find((p) => p.date.startsWith(cpiMonth));
    const prev = cpi.data.find((p) => p.date.startsWith(prevMonth));
    if (last && prev) inflationPct = (last.price / prev.price - 1) * 100;
  }

  return {
    policyPct,
    returnPct,
    inflationPct,
    cpiMonth,
    loading: status.isLoading || settings.isLoading,
  };
}

function Result(props: { result: InstallmentComparison; offer: InstallmentOffer; returnPct: number; inflationPct: number | null }) {
  const { result: r, offer } = props;
  const same = Math.abs(r.advantage) < offer.cashPrice * SAME_THRESHOLD;
  const installmentWins = r.advantage > 0;
  const rateText = `yıllık %${formatNumber(props.returnPct, 1)} net faizle`;

  return (
    <>
      <section className={`card verdict ${same ? '' : installmentWins ? 'good' : 'bad'}`}>
        <div className="label">Sonuç</div>
        <div className="hero-value">
          {same ? 'İkisi neredeyse aynı' : installmentWins ? 'Taksit daha avantajlı' : 'Peşin daha avantajlı'}
        </div>
        <p>
          {same ? (
            <>Taksitlerin bugünkü değeri peşin fiyata çok yakın ({formatTL(Math.abs(r.advantage))} fark).</>
          ) : installmentWins ? (
            <>
              Taksitli almak bugünün parasıyla <strong>{formatTL(r.advantage)}</strong> daha ucuz. Peşin parayı {rateText}{' '}
              mevduata koyup taksitleri oradan öderseniz son taksitten sonra elinizde{' '}
              <strong>{formatTL(r.endBalance)}</strong> kalır.
            </>
          ) : (
            <>
              Taksitli almak bugünün parasıyla <strong>{formatTL(-r.advantage)}</strong> daha pahalı. Peşin parayı{' '}
              {rateText} mevduata koyup taksitleri oradan ödemeye kalksanız son taksitte{' '}
              <strong>{formatTL(-r.endBalance)}</strong> eksik kalır.
            </>
          )}
        </p>
      </section>

      <div className="compare-grid">
        <Metric title="Taksitli toplam" value={formatTL(r.totalPrice)} color="var(--muted)">
          peşine göre {formatPct(r.markupPct * 100)} ({r.markup >= 0 ? '+' : ''}
          {formatTL(r.markup)})
        </Metric>
        <Metric title="Taksitlerin bugünkü değeri" value={formatTL(r.presentValue)} color="var(--gold)">
          {rateText} iskonto edildi
        </Metric>
        <Metric
          title="Teklifin faizi"
          value={r.impliedAnnualRate == null ? '—' : `%${formatNumber(r.impliedAnnualRate * 100, 1)}`}
          color={r.impliedAnnualRate != null && r.impliedAnnualRate < r.returnAnnualRate ? 'var(--up)' : 'var(--down)'}
        >
          yıllık bileşik (aylık {formatRate(r.impliedMonthlyRate)}); mevduat yıllık bileşik %
          {formatNumber(r.returnAnnualRate * 100, 1)}
        </Metric>
        {r.realTotal != null && (
          <Metric title="Bugünün parasıyla" value={formatTL(r.realTotal)} color="#6b7bd6">
            taksitlerin toplamı, yıllık %{formatNumber(props.inflationPct ?? 0, 1)} enflasyonla
          </Metric>
        )}
      </div>

      <p className="muted small">
        Teklifin faizi paranızın getirisinden düşük olduğu sürece taksitli almak kârlıdır. Taksitli toplam peşin fiyata
        eşit olsa bile (sıfır faizli taksit) aradaki süre boyunca paranız faiz kazandığı için taksit genelde avantajlıdır.
      </p>

      <section className="card">
        <h2>Ödeme planı</h2>
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
                <td className="num">{offer.downPayment > 0 ? `${formatTL(offer.downPayment)} peşinat` : '—'}</td>
                <td className="num">{offer.downPayment > 0 ? formatTL(offer.downPayment) : '—'}</td>
                {r.realTotal != null && <td className="num">{offer.downPayment > 0 ? formatTL(offer.downPayment) : '—'}</td>}
                <td className="num">{formatTL(offer.cashPrice - offer.downPayment)}</td>
              </tr>
              {r.rows.map((row, i) => (
                <tr key={i}>
                  <td>
                    {monthLabel(row.month)} <span className="muted small">({i + 1}. taksit)</span>
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
      </section>
    </>
  );
}

function Metric(props: { title: string; value: string; color: string; children: ReactNode }) {
  return (
    <div className="card compare-card" style={{ borderTopColor: props.color }}>
      <div className="label">{props.title}</div>
      <div className="compare-value">{props.value}</div>
      <div className="muted small">{props.children}</div>
    </div>
  );
}
