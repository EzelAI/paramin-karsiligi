/**
 * Peşin mi, taksit mi? Gelecekte alınacak bir ürün için peşin fiyat ile taksitli teklifi karşılaştırır.
 *
 * Model: Peşin fiyat kadar paranız var. Taksitli alırsanız peşinatı bugün ödeyip kalanını getiri getiren bir yerde
 * (mevduat) tutar, taksitleri oradan ödersiniz. Taksitlerin bugünkü değeri peşin fiyattan düşükse taksit avantajlıdır.
 * Süreler ay cinsindendir (0 = bugün).
 */
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
  /** Peşinat + taksitler toplamı */
  totalPrice: number;
  /** Taksitli toplamın peşin fiyattan farkı (TL ve oran) */
  markup: number;
  markupPct: number;
  /** Taksitlerin (peşinat dahil) bugünkü değeri */
  presentValue: number;
  /** Peşin fiyat − bugünkü değer: pozitifse taksit, negatifse peşin avantajlı */
  advantage: number;
  /** Peşin parayı mevduata koyup taksitleri oradan ödeyince son taksitten sonra kalan (negatifse eksik) */
  endBalance: number;
  /** Taksitli teklifin içindeki faiz (aylık ve yıllık bileşik); hesaplanamazsa null */
  impliedMonthlyRate: number | null;
  impliedAnnualRate: number | null;
  /** Alternatif getirinin aylık ve yıllık bileşik karşılığı */
  returnMonthlyRate: number;
  returnAnnualRate: number;
  /** Taksitlerin (peşinat dahil) enflasyona göre bugünün parasıyla toplamı */
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

function monthsOf(offer: InstallmentOffer): number[] {
  return Array.from({ length: offer.count }, (_, i) => offer.firstAfterMonths + i);
}

/**
 * Taksitli teklifin aylık faizi: (peşin − peşinat) = Σ taksit / (1+m)^ay denklemini çözer.
 * Taksitli toplam peşinden düşükse oran negatif çıkar. Finanse edilen tutar yoksa null.
 */
export function impliedMonthlyRate(offer: InstallmentOffer): number | null {
  const financed = offer.cashPrice - offer.downPayment;
  if (financed <= 0 || offer.count <= 0 || offer.installment <= 0) return null;
  const months = monthsOf(offer);
  // Bugün ödenen taksitler iskontodan etkilenmez; f(m) m'ye göre azalan
  const f = (m: number) => months.reduce((s, k) => s + discount(offer.installment, m, k), 0) - financed;

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

export function compareInstallment(offer: InstallmentOffer, assumptions: InstallmentAssumptions): InstallmentComparison {
  const r = monthlyFromDailyCompounded(assumptions.annualReturnPct);
  const p = assumptions.annualInflationPct == null ? null : monthlyFromEffective(assumptions.annualInflationPct);

  const rows: InstallmentRow[] = [];
  let balance = offer.cashPrice - offer.downPayment;
  let lastMonth = 0;
  for (const month of monthsOf(offer)) {
    balance *= Math.pow(1 + r, month - lastMonth);
    lastMonth = month;
    balance -= offer.installment;
    rows.push({
      month,
      amount: offer.installment,
      presentValue: discount(offer.installment, r, month),
      realValue: p == null ? null : discount(offer.installment, p, month),
      balanceAfter: balance,
    });
  }

  const totalPrice = offer.downPayment + offer.count * offer.installment;
  const presentValue = offer.downPayment + rows.reduce((s, row) => s + row.presentValue, 0);
  const monthly = impliedMonthlyRate(offer);

  return {
    totalPrice,
    markup: totalPrice - offer.cashPrice,
    markupPct: offer.cashPrice > 0 ? (totalPrice - offer.cashPrice) / offer.cashPrice : 0,
    presentValue,
    advantage: offer.cashPrice - presentValue,
    endBalance: balance,
    impliedMonthlyRate: monthly,
    impliedAnnualRate: monthly == null ? null : Math.pow(1 + monthly, 12) - 1,
    returnMonthlyRate: r,
    returnAnnualRate: Math.pow(1 + r, 12) - 1,
    realTotal: p == null ? null : offer.downPayment + rows.reduce((s, row) => s + row.realValue!, 0),
    rows,
  };
}
