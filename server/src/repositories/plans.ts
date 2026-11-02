import { normalizePlan, type PaymentOption, type PurchasePlan, type PurchasePlanInput } from '@paramin-karsiligi/shared';
import type { Db } from '../db';

interface Row {
  id: number;
  name: string;
  cash_kurus: number | null;
  down_kurus: number | null;
  installment_count: number | null;
  amount_mode: 'monthly' | 'total';
  amount_kurus: number | null;
  first_after_months: number;
  return_pct: number | null;
  inflation_pct: number | null;
  created_at: string;
  options_json: string | null;
}

const fromKurus = (k: number | null) => (k == null ? null : k / 100);
const toKurus = (tl: number | null) => (tl == null ? null : Math.round(tl * 100));

/**
 * options_json NULL ise kayıt seçenek özelliğinden önce oluşturulmuştur: eski tek teklif sütunları
 * tek bir eşit taksit seçeneğine çevrilir (normalizePlan).
 */
const toPlan = (r: Row): PurchasePlan =>
  normalizePlan({
    id: r.id,
    name: r.name,
    cashPrice: fromKurus(r.cash_kurus),
    options: r.options_json ? (JSON.parse(r.options_json) as PaymentOption[]) : null,
    returnPct: r.return_pct,
    inflationPct: r.inflation_pct,
    createdAt: r.created_at,
    downPayment: fromKurus(r.down_kurus),
    count: r.installment_count,
    amountMode: r.amount_mode,
    amount: fromKurus(r.amount_kurus),
    firstAfterMonths: r.first_after_months,
  });

/** Alacaklarım: alınacak ürünlerin peşin fiyatı ve ödeme seçenekleri */
export class PlanRepository {
  constructor(private db: Db) {}

  list(): PurchasePlan[] {
    return (this.db.prepare('SELECT * FROM purchase_plans ORDER BY id').all() as unknown as Row[]).map(toPlan);
  }

  get(id: number): PurchasePlan | undefined {
    const row = this.db.prepare('SELECT * FROM purchase_plans WHERE id = ?').get(id) as unknown as Row | undefined;
    return row && toPlan(row);
  }

  create(input: PurchasePlanInput): PurchasePlan {
    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO purchase_plans (name, cash_kurus, options_json, return_pct, inflation_pct) VALUES (?, ?, ?, ?, ?)')
      .run(input.name, toKurus(input.cashPrice), JSON.stringify(input.options), input.returnPct, input.inflationPct);
    return this.get(Number(lastInsertRowid))!;
  }

  update(id: number, input: PurchasePlanInput): PurchasePlan | undefined {
    this.db
      .prepare('UPDATE purchase_plans SET name = ?, cash_kurus = ?, options_json = ?, return_pct = ?, inflation_pct = ? WHERE id = ?')
      .run(input.name, toKurus(input.cashPrice), JSON.stringify(input.options), input.returnPct, input.inflationPct, id);
    return this.get(id);
  }

  delete(id: number): boolean {
    return Number(this.db.prepare('DELETE FROM purchase_plans WHERE id = ?').run(id).changes) > 0;
  }
}
