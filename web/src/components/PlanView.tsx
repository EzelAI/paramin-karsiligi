import {
  compareSchedule,
  customBase,
  defaultCustom,
  defaultInstallments,
  MAX_FIRST_AFTER_MONTHS,
  monthName,
  netDepositRatePct,
  optionToSchedule,
  splitAmount,
  toIsoDate,
  type InstallmentComparison,
  type CustomOption,
  type PaymentOption,
  type PaymentSchedule,
  type PurchasePlan,
  type PurchasePlanInput,
} from '@paramin-karsiligi/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDeletePlan, useExpectations, useMonthlyPrices, usePlan, usePriceStatus, useSettings, useUpdatePlan } from '../api/hooks';
import { formatMonthFromNow, formatNumber, formatTL, parseAmount } from '../lib/format';
import { AmountInput } from './AmountInput';
import { type Market } from './HoldingComparison';
import { PageHeader } from './PageHeader';
import { PlanResult } from './PlanResult';

/** Son değişiklikten bu kadar sonra kaydedilir (ms) */
const SAVE_DELAY = 400;
const MAX_OPTIONS = 8;

/** Formda alanlar yazıldığı gibi (metin) tutulur, kaydederken sayıya çevrilir */
interface InstallmentsForm {
  id: string;
  name: string;
  kind: 'installments';
  down: string;
  count: string;
  amountMode: 'monthly' | 'total';
  amount: string;
  /** İlk taksit kaç ay sonra (0 = bugün) */
  first: number;
}

interface CustomRowForm {
  after: string;
  value: string;
  unit: 'tl' | 'pct';
}

interface CustomForm {
  id: string;
  name: string;
  kind: 'custom';
  total: string;
  rows: CustomRowForm[];
}

type OptionForm = InstallmentsForm | CustomForm;

interface Form {
  name: string;
  cash: string;
  /** Boşsa güncel değer kullanılır */
  returnPct: string;
  inflationPct: string;
  options: OptionForm[];
}

const amountText = (v: number | null) => (v == null ? '' : v.toLocaleString('tr-TR', { maximumFractionDigits: 2 }));
const pctText = (v: number | null) => (v == null ? '' : String(v).replace('.', ','));

/** Eski kayıtlardaki yüzde satırları, taban (toplam fiyat) biliniyorsa tutara çevrilir; para girilir, yüzde değil */
function optionToForm(o: PaymentOption, cash: number | null): OptionForm {
  if (o.kind === 'installments') {
    return {
      id: o.id,
      name: o.name,
      kind: 'installments',
      down: amountText(o.downPayment),
      count: o.count == null ? '' : String(o.count),
      amountMode: o.amountMode,
      amount: amountText(o.amount),
      first: o.firstAfterMonths,
    };
  }
  const base = customBase(o, cash);
  return {
    id: o.id,
    name: o.name,
    kind: 'custom',
    total: amountText(o.totalPrice),
    rows: o.rows.map((r) => {
      const after = r.afterMonths == null ? '' : String(r.afterMonths);
      if (r.unit === 'pct' && r.value != null && base != null && base > 0) {
        return { after, value: amountText(Math.round(base * r.value) / 100), unit: 'tl' as const };
      }
      return { after, value: amountText(r.value), unit: r.unit };
    }),
  };
}

