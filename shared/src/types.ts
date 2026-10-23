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

export interface PriceStatus {
  assetId: string;
  firstDate: IsoDate | null;
  lastDate: IsoDate | null;
  lastPrice: number | null;
  lastFetchedAt: string | null;
  /** Faiz tipi varlıklarda güncel yıllık faiz (%) */
  ratePct: number | null;
  /** Ham kaynağın son tarihi (faizde son karar, TÜFE'de son açıklanan ay) */
  sourceLastDate: string | null;
}

export interface PricePoint {
  /** YYYY-MM-DD (piyasanın yerel tarihi) */
  date: string;
  close: number;
}
