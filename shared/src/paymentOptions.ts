import { buildPaymentSchedule, type PaymentSchedule } from './installment';
import type { CustomOption, InstallmentsOption, PaymentOption, PurchasePlan } from './types';

/**
 * Alacaklarım: bir ürünün ödeme seçenekleri. Seçenek ya eşit taksittir ya da özel plandır (ör. "6 ay sonra yarısı,
 * 12 ay sonra yarısı"). İkisi de optionToSchedule ile aynı ödeme takvimine çevrilir.
 */

/** Seçenekler arasında benzersiz, istemcide üretilen kısa kimlik */
export function newOptionId(): string {
  return `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export const defaultInstallments = (name = 'Taksit'): InstallmentsOption => ({
  id: newOptionId(),
  name,
  kind: 'installments',
  downPayment: null,
  count: 12,
  amountMode: 'monthly',
  amount: null,
  firstAfterMonths: 1,
});

/**
 * Başlangıç satırları: 6 ve 12 ay sonra, tutarlar boş. Arayüz peşin fiyat biliniyorsa tutarları yarı yarıya doldurur
 * (bkz. splitAmount).
 */
export const defaultCustom = (name = 'Özel plan'): CustomOption => ({
  id: newOptionId(),
  name,
  kind: 'custom',
  totalPrice: null,
  rows: [
    { afterMonths: 6, value: null, unit: 'tl' },
    { afterMonths: 12, value: null, unit: 'tl' },
  ],
});

/** Toplamı kuruş hassasiyetinde n parçaya böler; kuruş farkı son parçaya eklenir ve toplam tam tutar */
export function splitAmount(total: number, parts: number): number[] {
  const cents = Math.round(total * 100);
  const each = Math.floor(cents / parts);
  return Array.from({ length: parts }, (_, i) => (i === parts - 1 ? cents - each * (parts - 1) : each) / 100);
}

/** Özel planda yüzdelerin ve "kalan" hesabının tabanı: seçeneğe özel toplam fiyat, yoksa peşin fiyat */
export const customBase = (option: CustomOption, cashPrice: number | null): number | null => option.totalPrice ?? cashPrice;

export const MAX_INSTALLMENTS = 360;
export const MAX_FIRST_AFTER_MONTHS = 60;
export const MAX_CUSTOM_MONTHS = 360;

export interface ScheduleResult {
  /** Seçenek hesaplanabiliyorsa takvim; eksik ya da geçersizse null */
  schedule: PaymentSchedule | null;
  /** Hesaplanamama nedeni (kullanıcıya gösterilir); schedule varsa null */
  problem: string | null;
}

const fail = (problem: string): ScheduleResult => ({ schedule: null, problem });

/** Seçeneği, peşin fiyata göre ödeme takvimine çevirir. Eksik ya da geçersiz girişi nedeniyle birlikte döndürür. */
export function optionToSchedule(option: PaymentOption, cashPrice: number | null): ScheduleResult {
  if (!(cashPrice != null && cashPrice > 0)) return fail('Peşin fiyatı girin.');
  return option.kind === 'installments' ? installmentsSchedule(option, cashPrice) : customSchedule(option, cashPrice);
}

function installmentsSchedule(o: InstallmentsOption, cash: number): ScheduleResult {
  if (!(o.amount != null && o.amount > 0)) {
    return fail(o.amountMode === 'monthly' ? 'Aylık taksit tutarını girin.' : 'Taksitli toplam tutarı girin.');
  }
  const count = o.count;
  if (count == null || !Number.isInteger(count) || count < 1 || count > MAX_INSTALLMENTS) {
    return fail(`Taksit sayısı 1 ile ${MAX_INSTALLMENTS} arasında olmalı.`);
  }
  const down = o.downPayment ?? 0;
  if (down >= cash) return fail('Peşinat peşin fiyattan az olmalı.');
  if (!Number.isInteger(o.firstAfterMonths) || o.firstAfterMonths < 0 || o.firstAfterMonths > MAX_FIRST_AFTER_MONTHS) {
    return fail(`İlk taksit 0 ile ${MAX_FIRST_AFTER_MONTHS} ay sonra olmalı.`);
  }
  const installment = o.amountMode === 'monthly' ? o.amount : (o.amount - down) / count;
  if (!(installment > 0)) return fail('Taksitli toplam fiyat peşinattan büyük olmalı.');

  const items = Array.from({ length: count }, (_, i) => ({ month: o.firstAfterMonths + i, amount: installment }));
  return { schedule: buildPaymentSchedule(cash, items, down), problem: null };
}

function customSchedule(o: CustomOption, cash: number): ScheduleResult {
  if (o.totalPrice != null && !(o.totalPrice > 0)) return fail('Toplam fiyat sıfırdan büyük olmalı.');
  if (o.rows.length === 0) return fail('En az bir ödeme satırı ekleyin.');
  const base = customBase(o, cash)!;

  const items: { month: number; amount: number }[] = [];
  for (const [i, row] of o.rows.entries()) {
    const no = i + 1;
    if (row.afterMonths == null || !Number.isInteger(row.afterMonths) || row.afterMonths < 0 || row.afterMonths > MAX_CUSTOM_MONTHS) {
      return fail(`${no}. satır için kaç ay sonra ödeneceğini girin (0 = bugün).`);
    }
    if (!(row.value != null && row.value > 0)) {
      return fail(`${no}. satır için ${row.unit === 'pct' ? 'yüzdeyi' : 'tutarı'} girin.`);
    }
    if (row.unit === 'pct' && row.value > 100) return fail(`${no}. satırdaki yüzde 100'ü aşamaz.`);
    items.push({ month: row.afterMonths, amount: row.unit === 'pct' ? (base * row.value) / 100 : row.value });
  }

  return { schedule: buildPaymentSchedule(cash, items), problem: null };
}

/** Eski tek teklif sütunları (seçenek özelliğinden önceki kayıtlar) */
interface LegacyOffer {
  downPayment?: number | null;
  count?: number | null;
  amountMode?: 'monthly' | 'total';
  amount?: number | null;
  firstAfterMonths?: number;
}

export type RawPlan = Omit<PurchasePlan, 'options'> & LegacyOffer & { options?: PaymentOption[] | null };

/**
 * Kaydı güncel biçime getirir. Seçenek listesi varsa olduğu gibi alınır; yoksa (eski kayıt) eski teklif alanları
 * tek bir eşit taksit seçeneğine çevrilir. Kimlik sabittir, kayıt okundukça değişmez.
 */
export function normalizePlan(raw: RawPlan): PurchasePlan {
  const options =
    raw.options && raw.options.length > 0
      ? raw.options
      : [
          {
            ...defaultInstallments(),
            id: 'taksit-1',
            downPayment: raw.downPayment ?? null,
            count: raw.count ?? 12,
            amountMode: raw.amountMode ?? 'monthly',
            amount: raw.amount ?? null,
            firstAfterMonths: raw.firstAfterMonths ?? 1,
          },
        ];
  return {
    id: raw.id,
    name: raw.name,
    cashPrice: raw.cashPrice,
    options,
    returnPct: raw.returnPct,
    inflationPct: raw.inflationPct,
    createdAt: raw.createdAt,
  };
}
