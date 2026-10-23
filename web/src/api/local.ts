import {
  bulkPaymentSchema,
  dateInMonth,
  DEFAULT_SETTINGS,
  investmentSchema,
  isAssetId,
  monthRange,
  paymentSchema,
  PriceCalculator,
  settingsSchema,
  withDefaults,
  type Investment,
  type Payment,
  type PaymentInput,
  type PriceSnapshot,
  type Settings,
} from '@paramin-karsiligi/shared';
import type { ZodType } from 'zod';
import { saveFile } from '../lib/download';
import { readItem, writeItem } from '../lib/storage';
import type { Api } from './http';

/**
 * GitHub Pages sürümünün API'si: sunucu yerine tarayıcıda çalışır.
 * Yatırımlar ve ödemeler yalnızca bu sekmenin sessionStorage'ında tutulur (sekme kapanınca silinir);
 * fiyatlar GitHub Actions'ın her gün ürettiği data/prices.json dosyasından okunur.
 */

const STORE_KEY = 'paramin-karsiligi.session';

interface Store {
  nextId: number;
  investments: Investment[];
  payments: Payment[];
  settings: Settings;
}

const store: Store = (() => {
  const saved = readItem<Store>(STORE_KEY);
  return saved
    ? { ...saved, settings: withDefaults(saved.settings) }
    : { nextId: 1, investments: [], payments: [], settings: DEFAULT_SETTINGS };
})();

const persist = () => writeItem(STORE_KEY, store);
const newId = () => store.nextId++;

/** Sunucudaki doğrulamanın aynısı; hata mesajları da aynı biçimde */
function parse<T>(schema: ZodType<T, any, any>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new Error(r.error.issues.map((i) => i.message).join(', '));
  return r.data;
}

function requireInvestment(id: number): Investment {
  const inv = store.investments.find((i) => i.id === id);
  if (!inv) throw new Error('Yatırım bulunamadı');
  return inv;
}

function requirePayment(id: number): Payment {
  const p = store.payments.find((x) => x.id === id);
  if (!p) throw new Error('Ödeme bulunamadı');
  return p;
}

const paymentsOf = (investmentId: number) =>
  store.payments
    .filter((p) => p.investmentId === investmentId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

function addPayments(investmentId: number, inputs: PaymentInput[]): Payment[] {
  const created = inputs.map((p) => ({
    id: newId(),
    investmentId,
    date: p.date,
    amount: p.amount,
    note: p.note ?? null,
  }));
  store.payments.push(...created);
  persist();
  return created;
}

// Fiyatlar
let prices: Promise<PriceCalculator> | null = null;

function loadPrices(reload = false): Promise<PriceCalculator> {
  if (reload || !prices) {
    prices = fetch(`${import.meta.env.BASE_URL}data/prices.json`, { cache: reload ? 'no-cache' : 'default' })
      .then((res) => {
        if (!res.ok) throw new Error(`Fiyat verisi alınamadı (${res.status})`);
        return res.json() as Promise<PriceSnapshot>;
      })
      .then(
        (snap) =>
          new PriceCalculator(
            {
              series: (key) => snap.series[key] ?? { dates: [], values: [] },
              lastFetchedAt: (key) => snap.series[key]?.fetchedAt ?? null,
            },
            () => store.settings,
          ),
      );
    // Hata olursa bir sonraki istekte yeniden denensin
    prices.catch(() => (prices = null));
  }
  return prices;
}

export const localApi: Api = {
  listInvestments: async () => [...store.investments],
  getInvestment: async (id) => ({ ...requireInvestment(id), payments: paymentsOf(id) }),
  createInvestment: async (input) => {
    const v = parse(investmentSchema, input);
    const inv: Investment = {
      id: newId(),
      name: v.name,
      description: v.description ?? null,
      createdAt: new Date().toISOString(),
    };
    store.investments.push(inv);
    persist();
    return inv;
  },
  updateInvestment: async (id, input) => {
    const inv = requireInvestment(id);
    const v = parse(investmentSchema, input);
    Object.assign(inv, { name: v.name, description: v.description ?? null });
    persist();
    return inv;
  },
  deleteInvestment: async (id) => {
    requireInvestment(id);
    store.investments = store.investments.filter((i) => i.id !== id);
    store.payments = store.payments.filter((p) => p.investmentId !== id);
    persist();
  },

  addPayment: async (investmentId, input) => {
    requireInvestment(investmentId);
    return addPayments(investmentId, [parse(paymentSchema, input)])[0]!;
  },
  addBulkPayments: async (investmentId, input) => {
    requireInvestment(investmentId);
    const b = parse(bulkPaymentSchema, input);
    return addPayments(
      investmentId,
      monthRange(b.startMonth, b.endMonth).map((m) => ({ date: dateInMonth(m, b.day), amount: b.amount, note: b.note })),
    );
  },
  updatePayment: async (id, input) => {
    const p = requirePayment(id);
    const v = parse(paymentSchema, input);
    Object.assign(p, { date: v.date, amount: v.amount, note: v.note ?? null });
    persist();
    return p;
  },
  deletePayment: async (id) => {
    requirePayment(id);
    store.payments = store.payments.filter((p) => p.id !== id);
    persist();
  },

  getAnalysis: async (id) => {
    requireInvestment(id);
    return (await loadPrices()).analyze(paymentsOf(id));
  },
  exportExcel: async (id) => {
    const inv = requireInvestment(id);
    const analysis = (await loadPrices()).analyze(paymentsOf(id));
    // exceljs büyük; yalnızca Excel'e aktarılırken yüklenir
    const { buildInvestmentWorkbook, exportFilename } = await import('@paramin-karsiligi/shared/excel');
    const data = await buildInvestmentWorkbook(inv, analysis, store.settings);
    const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    saveFile(new Blob([data], { type }), exportFilename(inv));
  },

  getSettings: async () => store.settings,
  saveSettings: async (s) => {
    store.settings = parse(settingsSchema, s);
    persist();
    (await loadPrices()).invalidate();
    return store.settings;
  },

  priceStatus: async () => (await loadPrices()).status(),
  refreshPrices: async () => (await loadPrices(true)).status(),
  monthlyPrices: async (assetId, from) => {
    if (!isAssetId(assetId)) throw new Error('Bilinmeyen varlık');
    return (await loadPrices()).monthly(assetId, from);
  },
};
