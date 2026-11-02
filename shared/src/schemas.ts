import { z } from 'zod';
import { defaultInstallments } from './paymentOptions';
import type { PurchasePlanInput } from './types';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG biçiminde olmalı')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Geçersiz tarih');
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Ay YYYY-AA biçiminde olmalı');
const amount = z
  .number()
  .min(0.01, 'Tutar sıfırdan büyük olmalı')
  .max(1e12)
  .transform((v) => Math.round(v * 100) / 100);
const note = z.string().trim().max(500).nullish();

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const investmentSchema = z.object({
  name: z.string().trim().min(1, 'Ad gerekli').max(100),
  description: z.string().trim().max(1000).nullish(),
});

export const paymentSchema = z.object({ date: isoDate, amount, note });

export const bulkPaymentSchema = z
  .object({ startMonth: month, endMonth: month, day: z.number().int().min(1).max(31), amount, note })
  .refine((v) => v.startMonth <= v.endMonth, 'Başlangıç ayı bitişten sonra olamaz')
  .refine((v) => monthsBetween(v.startMonth, v.endMonth) <= 600, 'En fazla 600 ay girilebilir');

function monthsBetween(a: string, b: string) {
  const [ay, am] = a.split('-').map(Number) as [number, number];
  const [by, bm] = b.split('-').map(Number) as [number, number];
  return (by - ay) * 12 + (bm - am) + 1;
}

const pct = z.number().min(0, 'Oran negatif olamaz').max(100, 'Oran %100 üzerinde olamaz');

export const settingsSchema = z.object({
  tradingCostPct: z.object({
    gold: pct,
    fx: pct,
    interest: pct,
    inflation: pct,
    us_stock: pct,
    tr_stock: pct,
  }),
  goldPremiumPct: z.number().min(-50).max(50),
  depositWithholdingPct: pct,
  depositSpreadPts: z.number().min(-50).max(50),
  dividendWithholdingPct: z.object({ us: pct, tr: pct }),
  forecast: z
    .object({
      goldUsdOz: z.number().positive('Tahmin sıfırdan büyük olmalı').max(1e6).nullable(),
      usdTry: z.number().positive('Tahmin sıfırdan büyük olmalı').max(1e6).nullable(),
    })
    .default({ goldUsdOz: null, usdTry: null }),
});

const optionalAmount = z
  .number()
  .min(0, 'Tutar negatif olamaz')
  .max(1e12)
  .transform((v) => Math.round(v * 100) / 100)
  .nullable();
const optionalRate = z.number().min(-100).max(1000).nullable();

const optionId = z.string().trim().min(1).max(40);
const optionName = z.string().trim().min(1, 'Seçenek adı gerekli').max(60);

const installmentsOptionSchema = z.object({
  id: optionId,
  name: optionName,
  kind: z.literal('installments'),
  downPayment: optionalAmount,
  count: z.number().int().min(1).max(360).nullable(),
  amountMode: z.enum(['monthly', 'total']),
  amount: optionalAmount,
  firstAfterMonths: z.number().int().min(0).max(60),
});

const customRowSchema = z.object({
  afterMonths: z.number().int().min(0).max(360).nullable(),
  value: optionalAmount,
  unit: z.enum(['tl', 'pct']),
});

const customOptionSchema = z.object({
  id: optionId,
  name: optionName,
  kind: z.literal('custom'),
  totalPrice: optionalAmount,
  rows: z.array(customRowSchema).max(60, 'En fazla 60 ödeme satırı girilebilir'),
});

export const paymentOptionSchema = z.discriminatedUnion('kind', [installmentsOptionSchema, customOptionSchema]);

/** Alınacak ürün: eksik alanlar null olabilir, kullanıcı doldurdukça kaydedilir */
export const purchasePlanSchema = z.object({
  name: z.string().trim().min(1, 'Ad gerekli').max(100),
  cashPrice: optionalAmount,
  options: z
    .array(paymentOptionSchema)
    .min(1, 'En az bir ödeme seçeneği olmalı')
    .max(8, 'En fazla 8 ödeme seçeneği eklenebilir')
    .refine((list) => new Set(list.map((o) => o.id)).size === list.length, 'Seçenek kimlikleri benzersiz olmalı'),
  returnPct: optionalRate,
  inflationPct: optionalRate,
});

export const newPurchasePlan = (name: string): PurchasePlanInput => ({
  name,
  cashPrice: null,
  options: [defaultInstallments()],
  returnPct: null,
  inflationPct: null,
});
