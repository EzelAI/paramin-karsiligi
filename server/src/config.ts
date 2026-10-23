import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRICE_HISTORY_START } from '@paramin-karsiligi/shared';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? '127.0.0.1',
  dbPath: process.env.DB_PATH ?? path.join(root, 'data', 'app.db'),
  /** Derlenmiş arayüz (npm run build sonrası) */
  webDist: path.resolve(root, '..', 'web', 'dist'),
  /** Fiyat önbelleği bu süreden eskiyse yeniden çekilir */
  priceRefreshMs: 6 * 60 * 60 * 1000,
  /** Fiyat geçmişinin başlangıcı */
  priceHistoryStart: PRICE_HISTORY_START,
};
