/**
 * Peşin mi, taksit mi? Gelecekte alınacak bir ürün için peşin fiyat ile ileri tarihli ödeme planını karşılaştırır.
 *
 * Model: Peşin fiyat kadar paranız var. Plana göre alırsanız bugün ödenecek kısmı (peşinat) hemen ödeyip kalanını getiri
 * getiren bir yerde (mevduat) tutar, sonraki ödemeleri oradan yaparsınız. Ödemelerin bugünkü değeri peşin fiyattan
 * düşükse plan avantajlıdır. Süreler ay cinsindendir (0 = bugün).
 *
 * Eşit taksit de özel plan da (ör. "6 ay sonra yarısı, 12 ay sonra yarısı") aynı takvime (PaymentSchedule) çevrilir;
 * hesap yalnızca takvim üzerinden yapılır.
 */

/** Bugünden sonraki bir ödeme */
export interface SchedulePayment {
  /** Bugünden kaç ay sonra (1 ve üstü) */
  month: number;
  amount: number;
}

/** Ödeme takvimi: bugün ödenen tutar ve sonraki aylardaki ödemeler */
export interface PaymentSchedule {
  /** Peşin fiyat (TL) */
  cashPrice: number;
  /** Bugün (ay 0) ödenen toplam tutar: peşinat ve bugüne denk gelen ödemeler */
  upfront: number;
  /** Bugünden sonraki ödemeler; aya göre sıralı, her ay tek satır */
  payments: SchedulePayment[];
}

/** Eşit taksitli teklif (eski ve basit giriş biçimi) */
export interface InstallmentOffer {
  /** Peşin fiyat (TL) */
  cashPrice: number;
  /** Taksitli alımda bugün ödenen peşinat (TL) */
  downPayment: number;
  /** Taksit sayısı */
  count: number;
  /** Aylık taksit tutarı (TL) */
  installment: number;
  /** İlk taksit kaç ay sonra (0 = bugün, 1 = bir ay sonra) */
  firstAfterMonths: number;
}

export interface InstallmentAssumptions {
  /** Paranın alternatif getirisi: yıllık net faiz (%, günlük bileşik) */
  annualReturnPct: number;
  /** Beklenen yıllık enflasyon (%); bilinmiyorsa null */
  annualInflationPct: number | null;
}

export interface InstallmentRow {
  /** Bugünden kaç ay sonra */
  month: number;
  amount: number;
  /** Getiriyle iskonto edilmiş bugünkü değer */
  presentValue: number;
  /** Enflasyonla bugünün parasına çevrilmiş değer */
  realValue: number | null;
  /** Peşin parayı mevduata koyup bu ödemeyi yaptıktan sonra kalan bakiye */
  balanceAfter: number;
}

export interface InstallmentComparison {
  /** Bugün ödenen tutar (satırlara dahil değildir) */
  upfront: number;
  /** Bugün ödenen ve sonraki ödemelerin toplamı */
  totalPrice: number;
  /** Planın toplamının peşin fiyattan farkı (TL ve oran) */
  markup: number;
  markupPct: number;
  /** Ödemelerin (bugün ödenen dahil) bugünkü değeri */
  presentValue: number;
  /** Peşin fiyat − bugünkü değer: pozitifse plan, negatifse peşin avantajlı */
  advantage: number;
  /** Peşin parayı mevduata koyup ödemeleri oradan yapınca son ödemeden sonra kalan (negatifse eksik) */
  endBalance: number;
  /** Planın içindeki faiz (aylık ve yıllık bileşik); hesaplanamazsa null */
  impliedMonthlyRate: number | null;
  impliedAnnualRate: number | null;
  /** Alternatif getirinin aylık ve yıllık bileşik karşılığı */
  returnMonthlyRate: number;
  returnAnnualRate: number;
  /** Ödemelerin (bugün ödenen dahil) enflasyona göre bugünün parasıyla toplamı */
  realTotal: number | null;
  rows: InstallmentRow[];
}

/** Yıllık nominal faiz (%, günlük bileşik) → aylık oran. Uygulamadaki mevduat endeksiyle aynı varsayım. */
export function monthlyFromDailyCompounded(annualPct: number): number {
  return Math.pow(1 + annualPct / 100 / 365, 365 / 12) - 1;
}

/** Yıllık bileşik oran (%) → aylık oran */
export function monthlyFromEffective(annualPct: number): number {
  return Math.pow(1 + annualPct / 100, 1 / 12) - 1;
}

/** Politika faizinden ayarlardaki fark ve stopajla net mevduat faizi (%) */
export function netDepositRatePct(policyPct: number, spreadPts: number, withholdingPct: number): number {
  return Math.max(0, policyPct + spreadPts) * (1 - withholdingPct / 100);
}

function discount(amount: number, monthlyRate: number, month: number) {
  return amount / Math.pow(1 + monthlyRate, month);
}

