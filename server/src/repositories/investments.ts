import type { Investment, InvestmentInput } from '@paramin-karsiligi/shared';
import type { Db } from '../db';

interface Row {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

const toInvestment = (r: Row): Investment => ({
  id: r.id,
  name: r.name,
  description: r.description,
  createdAt: r.created_at,
});

export class InvestmentRepository {
  constructor(private db: Db) {}

  list(): Investment[] {
    return (this.db.prepare('SELECT * FROM investments ORDER BY id').all() as unknown as Row[]).map(toInvestment);
  }

  get(id: number): Investment | undefined {
    const row = this.db.prepare('SELECT * FROM investments WHERE id = ?').get(id) as unknown as Row | undefined;
    return row && toInvestment(row);
  }

  create(input: InvestmentInput): Investment {
    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO investments (name, description) VALUES (?, ?)')
      .run(input.name, input.description ?? null);
    return this.get(Number(lastInsertRowid))!;
  }

  update(id: number, input: InvestmentInput): Investment | undefined {
    this.db
      .prepare('UPDATE investments SET name = ?, description = ? WHERE id = ?')
      .run(input.name, input.description ?? null, id);
    return this.get(id);
  }

  delete(id: number): boolean {
    return Number(this.db.prepare('DELETE FROM investments WHERE id = ?').run(id).changes) > 0;
  }
}
