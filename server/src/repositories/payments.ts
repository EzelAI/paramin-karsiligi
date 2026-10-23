import type { Payment, PaymentInput } from '@paramin-karsiligi/shared';
import { transaction, type Db } from '../db';

interface Row {
  id: number;
  investment_id: number;
  date: string;
  amount_kurus: number;
  note: string | null;
}

const toPayment = (r: Row): Payment => ({
  id: r.id,
  investmentId: r.investment_id,
  date: r.date,
  amount: r.amount_kurus / 100,
  note: r.note,
});

const toKurus = (tl: number) => Math.round(tl * 100);

export class PaymentRepository {
  constructor(private db: Db) {}

  listByInvestment(investmentId: number): Payment[] {
    const rows = this.db
      .prepare('SELECT * FROM payments WHERE investment_id = ? ORDER BY date, id')
      .all(investmentId) as unknown as Row[];
    return rows.map(toPayment);
  }

  get(id: number): Payment | undefined {
    const row = this.db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as unknown as Row | undefined;
    return row && toPayment(row);
  }

  createMany(investmentId: number, inputs: PaymentInput[]): Payment[] {
    const stmt = this.db.prepare('INSERT INTO payments (investment_id, date, amount_kurus, note) VALUES (?, ?, ?, ?)');
    return transaction(this.db, () =>
      inputs.map((p) => {
        const { lastInsertRowid } = stmt.run(investmentId, p.date, toKurus(p.amount), p.note ?? null);
        return this.get(Number(lastInsertRowid))!;
      }),
    );
  }

  update(id: number, input: PaymentInput): Payment | undefined {
    this.db
      .prepare('UPDATE payments SET date = ?, amount_kurus = ?, note = ? WHERE id = ?')
      .run(input.date, toKurus(input.amount), input.note ?? null, id);
    return this.get(id);
  }

  delete(id: number): boolean {
    return Number(this.db.prepare('DELETE FROM payments WHERE id = ?').run(id).changes) > 0;
  }
}
