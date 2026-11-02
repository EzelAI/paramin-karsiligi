/**
 * EVDS'de seri kodlarını bulmak ve denemek için küçük araç. Anahtar server/.env içindeki EVDS_API_KEY'den okunur.
 *
 *   npm run evds -w server -- categories
 *   npm run evds -w server -- datagroups <kategori-no> [süzgeç]
 *   npm run evds -w server -- series <veri-grubu-kodu> [süzgeç]
 *   npm run evds -w server -- fetch <seri-kodu> <başlangıç YYYY-AA-GG> [bitiş]
 *   npm run evds -w server -- raw "<adresin devamı, ör. categories/type=json>"
 *
 * Yanıtların alan adlarını bilmeden çalışır: ham JSON'u (kısaltılmış) yazar, "süzgeç" verilirse yalnızca o kelimeyi
 * içeren satırları gösterir. Anahtar hiçbir yere yazdırılmaz.
 */
import { EvdsClient, EvdsError, parseEvdsItems } from './providers/evds';

const key = process.env.EVDS_API_KEY?.trim();
if (!key) {
  console.error('EVDS_API_KEY yok. server/.env dosyasına şunu yazın:  EVDS_API_KEY=anahtarınız');
  process.exit(1);
}
const client = new EvdsClient(key);
const [cmd, a, b, c] = process.argv.slice(2);
const today = new Date().toISOString().slice(0, 10);

const show = (value: unknown, filter?: string) => {
  const rows = Array.isArray(value) ? value : [value];
  const text = (v: unknown) => JSON.stringify(v);
  const hit = filter ? rows.filter((r) => text(r).toLocaleLowerCase('tr').includes(filter.toLocaleLowerCase('tr'))) : rows;
  console.log(`${hit.length}/${rows.length} satır`);
  for (const r of hit.slice(0, 60)) console.log(text(r));
  if (hit.length > 60) console.log(`… ${hit.length - 60} satır daha (süzgeç kullanın)`);
};

try {
  switch (cmd) {
    case 'categories':
      show(await client.get('categories/type=json'), a);
      break;
    case 'datagroups':
      if (!a) throw new Error('kategori no gerekli');
      show(await client.get(`datagroups/mode=2&code=${a}&type=json`), b);
      break;
    case 'series':
      if (!a) throw new Error('veri grubu kodu gerekli');
      show(await client.get(`serieList/type=json&code=${a}`), b);
      break;
    case 'fetch': {
      if (!a || !b) throw new Error('seri kodu ve başlangıç tarihi gerekli');
      const items = await client.series([a], b, c ?? today);
      const points = parseEvdsItems(items, a);
      console.log(`${items.length} satır, ${points.length} geçerli nokta`);
      console.log('ilk satır:', JSON.stringify(items[0]));
      console.log('son 5:', points.slice(-5).map((p) => `${p.date}=${p.close}`).join('  '));
      break;
    }
    case 'raw':
      if (!a) throw new Error('adres gerekli');
      show(await client.get(a), b);
      break;
    default:
      console.error('Komut: categories | datagroups | series | fetch | raw');
      process.exit(1);
  }
} catch (err) {
  console.error(err instanceof EvdsError ? err.message : (err as Error).message);
  process.exit(1);
}
