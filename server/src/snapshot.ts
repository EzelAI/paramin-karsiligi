/**
 * Tüm fiyat kaynaklarını çekip tek bir JSON dosyasına yazar (GitHub Pages sürümü bu dosyayı okur).
 * Kullanım: npm run snapshot -w server -- <çıktı dosyası>
 */
import fs from 'node:fs';
import path from 'node:path';
import { createContainer } from './container';

const ATTEMPTS = 3;
const RETRY_DELAY_MS = 30_000;

const out = process.argv[2];
if (!out) throw new Error('Çıktı dosyası verilmedi');

const c = createContainer({ dbPath: ':memory:', log: (m) => console.log(m) });

// İlk denemede hepsi çekilir; sonrakilerde yalnızca hiç alınamamış kaynaklar yeniden denenir
for (let attempt = 1; ; attempt++) {
  try {
    await c.prices.ensureFresh(attempt === 1);
    break;
  } catch (err) {
    if (attempt === ATTEMPTS) throw err;
    console.warn(`Deneme ${attempt} başarısız, ${RETRY_DELAY_MS / 1000} sn sonra tekrar: ${(err as Error).message}`);
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }
}

const snapshot = c.prices.snapshot();
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, JSON.stringify(snapshot));
console.log(`${Object.keys(snapshot.series).length} seri yazıldı: ${out}`);
