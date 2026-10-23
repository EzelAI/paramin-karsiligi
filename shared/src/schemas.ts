import { z } from 'zod';

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
});

const optionalAmount = z
  .number()
  .min(0, 'Tutar negatif olamaz')
  .max(1e12)
  .transform((v) => Math.round(v * 100) / 100)
  .nullable();
const optionalRate = z.number().min(-100).max(1000).nullable();

/** Alınacak ürün: eksik alanlar null olabilir, kullanıcı doldurdukça kaydedilir */
export const purchasePlanSchema = z.object({
  name: z.string().trim().min(1, 'Ad gerekli').max(100),
  cashPrice: optionalAmount,
  downPayment: optionalAmount,
  count: z.number().int().min(1).max(360).nullable(),
  amountMode: z.enum(['monthly', 'total']),
  amount: optionalAmount,
  firstAfterMonths: z.union([z.literal(0), z.literal(1)]),
  returnPct: optionalRate,
  inflationPct: optionalRate,
});

export const newPurchasePlan = (name: string) => ({
  name,
  cashPrice: null,
  downPayment: null,
  count: 12,
  amountMode: 'monthly' as const,
  amount: null,
  firstAfterMonths: 1 as const,
  returnPct: null,
  inflationPct: null,
});
