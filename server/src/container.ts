import { config } from './config';
import { openDatabase } from './db';
import { EvdsClient, EvdsProvider } from './providers/evds';
import { TcmbCpiProvider, TcmbPolicyRateProvider } from './providers/tcmb';
import { YahooFinanceProvider } from './providers/yahoo';
import type { PriceProvider } from './providers/types';
import { InvestmentRepository } from './repositories/investments';
import { PaymentRepository } from './repositories/payments';
import { PlanRepository } from './repositories/plans';
import { PriceRepository } from './repositories/prices';
import { SettingsRepository } from './repositories/settings';
import { AnalysisService } from './services/analysisService';
import { PriceService } from './services/priceService';

/** Bağımlılıkların tek yerde kurulduğu yer; testlerde farklı db/provider verilebilir */
export function createContainer(opts: { dbPath?: string; evdsKey?: string | null; log?: (msg: string) => void } = {}) {
  const db = openDatabase(opts.dbPath ?? config.dbPath);
  const investments = new InvestmentRepository(db);
  const payments = new PaymentRepository(db);
  const settings = new SettingsRepository(db);
  const plans = new PlanRepository(db);
  const evdsKey = opts.evdsKey === undefined ? config.evdsKey : opts.evdsKey;
  const providers: Record<string, PriceProvider> = {
    yahoo: new YahooFinanceProvider(),
    tcmb: new TcmbPolicyRateProvider(),
    'tcmb-cpi': new TcmbCpiProvider(),
    // EVDS anahtarı yoksa kurulmaz; EVDS kaynakları atlanır ve faiz/TÜFE web sayfası verisine döner
    ...(evdsKey ? { evds: new EvdsProvider(new EvdsClient(evdsKey)) } : {}),
  };
  const prices = new PriceService(new PriceRepository(db), providers, () => settings.get(), {
    refreshMs: config.priceRefreshMs,
    historyStart: config.priceHistoryStart,
    log: opts.log,
  });
  const analysis = new AnalysisService(payments, prices);
  return { db, investments, payments, plans, settings, prices, analysis };
}

export type Container = ReturnType<typeof createContainer>;