function toForm(p: PurchasePlan): Form {
  return {
    name: p.name,
    cash: amountText(p.cashPrice),
    returnPct: pctText(p.returnPct),
    inflationPct: pctText(p.inflationPct),
    options: p.options.map((o) => optionToForm(o, p.cashPrice)),
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
const intOrNull = (s: string, min: number, max: number) => {
  const v = Number(s.trim());
  return s.trim() !== '' && Number.isInteger(v) && v >= min && v <= max ? v : null;
};

/** Geçersiz ya da boş alanlar null kaydedilir; formda yazılan metin kalır */
function optionFromForm(f: OptionForm, index: number): PaymentOption {
  const name = f.name.trim() || (f.kind === 'installments' ? `Taksit ${index + 1}` : `Özel plan ${index + 1}`);
  if (f.kind === 'installments') {
    return {
      id: f.id,
      name,
      kind: 'installments',
      downPayment: amountOrNull(f.down),
      count: intOrNull(f.count, 1, 360),
      amountMode: f.amountMode,
      amount: amountOrNull(f.amount),
      firstAfterMonths: Math.min(MAX_FIRST_AFTER_MONTHS, Math.max(0, f.first)),
    };
  }
  return {
    id: f.id,
    name,
    kind: 'custom',
    totalPrice: amountOrNull(f.total),
    rows: f.rows.map((r) => ({ afterMonths: intOrNull(r.after, 0, 360), value: amountOrNull(r.value), unit: r.unit })),
  };
}

function toInput(f: Form, fallbackName: string): PurchasePlanInput {
  return {
    name: f.name.trim() || fallbackName,
    cashPrice: amountOrNull(f.cash),
    options: f.options.map(optionFromForm),
    returnPct: rateOrNull(f.returnPct),
    inflationPct: rateOrNull(f.inflationPct),
  };
}

/** Alacaklarım: alınacak bir ürünün peşin fiyatı ile ödeme seçeneklerinin (taksit, özel plan) karşılaştırması */
export function PlanView({ planId }: { planId: number }) {
  const { data, error } = usePlan(planId);
  if (error) return <p className="error">{error.message}</p>;
  if (!data) return <p className="muted">Yükleniyor…</p>;
  return <PlanEditor plan={data} />;
}

function PlanEditor({ plan }: { plan: PurchasePlan }) {
  // Form yalnızca açılışta kayıttan doldurulur; sonra kullanıcı yazdıkça kaydedilir
  const [form, setForm] = useState<Form>(() => toForm(plan));
  const [selectedId, setSelectedId] = useState<string>(() => plan.options[0]!.id);
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

  const cash = amountOrNull(form.cash);
  const options = useMemo(() => form.options.map(optionFromForm), [form.options]);
  const selected = form.options.find((o) => o.id === selectedId) ?? form.options[0]!;
  const selectedIndex = form.options.indexOf(selected);

  // Her seçeneğin takvimi ve karşılaştırması; getiri bilinmiyorsa yalnızca takvim
  const evaluated = useMemo(
    () =>
      options.map((option) => {
        const s = optionToSchedule(option, cash);
        const result =
          s.schedule && returnPct != null
            ? compareSchedule(s.schedule, { annualReturnPct: returnPct, annualInflationPct: inflationPct })
            : null;
        return { option, ...s, result };
      }),
    [options, cash, returnPct, inflationPct],
  );
  const active = evaluated[selectedIndex]!;

  const setOption = (id: string, patch: Partial<OptionForm>) =>
    setForm((f) => ({ ...f, options: f.options.map((o) => (o.id === id ? ({ ...o, ...patch } as OptionForm) : o)) }));

  const addOption = (kind: 'installments' | 'custom') => {
    const n = form.options.length + 1;
    const created = kind === 'installments' ? defaultInstallments(`Taksit ${n}`) : halved(defaultCustom(`Özel plan ${n}`), cash);
    setForm((f) => ({ ...f, options: [...f.options, optionToForm(created, cash)] }));
    setSelectedId(created.id);
  };

  const removeOption = (id: string) => {
    if (form.options.length < 2) return;
    const name = form.options.find((o) => o.id === id)?.name.trim() || 'Bu seçenek';
    if (!confirm(`"${name}" silinsin mi?`)) return;
    const rest = form.options.filter((o) => o.id !== id);
    setForm((f) => ({ ...f, options: rest }));
    setSelectedId(rest[0]!.id);
  };

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
        Ürünün peşin fiyatını girin, sonra satıcının sunduğu ödeme seçeneklerini ekleyin: eşit taksit ya da "6 ay sonra
        yarısı, 12 ay sonra yarısı" gibi özel plan. Peşin parayı faizde tutup ödemeleri oradan yapsaydınız hangisinin daha
        ucuza geleceğini hesaplar. Girdikleriniz otomatik kaydedilir.
      </p>

      <section className="panel">
        <h2>Ürün</h2>
        <div className="form-grid">
          <label>
            Peşin fiyat (TL)
            <AmountInput placeholder="100.000" value={form.cash} onChange={(v) => set({ cash: v })} />
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>Ödeme seçenekleri</h2>
        <div className="option-tabs" role="tablist" aria-label="Ödeme seçenekleri">
          {form.options.map((o, i) => (
            <button
              key={o.id}
              role="tab"
              aria-selected={o.id === selected.id}
              className={`chip${o.id === selected.id ? ' active' : ''}`}
              onClick={() => setSelectedId(o.id)}
            >
              {o.name.trim() || (o.kind === 'installments' ? `Taksit ${i + 1}` : `Özel plan ${i + 1}`)}
            </button>
          ))}
          <button className="chip ghost" onClick={() => addOption('installments')} disabled={form.options.length >= MAX_OPTIONS}>
            + Eşit taksit
          </button>
          <button className="chip ghost" onClick={() => addOption('custom')} disabled={form.options.length >= MAX_OPTIONS}>
            + Özel plan
          </button>
        </div>

        <div className="option-editor" key={selected.id}>
          <div className="option-head">
            <label className="option-name">
              Seçenek adı
              <input value={selected.name} maxLength={60} onChange={(e) => setOption(selected.id, { name: e.target.value })} />
            </label>
            {form.options.length > 1 && (
              <button className="btn danger-ghost small" onClick={() => removeOption(selected.id)}>
                Seçeneği sil
              </button>
            )}
          </div>
          {selected.kind === 'installments' ? (
            <InstallmentsFields form={selected} onChange={(patch) => setOption(selected.id, patch)} schedule={active.schedule} />
          ) : (
            <CustomFields form={selected} cash={cash} onChange={(patch) => setOption(selected.id, patch)} />
          )}
          {active.schedule && <PaymentSummary schedule={active.schedule} />}
        </div>
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
          Boş bırakırsanız güncel değerler kullanılır. Getiri:{' '}
          {current.rateKind === 'deposit'
            ? `bankaların yeni açılan TL mevduata verdiği güncel faiz (yıllık %${formatNumber(current.rateGross!)}), ayarlardaki fark ve stopaj sonrası`
            : `TCMB politika faizi${current.rateGross != null ? ` (%${formatNumber(current.rateGross)})` : ''}, ayarlardaki fark ve stopaj sonrası`}
          . Enflasyon:{' '}
          {current.inflationSource === 'survey'
            ? `TCMB Piyasa Katılımcıları Anketi'nin 12 ay sonrası beklentisi (${monthName(current.inflationMonth!)})`
            : `son 12 aylık TÜFE${current.inflationMonth ? ` (${monthName(current.inflationMonth)})` : ''}`}
          . Gelecekteki faiz ve enflasyon bilinemez; farklı oranlar deneyerek sonucun nasıl değiştiğine bakın.
        </p>
      </details>

      {evaluated.filter((e) => e.result).length > 1 && (
        <OptionsComparison
          rows={evaluated.flatMap((e) => (e.result ? [{ id: e.option.id, name: e.option.name, result: e.result }] : []))}
          selectedId={selected.id}
          onSelect={setSelectedId}
        />
      )}

      {active.problem ? (
        <p className="muted">{active.problem}</p>
      ) : returnPct == null ? (
        <p className="muted">{current.loading ? 'Güncel faiz yükleniyor…' : 'Paranın getirisi için bir oran girin.'}</p>
      ) : (
        active.result &&
        active.schedule && (
          <PlanResult
            optionName={selected.name.trim() || active.option.name}
            result={active.result}
            schedule={active.schedule}
            returnPct={returnPct}
            inflationPct={inflationPct}
            market={current.market}
          />
        )
      )}
    </div>
  );
}

/** Peşin fiyat biliniyorsa özel planın iki satırına tutarı yarı yarıya yazar */
function halved(option: CustomOption, cash: number | null): CustomOption {
  if (cash == null || cash <= 0) return option;
  const [a, b] = splitAmount(cash, 2) as [number, number];
  return { ...option, rows: option.rows.map((r, i) => ({ ...r, value: i === 0 ? a : i === 1 ? b : r.value })) };
}

const FIRST_OPTIONS = Array.from({ length: 13 }, (_, i) => i);

function InstallmentsFields(props: {
  form: InstallmentsForm;
  onChange: (patch: Partial<InstallmentsForm>) => void;
  schedule: PaymentSchedule | null;
}) {
  const { form, onChange } = props;
  const firstChoices = FIRST_OPTIONS.includes(form.first) ? FIRST_OPTIONS : [...FIRST_OPTIONS, form.first];
  const down = amountOrNull(form.down) ?? 0;
  const count = intOrNull(form.count, 1, 360);
  const amount = amountOrNull(form.amount);
  const monthly = form.amountMode === 'total' && amount != null && count ? (amount - down) / count : null;

  return (
    <>
      <div className="form-grid">
        <label>
          Peşinat (TL)
          <AmountInput placeholder="0" value={form.down} onChange={(v) => onChange({ down: v })} />
        </label>
        <label>
          Taksit sayısı
          <input type="number" inputMode="numeric" min={1} max={360} value={form.count} onChange={(e) => onChange({ count: e.target.value })} />
        </label>
        <label>
          <select
            className="label-select"
            value={form.amountMode}
            onChange={(e) => onChange({ amountMode: e.target.value as InstallmentsForm['amountMode'] })}
            aria-label="Tutar türü"
          >
            <option value="monthly">Aylık taksit (TL)</option>
            <option value="total">Taksitli toplam (TL)</option>
          </select>
          <AmountInput
            placeholder={form.amountMode === 'monthly' ? '9.500' : '114.000'}
            value={form.amount}
            onChange={(v) => onChange({ amount: v })}
          />
        </label>
        <label>
          İlk taksit
          <select value={form.first} onChange={(e) => onChange({ first: Number(e.target.value) })}>
            {firstChoices.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? 'Bugün' : `${m} ay sonra`}
              </option>
            ))}
          </select>
        </label>
      </div>
      {monthly != null && monthly > 0 && Number.isFinite(monthly) && (
        <p className="hint">Toplam peşinat dahildir: aylık taksit {formatTL(monthly)}.</p>
      )}
    </>
  );
}

