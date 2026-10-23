/**
 * Sıralı şema değişiklikleri. Mevcut bir migration'ı DEĞİŞTİRMEYİN;
 * şema değişikliği için listenin sonuna yenisini ekleyin.
 */
export const migrations: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: 'init',
    sql: `
      CREATE TABLE investments (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        description TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE payments (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        investment_id INTEGER NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
        date          TEXT NOT NULL,
        amount        REAL NOT NULL CHECK (amount > 0),
        note          TEXT
      );
      CREATE INDEX idx_payments_investment ON payments(investment_id, date);

      -- Sağlayıcılardan gelen ham günlük kapanış fiyatları (ör. GC=F, USDTRY=X)
      CREATE TABLE price_points (
        symbol TEXT NOT NULL,
        date   TEXT NOT NULL,
        close  REAL NOT NULL,
        PRIMARY KEY (symbol, date)
      ) WITHOUT ROWID;

      CREATE TABLE price_sync (
        symbol          TEXT PRIMARY KEY,
        provider        TEXT NOT NULL,
        last_fetched_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: 'kurus-amounts-settings',
    sql: `
      -- Tutarlar kayan nokta yerine tam sayı kuruş olarak saklanır
      CREATE TABLE payments_new (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        investment_id INTEGER NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
        date          TEXT NOT NULL,
        amount_kurus  INTEGER NOT NULL CHECK (amount_kurus > 0),
        note          TEXT
      );
      INSERT INTO payments_new (id, investment_id, date, amount_kurus, note)
        SELECT id, investment_id, date, CAST(ROUND(amount * 100) AS INTEGER), note FROM payments;
      DROP TABLE payments;
      ALTER TABLE payments_new RENAME TO payments;
      CREATE INDEX idx_payments_investment ON payments(investment_id, date);

      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- Hisse serileri artık düzeltilmemiş kapanış + temettü olarak tutuluyor; vadeli altın yerine GLD
      DELETE FROM price_points WHERE symbol LIKE '%:adj' OR symbol = 'GC=F';
      DELETE FROM price_sync WHERE symbol LIKE '%:adj' OR symbol = 'GC=F';
    `,
  },
];
