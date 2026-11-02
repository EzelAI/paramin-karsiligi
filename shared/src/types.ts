/** ISO tarih: YYYY-MM-DD */
export type IsoDate = string;

export interface Investment {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
}

export interface Payment {
  id: number;
  investmentId: number;
  date: IsoDate;
  /** Ödenen tutar (TL) */
  amount: number;
  note: string | null;
}

export interface InvestmentWithPayments extends Investment {
  payments: Payment[];
}

export interface InvestmentInput {
  name: string;
  description?: string | null;
}

export interface PaymentInput {
  date: IsoDate;
  amount: number;
  note?: string | null;
}

/** Belirli aylar için aynı tutarda toplu ödeme girişi */
export interface BulkPaymentInput {
  /** YYYY-MM */
  startMonth: string;
  /** YYYY-MM (dahil) */
  endMonth: string;
  /** Ayın kaçında ödendiği (1-31, ay sonunu aşarsa ayın son günü) */
  day: number;
  amount: number;
  note?: string | null;
}

/** Eşit taksit: peşinat + aylık eşit taksitler */
export interface InstallmentsOption {
  /** İstemcinin ürettiği kısa kimlik (seçenekler arasında benzersiz) */
  id: string;
  name: string;
  kind: 'installments';
  downPayment: number | null;
  count: number | null;
  /** amount aylık taksit mi, peşinat dahil taksitli toplam mı */
  amountMode: 'monthly' | 'total';
  amount: number | null;
  /** İlk taksit kaç ay sonra (0 = bugün) */
  firstAfterMonths: number;
}

/** Özel ödeme planı satırı: "6 ay sonra %50" ya da "12 ay sonra 40.000 TL" */
export interface CustomPaymentRow {
  /** Bugünden kaç ay sonra (0 = bugün) */
  afterMonths: number | null;
  value: number | null;
  /** value TL mi, bu seçeneğin toplam fiyatının yüzdesi mi */
  unit: 'tl' | 'pct';
}

/** Özel ödeme planı: ör. yarısı bugün, yarısı 6 ay sonra */
export interface CustomOption {
  id: string;
  name: string;
  kind: 'custom';
  /** Bu seçenekteki toplam fiyat (yüzde satırlarının tabanı); null ise peşin fiyat */
  totalPrice: number | null;
  rows: CustomPaymentRow[];
}

export type PaymentOption = InstallmentsOption | CustomOption;

/**
 * Alınacak bir ürün için peşin fiyat ve alternatif ödeme seçenekleri ("Alacaklarım"). Tutarlar TL; girilmemiş
 * alanlar null. Hesap shared/src/installment.ts içinde, arayüzde yapılır.
 */
export interface PurchasePlan {
  id: number;
  name: string;
  cashPrice: number | null;
  options: PaymentOption[];
  /** Elle girilen yıllık net getiri ve enflasyon (%); null ise güncel değer kullanılır */
  returnPct: number | null;
  inflationPct: number | null;
  createdAt: string;
}

export type PurchasePlanInput = Omit<PurchasePlan, 'id' | 'createdAt'>;

export interface PriceStatus {
  assetId: string;
  firstDate: IsoDate | null;
  lastDate: IsoDate | null;
  lastPrice: number | null;
  lastFetchedAt: string | null;
  /** Faiz tipi varlıklarda güncel yıllık faiz (%) */
  ratePct: number | null;
  /** ratePct hangi faiz: bankaların gerçek mevduat faizi ('deposit') ya da TCMB politika faizi ('policy') */
  rateKind: 'deposit' | 'policy' | null;
  /** Döviz varlıklarında TCMB resmî kuruyla çapraz kontrol (EVDS anahtarı yoksa null) */
  official: { price: number; date: string; deviationPct: number } | null;
  /** Ham kaynağın son tarihi (faizde son karar, TÜFE'de son açıklanan ay) */
  sourceLastDate: string | null;
}

export interface PricePoint {
  /** YYYY-MM-DD (piyasanın yerel tarihi) */
  date: string;
  close: number;
}
