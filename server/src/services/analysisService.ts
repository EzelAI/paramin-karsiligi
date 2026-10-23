import type { InvestmentAnalysis } from '@paramin-karsiligi/shared';
import type { PaymentRepository } from '../repositories/payments';
import type { PriceService } from './priceService';

export class AnalysisService {
  constructor(
    private payments: PaymentRepository,
    private prices: PriceService,
  ) {}

  async forInvestment(investmentId: number): Promise<InvestmentAnalysis> {
    await this.prices.ensureFresh();
    return this.prices.analyze(this.payments.listByInvestment(investmentId));
  }
}