/** Hızlı başlangıç şablonları: toplam fiyat eşit parçalara bölünüp hangi aylarda ödeneceği yazılır */
const PRESETS: { label: string; months: number[] }[] = [
  { label: 'Yarısı bugün, yarısı 6 ay sonra', months: [0, 6] },
  { label: 'Yarısı 6 ay, yarısı 12 ay sonra', months: [6, 12] },
  { label: 'Üç eşit parça (bugün, 6, 12 ay)', months: [0, 6, 12] },
];

/** Satırın TL karşılığı; eski kayıtlardaki yüzde satırları tabana göre. Boş ya da geçersizse 0 */
function rowAmount(row: CustomRowForm, base: number | null): number {
  const v = amountOrNull(row.value);
  if (v == null) return 0;
  return row.unit === 'pct' ? ((base ?? 0) * v) / 100 : v;
}

function CustomFields(props: { form: CustomForm; cash: number | null; onChange: (patch: Partial<CustomForm>) => void }) {
  const { form, cash, onChange } = props;
  const base = amountOrNull(form.total) ?? cash;
  const setRow = (i: number, patch: Partial<CustomRowForm>) =>
    onChange({ rows: form.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const paid = form.rows.reduce((sum, r) => sum + rowAmount(r, base), 0);
  const diff = base != null ? Math.round((base - paid) * 100) / 100 : null;
  const last = form.rows.at(-1);
  const adjusted = last && diff != null ? Math.round((rowAmount(last, base) + diff) * 100) / 100 : null;
  const equal = diff != null && Math.abs(diff) < 0.5;

  return (
    <>
      <div className="form-grid">
        <label>
          Bu plandaki toplam fiyat (TL)
          <AmountInput placeholder={cash != null ? amountText(cash) : 'Peşin fiyatla aynı'} value={form.total} onChange={(v) => onChange({ total: v })} />
        </label>
      </div>
      <p className="hint">
        İsteğe bağlı. Satıcı bu ödeme planı için peşin fiyattan farklı bir toplam istiyorsa yazın; boş bırakırsanız peşin fiyat
        kabul edilir.
      </p>

      <div className="pay-rows" role="group" aria-label="Ödeme satırları">
        <div className="pay-head" aria-hidden>
          <span>Ne zaman</span>
          <span>Ne kadar</span>
        </div>
        {form.rows.map((row, i) => {
          const after = intOrNull(row.after, 0, 360);
          return (
            <div className="pay-row" key={i}>
              <label className="pay-when">
                <span className="sr-only">{i + 1}. satır, kaç ay sonra</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={360}
                  placeholder="6"
                  value={row.after}
                  onChange={(e) => setRow(i, { after: e.target.value })}
                />
              </label>
              <span className="pay-unit">{after === 0 ? 'bugün' : `ay sonra${after != null ? ` · ${formatMonthFromNow(after)}` : ''}`}</span>
              <label className="money">
                <span className="sr-only">{i + 1}. satır, ödenecek tutar</span>
                <AmountInput placeholder="50.000" value={row.value} onChange={(v) => setRow(i, { value: v })} />
                <span className="money-unit">{row.unit === 'pct' ? '%' : 'TL'}</span>
              </label>
              <button
                className="icon-btn"
                aria-label={`${i + 1}. satırı sil`}
                title="Satırı sil"
                disabled={form.rows.length < 2}
                onClick={() => onChange({ rows: form.rows.filter((_, j) => j !== i) })}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <div className="option-actions">
        <button
          className="btn ghost small"
          disabled={form.rows.length >= 60}
          onClick={() => onChange({ rows: [...form.rows, { after: '', value: '', unit: 'tl' }] })}
        >
          + Satır ekle
        </button>
      </div>

      {base == null ? (
        <p className="hint">Ödemelerin toplam fiyatla tuttuğunu görmek için peşin fiyatı girin.</p>
      ) : (
        <div className={`pay-balance${equal ? ' ok' : ''}`}>
          <span>
            Girdiğiniz ödemeler <strong>{formatTL(paid)}</strong>, toplam fiyat <strong>{formatTL(base)}</strong>.
          </span>
          {equal ? (
            <strong className="up">✓ Tutarlar eşit</strong>
          ) : (
            diff != null && (
              <>
                <strong className="down">
                  {formatTL(Math.abs(diff))} {diff > 0 ? 'eksik' : 'fazla'}
                </strong>
                <button
                  className="btn ghost small"
                  disabled={adjusted == null || adjusted <= 0}
                  onClick={() =>
                    onChange({
                      rows: form.rows.map((r, j) => (j === form.rows.length - 1 ? { ...r, unit: 'tl', value: amountText(adjusted) } : r)),
                    })
                  }
                >
                  {diff > 0 ? 'Eksik tutarı son satıra ekle' : 'Fazla tutarı son satırdan düş'}
                </button>
              </>
            )
          )}
        </div>
      )}

      <div className="presets">
        <span className="muted small">Hızlı doldur{base == null ? ' (önce peşin fiyatı girin)' : ' (toplam fiyatı böler)'}:</span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className="chip ghost"
            disabled={base == null || base <= 0}
            onClick={() => {
              const amounts = splitAmount(base!, p.months.length);
              onChange({ rows: p.months.map((m, i) => ({ after: String(m), value: amountText(amounts[i]!), unit: 'tl' as const })) });
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
    </>
  );
}

/** Seçeneğin düz Türkçeyle ödeme özeti: ne zaman ne kadar ödeyeceğiniz */
function summaryLines(schedule: PaymentSchedule): { when: string; amount: number }[] {
  const lines: { when: string; amount: number }[] = [];
  if (schedule.upfront > 0) lines.push({ when: 'Bugün', amount: schedule.upfront });
  const p = schedule.payments;
  let i = 0;
  while (i < p.length) {
    // Aynı tutarın ardışık aylarda tekrarı tek satırda toplanır (ör. 12 taksit)
    let j = i;
    while (j + 1 < p.length && p[j + 1]!.month === p[j]!.month + 1 && p[j + 1]!.amount === p[i]!.amount) j++;
    if (j - i + 1 >= 3) {
      lines.push({
        when: `${formatMonthFromNow(p[i]!.month)} – ${formatMonthFromNow(p[j]!.month)}, her ay (${j - i + 1} ödeme)`,
        amount: p[i]!.amount,
      });
    } else {
      for (let k = i; k <= j; k++) {
        lines.push({ when: `${p[k]!.month} ay sonra (${formatMonthFromNow(p[k]!.month)})`, amount: p[k]!.amount });
      }
    }
    i = j + 1;
  }
  return lines;
}

function PaymentSummary({ schedule }: { schedule: PaymentSchedule }) {
  const total = schedule.upfront + schedule.payments.reduce((s, x) => s + x.amount, 0);
  return (
    <div className="plan-summary">
      <h3>Ne zaman ne kadar ödeyeceksiniz</h3>
      <ul>
        {summaryLines(schedule).map((l, i) => (
          <li key={i}>
            <span>{l.when}</span>
            <strong>{formatTL(l.amount)}</strong>
          </li>
        ))}
      </ul>
      <div className="plan-summary-total">
        <span>Toplam</span>
        <strong>{formatTL(total)}</strong>
      </div>
    </div>
  );
}

/** Seçenekleri yan yana: hangisi peşine göre daha ucuz */
function OptionsComparison(props: {
  rows: { id: string; name: string; result: InstallmentComparison }[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const sorted = [...props.rows].sort((a, b) => b.result.advantage - a.result.advantage);
  const best = sorted[0]!;
  const anyBeatsCash = best.result.advantage > 0;

  return (
    <section className="panel">
      <h2>Seçenekleri karşılaştır</h2>
      <p className="hint-top">
        {anyBeatsCash ? (
          <>
            Bugünün parasıyla en ucuza gelen: <strong>{best.name}</strong> ({formatTL(best.result.advantage)} avantajlı).
          </>
        ) : (
          <>Peşin alım, seçeneklerin hepsinden bugünün parasıyla daha ucuza geliyor.</>
        )}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Seçenek</th>
              <th className="num hide-narrow">Toplam ödeme</th>
              <th className="num">Bugünkü değeri</th>
              <th className="num">Peşine göre</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id} className={row.id === props.selectedId ? 'highlight' : undefined}>
                <td>
                  <button className="link-cell" onClick={() => props.onSelect(row.id)} aria-current={row.id === props.selectedId}>
                    {row.name}
                  </button>
                  {row === best && anyBeatsCash && <span className="badge">En avantajlı</span>}
                </td>
                <td className="num hide-narrow">{formatTL(row.result.totalPrice)}</td>
                <td className="num">{formatTL(row.result.presentValue)}</td>
                <td className={`num strong ${row.result.advantage >= 0 ? 'up' : 'down'}`}>
                  {row.result.advantage >= 0 ? '+' : ''}
                  {formatTL(row.result.advantage)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">Artı değer: ödemelerin bugünkü değeri peşin fiyattan düşük, yani o seçenek peşinden ucuz.</p>
    </section>
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

  const expectations = useExpectations();

  // Bankaların gerçek mevduat faizi (EVDS) varsa o, yoksa TCMB politika faizi
  const faiz = status.data?.find((s) => s.assetId === 'FAIZ');
  const rateGross = faiz?.ratePct ?? null;
  const returnPct =
    rateGross != null && settings.data
      ? netDepositRatePct(rateGross, settings.data.depositSpreadPts, settings.data.depositWithholdingPct)
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
  // İleriye dönük karşılaştırma için anketin 12 ay sonrası beklentisi, geçmiş 12 aydan daha uygundur
  const survey = expectations.data?.cpi12m ?? null;
  const inflationSource: 'survey' | 'actual' = survey ? 'survey' : 'actual';
  const inflationDefault = survey ? survey.value : inflationPct;
  const inflationMonth = survey ? survey.month : cpiMonth;

  // Gram fiyatı yerel primi içerir; onsa çevirirken çıkarılır
  const gram = status.data?.find((s) => s.assetId === 'GRAM_GOLD')?.lastPrice;
  const usdTry = status.data?.find((s) => s.assetId === 'USD')?.lastPrice;
  const market: Market | null =
    gram && usdTry && settings.data
      ? {
          goldOz: (gram / (1 + settings.data.goldPremiumPct / 100)) * (31.1034768 / usdTry),
          usdTry,
          settings: settings.data,
          expectations: expectations.data ?? null,
        }
      : null;

  return {
    rateGross,
    rateKind: faiz?.rateKind ?? null,
    returnPct,
    inflationPct: inflationDefault,
    inflationSource,
    inflationMonth,
    market,
    loading: status.isLoading || settings.isLoading,
  };
}
