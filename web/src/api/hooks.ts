import type {
  AssetId,
  BulkPaymentInput,
  InvestmentInput,
  PaymentInput,
  PurchasePlan,
  PurchasePlanInput,
  Settings,
} from '@paramin-karsiligi/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export const keys = {
  investments: ['investments'] as const,
  investment: (id: number) => ['investments', id] as const,
  analysis: (id: number) => ['investments', id, 'analysis'] as const,
  priceStatus: ['prices', 'status'] as const,
  monthly: (assetId: AssetId, from?: string) => ['prices', 'monthly', assetId, from ?? ''] as const,
  settings: ['settings'] as const,
  plans: ['plans'] as const,
  plan: (id: number) => ['plans', id] as const,
};

export const useInvestments = () => useQuery({ queryKey: keys.investments, queryFn: api.listInvestments });

export const useInvestment = (id: number | null) =>
  useQuery({ queryKey: keys.investment(id ?? 0), queryFn: () => api.getInvestment(id!), enabled: id !== null });

export const useAnalysis = (id: number | null) =>
  useQuery({ queryKey: keys.analysis(id ?? 0), queryFn: () => api.getAnalysis(id!), enabled: id !== null });

export const usePriceStatus = () => useQuery({ queryKey: keys.priceStatus, queryFn: api.priceStatus });

export const useMonthlyPrices = (assetId: AssetId, from?: string) =>
  useQuery({ queryKey: keys.monthly(assetId, from), queryFn: () => api.monthlyPrices(assetId, from) });

/** Yatırım ve altındaki her şeyi (ödemeler, analiz) tazeler */
function useInvalidateInvestments() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: keys.investments });
}

export function useCreateInvestment() {
  const invalidate = useInvalidateInvestments();
  return useMutation({ mutationFn: (input: InvestmentInput) => api.createInvestment(input), onSuccess: invalidate });
}

export function useUpdateInvestment(id: number) {
  const invalidate = useInvalidateInvestments();
  return useMutation({ mutationFn: (input: InvestmentInput) => api.updateInvestment(id, input), onSuccess: invalidate });
}

export function useDeleteInvestment() {
  const invalidate = useInvalidateInvestments();
  return useMutation({ mutationFn: (id: number) => api.deleteInvestment(id), onSuccess: invalidate });
}

export function useAddPayment(investmentId: number) {
  const invalidate = useInvalidateInvestments();
  return useMutation({ mutationFn: (input: PaymentInput) => api.addPayment(investmentId, input), onSuccess: invalidate });
}

export function useAddBulkPayments(investmentId: number) {
  const invalidate = useInvalidateInvestments();
  return useMutation({
    mutationFn: (input: BulkPaymentInput) => api.addBulkPayments(investmentId, input),
    onSuccess: invalidate,
  });
}

export function useUpdatePayment() {
  const invalidate = useInvalidateInvestments();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: PaymentInput }) => api.updatePayment(id, input),
    onSuccess: invalidate,
  });
}

export function useDeletePayment() {
  const invalidate = useInvalidateInvestments();
  return useMutation({ mutationFn: (id: number) => api.deletePayment(id), onSuccess: invalidate });
}

export function useRefreshPrices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.refreshPrices,
    onSuccess: (status) => {
      qc.setQueryData(keys.priceStatus, status);
      qc.invalidateQueries({ queryKey: ['prices', 'monthly'] });
      qc.invalidateQueries({ queryKey: keys.investments });
    },
  });
}

export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: api.getSettings });

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: Settings) => api.saveSettings(s),
    onSuccess: (saved) => {
      qc.setQueryData(keys.settings, saved);
      // Varsayımlar değişince tüm hesaplar ve fiyat durumu yeniden alınır
      qc.invalidateQueries({ queryKey: keys.investments });
      qc.invalidateQueries({ queryKey: keys.priceStatus });
    },
  });
}

// Alacaklarım
export const usePlans = () => useQuery({ queryKey: keys.plans, queryFn: api.listPlans });

export const usePlan = (id: number) => useQuery({ queryKey: keys.plan(id), queryFn: () => api.getPlan(id) });

export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PurchasePlanInput) => api.createPlan(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.plans }),
  });
}

/** Form her değiştiğinde kaydedilir; listeyi (ad) ve önbellekteki kaydı günceller, formu yeniden yüklemez */
export function useUpdatePlan(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PurchasePlanInput) => api.updatePlan(id, input),
    onSuccess: (saved: PurchasePlan) => {
      qc.setQueryData(keys.plan(id), saved);
      qc.setQueryData<PurchasePlan[]>(keys.plans, (list) => list?.map((p) => (p.id === id ? saved : p)));
    },
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deletePlan(id),
    onSuccess: (_: void, id: number) => {
      // Listeden hemen çıkar; silinen kaydın kendisi yeniden istenmesin (404)
      qc.setQueryData<PurchasePlan[]>(keys.plans, (list) => list?.filter((p) => p.id !== id));
      qc.invalidateQueries({ queryKey: keys.plans, exact: true });
    },
  });
}
