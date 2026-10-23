import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type * as Sqlite from 'node:sqlite';
import { migrations } from './migrations';

// node:sqlite require ile yüklenir: Vitest (Vite) 'node:' önekini kaldırıp modülü bulamıyor
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof Sqlite;

export type Db = Sqlite.DatabaseSync;

export function openDatabase(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

function migrate(db: Db) {
  const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  for (const m of migrations) {
    if (m.version <= current) continue;
    transaction(db, () => {
      db.exec(m.sql);
      db.exec(`PRAGMA user_version = ${m.version}`);
    });
  }
}

export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
