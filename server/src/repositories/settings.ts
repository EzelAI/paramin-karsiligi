import { withDefaults, type Settings } from '@paramin-karsiligi/shared';
import type { Db } from '../db';

const KEY = 'calculation';

export class SettingsRepository {
  private cached: Settings | null = null;

  constructor(private db: Db) {}

  get(): Settings {
    if (!this.cached) {
      const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY) as { value: string } | undefined;
      this.cached = withDefaults(row ? (JSON.parse(row.value) as Partial<Settings>) : null);
    }
    return this.cached;
  }

  save(settings: Settings): Settings {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(KEY, JSON.stringify(settings));
    this.cached = withDefaults(settings);
    return this.cached;
  }
}
