import {
  compareInstallment,
  netDepositRatePct,
  toIsoDate,
  type InstallmentComparison,
  type InstallmentOffer,
  type PurchasePlan,
  type PurchasePlanInput,
} from '@paramin-karsiligi/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AmountInput } from './AmountInput';
import { HoldingComparison, type Market } from './HoldingComparison';
import { PageHeader } from './PageHeader';
import { useDeletePlan, useMonthlyPrices, usePlan, usePriceStatus, useSettings, useUpdatePlan } from '../api/hooks';
import { formatMonth, formatMonthFromNow, formatNumber, formatPct, formatRate, formatTL, parseAmount } from '../lib/format';

/** Fark peşin fiyatın bu oranından küçükse "neredeyse aynı" denir */
const SAME_THRESHOLD = 0.005;
/** Son değişiklikten bu kadar sonra kaydedilir (ms) */
const SAVE_DELAY = 400;

/** Formda alanlar yazıldığı gibi (metin) tutulur, kaydederken sayıya çevrilir */
interface Form {
  name: string;
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

const amountText = (v: number | null) => (v == null ? '' : v.toLocaleString('tr-TR', { maximumFractionDigits: 2 }));
const pctText = (v: number | null) => (v == null ? '' : String(v).replace('.', ','));

function toForm(p: PurchasePlan): Form {
  return {
    name: p.name,
    cash: amountText(p.cashPrice),
    down: amountText(p.downPayment),
    count: p.count == null ? '' : String(p.count),
    amountMode: p.amountMode,
    amount: amountText(p.amount),
    first: p.firstAfterMonths === 0 ? '0' : '1',
    returnPct: pctText(p.returnPct),
    inflationPct: pctText(p.inflationPct),
  };
}

/** "12,5" ya da "12.5" → 12.5; boşsa null */
function parsePct(s: string): number | null {
  const v = Number(s.trim().replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(v) ? null : v;
}

const amountOrNull = (s: string) => {
  const v = parseAmount(s);
  return Number.isFinite(v) && v <= 1e12 ? v : null;
};
const rateOrNull = (s: string) => {
  const v = parsePct(s);
  return v != null && v >= -100 && v <= 1000 ? v : null;
};

/** Geçersiz ya da boş alanlar null kaydedilir; formda yazılan metin kalır */
function toInput(f: Form, fallbackName: string): PurchasePlanInput {
  const count = Number(f.count);
  return {
    name: f.name.trim() || fallbackName,
    cashPrice: amountOrNull(f.cash),
    downPayment: amountOrNull(f.down),
    count: f.count.trim() && Number.isInteger(count) && count >= 1 && count <= 360 ? count : null,
    amountMode: f.amountMode,
    amount: amountOrNull(f.amount),
    firstAfterMonths: f.first === '0' ? 0 : 1,
    returnPct: rateOrNull(f.returnPct),
    inflationPct: rateOrNull(f.inflationPct),
  };
}

/** Alacaklarım: alınacak bir ürünün peşin fiyatı ile taksitli teklifinin karşılaştırması */
export function PlanView({ planId }: { planId: number }) {
  const { data, error } = usePlan(planId);
  if (error) return <p className="error">{error.message}</p>;
  if (!data) return <p className="muted">Yükleniyor…</p>;
  return <PlanEditor plan={data} />;
}

function PlanEditor({ plan }: { plan: PurchasePlan }) {
  // Form yalnızca açılışta kayıttan doldurulur; sonra kullanıcı yazdıkça kaydedilir
  const [form, setForm] = useState<Form>(() => toForm(plan));
  const update = useUpdatePlan(plan.id);
  const remove = useDeletePlan();
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const lastSaved = useRef(JSON.stringify(toInput(toForm(plan), plan.name)));
  const pending = useRef<PurchasePlanInput | null>(null);
  const save = useRef(update.mutate);
  save.current = update.mutate;

  useEffect(() => {
    const input = toInput(form, plan.name);
    const json = JSON.stringify(input);
    if (json === lastSaved.current) return;
    pending.current = input;
    const timer = setTimeout(() => {
      lastSaved.current = json;
      pending.current = null;
      save.current(input);
    }, SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [form, plan.name]);

  // Başka ürüne geçilirken bekleyen değişikliği kaybetme
  useEffect(
    () => () => {
      if (pending.current) save.current(pending.current);
    },
    [],
  );

  const confirmDelete = () => {
    if (!confirm(`"${form.name}" silinsin mi?`)) return;
    pending.current = null;
    remove.mutate(plan.id);
  };

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

  const rateSummary = [
    returnPct != null && `getiri yıllık %${formatNumber(returnPct, 1)}`,
    inflationPct != null && `enflasyon %${formatNumber(inflationPct, 1)}`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="page installment">
      <PageHeader title={form.name.trim() || plan.name} onRename={(name) => set({ name })} onDelete={confirmDelete} />
      {update.error && <p className="error">Kaydedilemedi: {update.error.message}</p>}
      {remove.error && <p className="error">{remove.error.message}</p>}
      <p className="lead">
        Almayı düşündüğünüz ürünün peşin ve taksitli fiyatını girin. Peşin parayı faizde tutup taksitleri oradan
        ödeseydiniz hangisinin daha ucuza geleceğini hesaplar. Girdikleriniz otomatik kaydedilir.
      </p>

      <section className="panel">
        <h2>Teklif</h2>
        <div className="form-grid">
          <label>
            Peşin fiyat (TL)
            <AmountInput placeholder="100.000" value={form.cash} onChange={(v) => set({ cash: v })} />
          </label>
          <label>
            Peşinat (TL)
            <AmountInput placeholder="0" value={form.down} onChange={(v) => set({ down: v })} />
          </label>
          <label>
            Taksit sayısı
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={360}
              value={form.count}
              onChange={(e) => set({ count: e.target.value })}
            />
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
            <AmountInput
              placeholder={form.amountMode === 'monthly' ? '9.500' : '114.000'}
              value={form.amount}
              onChange={(v) => set({ amount: v })}
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
          <p className="hint">Toplam peşinat dahildir: aylık taksit {formatTL(installment)}.</p>
        )}
      </section>

      <details className="panel fold">
        <summary>
          <span className="fold-title">Varsayımlar</span>
          {rateSummary && <span className="fold-meta">{rateSummary}</span>}
        </summary>
        <div className="form-grid">
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
        <p className="hint">
          Boş bırakırsanız güncel değerler kullanılır: getiri için TCMB politika faizinden ayarlardaki fark ve stopajla
          bulunan net mevduat faizi
          {current.policyPct != null && ` (politika faizi %${formatNumber(current.policyPct)})`}, enflasyon için son 12
          aylık TÜFE{current.cpiMonth && ` (${formatMonth(current.cpiMonth)})`}. Gelecekteki faiz ve enflasyon bilinemez;
          farklı oranlar deneyerek sonucun nasıl değiştiğine bakın.
        </p>
      </details>

      {problem ? (
        <p className="muted">{problem}</p>
      ) : (
        result && (
          <Result result={result} offer={offer} returnPct={returnPct!} inflationPct={inflationPct} market={current.market} />
        )
      )}
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

  // Gram fiyatı yerel primi içerir; onsa çevirirken çıkarılır
  const gram = status.data?.find((s) => s.assetId === 'GRAM_GOLD')?.lastPrice;
  const usdTry = status.data?.find((s) => s.assetId === 'USD')?.lastPrice;
  const market: Market | null =
    gram && usdTry && settings.data
      ? { goldOz: (gram / (1 + settings.data.goldPremiumPct / 100)) * (31.1034768 / usdTry), usdTry, settings: settings.data }
      : null;

  return {
    policyPct,
    returnPct,
    inflationPct,
    cpiMonth,
    market,
    loading: status.isLoading || settings.isLoading,
  };
}

function Result(props: {
  result: InstallmentComparison;
  offer: InstallmentOffer;
  returnPct: number;
  inflationPct: number | null;
  market: Market | null;
}) {
  const { result: r, offer } = props;
  const same = Math.abs(r.advantage) < offer.cashPrice * SAME_THRESHOLD;
  const installmentWins = r.advantage > 0;
  const rateText = `yıllık %${formatNumber(props.returnPct, 1)} net faizle`;

  return (
    <>
      <section className={`panel verdict ${same ? '' : installmentWins ? 'good' : 'bad'}`}>
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

      <div className="metrics">
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

      {props.market && <HoldingComparison offer={offer} result={r} market={props.market} />}

      <details className="panel fold">
        <summary>
          <span className="fold-title">Ödeme planı</span>
          <span className="fold-meta">
            {offer.count} taksit, ay ay bugünkü değeri ve mevduatta kalan
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
                <td className="num">{offer.downPayment > 0 ? `${formatTL(offer.downPayment)} peşinat` : '—'}</td>
                <td className="num">{offer.downPayment > 0 ? formatTL(offer.downPayment) : '—'}</td>
                {r.realTotal != null && <td className="num">{offer.downPayment > 0 ? formatTL(offer.downPayment) : '—'}</td>}
                <td className="num">{formatTL(offer.cashPrice - offer.downPayment)}</td>
              </tr>
              {r.rows.map((row, i) => (
                <tr key={i}>
                  <td>
                    {formatMonthFromNow(row.month)} <span className="muted small">({i + 1}. taksit)</span>
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
