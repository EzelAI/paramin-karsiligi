import type {
  AssetId,
  BulkPaymentInput,
  Investment,
  InvestmentAnalysis,
  InvestmentInput,
  InvestmentWithPayments,
  Payment,
  PaymentInput,
  PriceStatus,
  PurchasePlan,
  PurchasePlanInput,
  Settings,
} from '@paramin-karsiligi/shared';
import { saveFile } from '../lib/download';

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `İstek başarısız (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

/** Yerel sunucu (npm start / npm run dev) üzerinden çalışan API */
export const httpApi = {
  listInvestments: () => request<Investment[]>('GET', '/api/investments'),
  getInvestment: (id: number) => request<InvestmentWithPayments>('GET', `/api/investments/${id}`),
  createInvestment: (input: InvestmentInput) => request<Investment>('POST', '/api/investments', input),
  updateInvestment: (id: number, input: InvestmentInput) => request<Investment>('PUT', `/api/investments/${id}`, input),
  deleteInvestment: (id: number) => request<void>('DELETE', `/api/investments/${id}`),

  addPayment: (investmentId: number, input: PaymentInput) =>
    request<Payment>('POST', `/api/investments/${investmentId}/payments`, input),
  addBulkPayments: (investmentId: number, input: BulkPaymentInput) =>
    request<Payment[]>('POST', `/api/investments/${investmentId}/payments/bulk`, input),
  updatePayment: (id: number, input: PaymentInput) => request<Payment>('PUT', `/api/payments/${id}`, input),
  deletePayment: (id: number) => request<void>('DELETE', `/api/payments/${id}`),

  getAnalysis: (id: number) => request<InvestmentAnalysis>('GET', `/api/investments/${id}/analysis`),
  // Dosya adını sunucu belirler (Content-Disposition)
  exportExcel: async (id: number) => saveFile(`/api/investments/${id}/export.xlsx`, ''),

  listPlans: () => request<PurchasePlan[]>('GET', '/api/plans'),
  getPlan: (id: number) => request<PurchasePlan>('GET', `/api/plans/${id}`),
  createPlan: (input: PurchasePlanInput) => request<PurchasePlan>('POST', '/api/plans', input),
  updatePlan: (id: number, input: PurchasePlanInput) => request<PurchasePlan>('PUT', `/api/plans/${id}`, input),
  deletePlan: (id: number) => request<void>('DELETE', `/api/plans/${id}`),

  getSettings: () => request<Settings>('GET', '/api/settings'),
  saveSettings: (s: Settings) => request<Settings>('PUT', '/api/settings', s),

  priceStatus: () => request<PriceStatus[]>('GET', '/api/prices/status'),
  refreshPrices: () => request<PriceStatus[]>('POST', '/api/prices/refresh'),
  monthlyPrices: (assetId: AssetId, from?: string) =>
    request<{ date: string; price: number }[]>('GET', `/api/prices/${assetId}/monthly${from ? `?from=${from}` : ''}`),
};

export type Api = typeof httpApi;
