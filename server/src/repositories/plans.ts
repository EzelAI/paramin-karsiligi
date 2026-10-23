import type { PurchasePlan, PurchasePlanInput } from '@paramin-karsiligi/shared';
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
}

const fromKurus = (k: number | null) => (k == null ? null : k / 100);
const toKurus = (tl: number | null) => (tl == null ? null : Math.round(tl * 100));

const toPlan = (r: Row): PurchasePlan => ({
  id: r.id,
  name: r.name,
  cashPrice: fromKurus(r.cash_kurus),
  downPayment: fromKurus(r.down_kurus),
  count: r.installment_count,
  amountMode: r.amount_mode,
  amount: fromKurus(r.amount_kurus),
  firstAfterMonths: r.first_after_months === 0 ? 0 : 1,
  returnPct: r.return_pct,
  inflationPct: r.inflation_pct,
  createdAt: r.created_at,
});

const values = (p: PurchasePlanInput) => [
  p.name,
  toKurus(p.cashPrice),
  toKurus(p.downPayment),
  p.count,
  p.amountMode,
  toKurus(p.amount),
  p.firstAfterMonths,
  p.returnPct,
  p.inflationPct,
];

/** Alacaklarım: alınacak ürünlerin peşin/taksit teklifleri */
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
      .prepare(
        `INSERT INTO purchase_plans (name, cash_kurus, down_kurus, installment_count, amount_mode, amount_kurus,
           first_after_months, return_pct, inflation_pct) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(...values(input));
    return this.get(Number(lastInsertRowid))!;
  }

  update(id: number, input: PurchasePlanInput): PurchasePlan | undefined {
    this.db
      .prepare(
        `UPDATE purchase_plans SET name = ?, cash_kurus = ?, down_kurus = ?, installment_count = ?, amount_mode = ?,
           amount_kurus = ?, first_after_months = ?, return_pct = ?, inflation_pct = ? WHERE id = ?`,
      )
      .run(...values(input), id);
    return this.get(id);
  }

  delete(id: number): boolean {
    return Number(this.db.prepare('DELETE FROM purchase_plans WHERE id = ?').run(id).changes) > 0;
  }
}
