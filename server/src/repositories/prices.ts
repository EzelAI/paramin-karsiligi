import { transaction, type Db } from '../db';
import type { PricePoint } from '@paramin-karsiligi/shared';

export class PriceRepository {
  constructor(private db: Db) {}

  /** Bir serinin tüm değerleri, tarihe göre artan sırada */
  series(key: string): PricePoint[] {
    return this.db
      .prepare('SELECT date, close FROM price_points WHERE symbol = ? ORDER BY date')
      .all(key) as unknown as PricePoint[];
  }

  lastDate(key: string): string | null {
    const row = this.db.prepare('SELECT MAX(date) AS d FROM price_points WHERE symbol = ?').get(key) as {
      d: string | null;
    };
    return row.d;
  }

  /**
   * Bir kaynaktan gelen serileri tek işlemde yazar.
   * replace: serinin tüm geçmişini siler ve yeniden yazar; upsert: ekler ya da aynı tarihi günceller.
   */
  saveAll(provider: string, series: { key: string; points: PricePoint[] }[], mode: 'replace' | 'upsert') {
    const del = this.db.prepare('DELETE FROM price_points WHERE symbol = ?');
    const ins = this.db.prepare(
      'INSERT INTO price_points (symbol, date, close) VALUES (?, ?, ?) ON CONFLICT(symbol, date) DO UPDATE SET close = excluded.close',
    );
    const sync = this.db.prepare(
      `INSERT INTO price_sync (symbol, provider, last_fetched_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(symbol) DO UPDATE SET provider = excluded.provider, last_fetched_at = excluded.last_fetched_at`,
    );
    transaction(this.db, () => {
      for (const { key, points } of series) {
        if (mode === 'replace') del.run(key);
        for (const p of points) ins.run(key, p.date, p.close);
        sync.run(key, provider);
      }
    });
  }

  lastFetchedAt(key: string): string | null {
    const row = this.db.prepare('SELECT last_fetched_at FROM price_sync WHERE symbol = ?').get(key) as
      | { last_fetched_at: string }
      | undefined;
    return row ? row.last_fetched_at.replace(' ', 'T') + 'Z' : null;
  }
}