/**
 * Ay ve tutar listesinden takvim kurar: bugüne (ay 0) denk gelenler peşine eklenir, aynı aydaki ödemeler birleşir,
 * sonuç aya göre sıralanır.
 */
export function buildPaymentSchedule(cashPrice: number, items: readonly SchedulePayment[], downPayment = 0): PaymentSchedule {
  let upfront = downPayment;
  const byMonth = new Map<number, number>();
  for (const { month, amount } of items) {
    if (month <= 0) upfront += amount;
    else byMonth.set(month, (byMonth.get(month) ?? 0) + amount);
  }
  const payments = [...byMonth.entries()].sort((a, b) => a[0] - b[0]).map(([month, amount]) => ({ month, amount }));
  return { cashPrice, upfront, payments };
}

/** Eşit taksitli teklifi takvime çevirir */
export function scheduleFromInstallments(offer: InstallmentOffer): PaymentSchedule {
  const items = Array.from({ length: offer.count }, (_, i) => ({ month: offer.firstAfterMonths + i, amount: offer.installment }));
  return buildPaymentSchedule(offer.cashPrice, items, offer.downPayment);
}

/**
 * Planın aylık faizi: (peşin − bugün ödenen) = Σ ödeme / (1+m)^ay denklemini çözer.
 * Toplam peşinden düşükse oran negatif çıkar. Finanse edilen tutar ya da sonraki ödeme yoksa null.
 */
export function impliedMonthlyRate(schedule: PaymentSchedule): number | null {
  const financed = schedule.cashPrice - schedule.upfront;
  if (financed <= 0 || schedule.payments.length === 0) return null;
  // f(m) m'ye göre azalan
  const f = (m: number) => schedule.payments.reduce((s, p) => s + discount(p.amount, m, p.month), 0) - financed;

  let lo = -0.99;
  let hi = 1;
  while (f(hi) > 0 && hi < 1e4) hi *= 2;
  if (f(lo) < 0 || f(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-12) break;
  }
  return (lo + hi) / 2;
}

/**
 * Peşin paranın (bugün ödenen düşülmüş) aylık sabit getirili bir yerde tutulup ödemelerin oradan yapıldığı durum.
 * costRate: alırken kesilen alım-satım maliyeti (ör. altın için 0,01). Her ödemeden sonraki bakiyeyi döndürür.
 */
export function simulateHolding(schedule: PaymentSchedule, monthlyRate: number, costRate = 0): number[] {
  let balance = (schedule.cashPrice - schedule.upfront) * (1 - costRate);
  let lastMonth = 0;
  return schedule.payments.map(({ month, amount }) => {
    balance *= Math.pow(1 + monthlyRate, month - lastMonth);
    lastMonth = month;
    balance -= amount;
    return balance;
  });
}

export function compareSchedule(schedule: PaymentSchedule, assumptions: InstallmentAssumptions): InstallmentComparison {
  const r = monthlyFromDailyCompounded(assumptions.annualReturnPct);
  const p = assumptions.annualInflationPct == null ? null : monthlyFromEffective(assumptions.annualInflationPct);

  const balances = simulateHolding(schedule, r);
  const rows: InstallmentRow[] = schedule.payments.map(({ month, amount }, i) => ({
    month,
    amount,
    presentValue: discount(amount, r, month),
    realValue: p == null ? null : discount(amount, p, month),
    balanceAfter: balances[i]!,
  }));

  const totalPrice = schedule.upfront + schedule.payments.reduce((s, x) => s + x.amount, 0);
  const presentValue = schedule.upfront + rows.reduce((s, row) => s + row.presentValue, 0);
  const monthly = impliedMonthlyRate(schedule);

  return {
    upfront: schedule.upfront,
    totalPrice,
    markup: totalPrice - schedule.cashPrice,
    markupPct: schedule.cashPrice > 0 ? (totalPrice - schedule.cashPrice) / schedule.cashPrice : 0,
    presentValue,
    advantage: schedule.cashPrice - presentValue,
    endBalance: balances.at(-1) ?? schedule.cashPrice - schedule.upfront,
    impliedMonthlyRate: monthly,
    impliedAnnualRate: monthly == null ? null : Math.pow(1 + monthly, 12) - 1,
    returnMonthlyRate: r,
    returnAnnualRate: Math.pow(1 + r, 12) - 1,
    realTotal: p == null ? null : schedule.upfront + rows.reduce((s, row) => s + row.realValue!, 0),
    rows,
  };
}

/** Eşit taksitli teklif için kısayol: takvime çevirip karşılaştırır */
export function compareInstallment(offer: InstallmentOffer, assumptions: InstallmentAssumptions): InstallmentComparison {
  return compareSchedule(scheduleFromInstallments(offer), assumptions);
}
