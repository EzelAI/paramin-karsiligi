# Paramın Karşılığı

Bir yatırım için yaptığınız TL ödemelerini (peşinat, aylık taksitler) girersiniz. Uygulama her ödemeyi o tarihteki
**24 ayar gram altın** fiyatına çevirir ve şu soruların cevabını verir:

- Bu yatırım bana kaç gram altına mal oldu?
- O parayla altın biriktirseydim bugün kaç TL'm olurdu?
- Dolar ya da Euro biriktirseydim, faize yatırsaydım ya da ABD/BIST hisseleri alsaydım ne olurdu?

Uygulama iki bölümden oluşur:

- **Aldıklarım**: yapılmış ödemelerin altın, döviz, faiz, enflasyon ve hisselere göre bugünkü karşılığı (yukarıdaki sorular).
- **Alacaklarım**: almayı düşündüğünüz ürünler için peşin fiyat ile taksitli teklifin karşılaştırması (bkz. aşağıda).

## Çalıştırma

Gereksinim: **Node.js 22.13+** (yerleşik `node:sqlite` kullanılır).

```bash
npm install
npm run dev        # API :3001 + arayüz http://localhost:5173
```

Tek sunucu olarak çalıştırmak için:

```bash
npm run build      # arayüzü derler (web/dist)
npm start          # http://localhost:3001 hem API hem arayüz
```

Diğer komutlar: `npm test` (hesaplama, XIRR, seri ve ayrıştırıcı testleri), `npm run typecheck`.

Veriler `server/data/app.db` dosyasında tutulur. Yedek almak için bu dosyayı kopyalamanız yeterli.

## GitHub Pages sürümü

Uygulama sunucusuz olarak GitHub Pages'te de yayınlanabilir. Bu sürümde:

- Fiyatlar her gün GitHub Actions tarafından çekilir ve sitenin yanına `data/prices.json` olarak konur
  (`.github/workflows/pages.yml`). Actions sekmesinden "Run workflow" ile elle de güncellenebilir.
- Hesaplamalar ve Excel dosyası tarayıcıda yapılır.
- Kullanıcının girdiği yatırım, ödeme ve ayarlar hiçbir sunucuya gönderilmez; yalnızca o sekmenin `sessionStorage`'ında
  tutulur. Sayfa yenilenince kalır, **sekme kapanınca silinir**.

Kurulum: depoyu GitHub'a gönderin, **Settings → Pages → Source: GitHub Actions** seçin. `main` dalına her gönderimde ve
her gün 07:00'de site yeniden yayınlanır. Fiyatlar çekilemezse iş durur ve önceki yayın olduğu gibi kalır.

Yerelde denemek için:

```bash
npm run build:static                              # web/dist (göreli yollarla)
npm run snapshot -- ../web/dist/data/prices.json  # güncel fiyatlar
npm run preview -w web
```

## Fiyat verisi

Fiyatlar otomatik çekilir ve veritabanında önbelleğe alınır. Önbellek 6 saatte bir yenilenir, kenar çubuğundan elle de
güncellenebilir.

| Varlık        | Kaynak / hesap |
| ------------- | -------------- |
| Gram altın    | Spot ons ≈ GLD fiyatı ÷ pay başına ons (0,1 × 0,996^yıl); × USD/TRY ÷ 31,1035 × (1 + yerel prim) |
| USD, EUR      | Yahoo: USDTRY=X, EURTRY=X |
| Mevduat faizi | TCMB politika faizi (20.05.2010 öncesi gecelik borç alma, sonrası 1 hafta repo) + fark; stopaj sonrası, günlük bileşik |
| Enflasyon     | TCMB TÜFE aylık % değişimleri; ay içinde geometrik ara değer, son açıklanan aydan sonra sabit |
| ABD hisseleri | Yahoo kapanış + temettüler (stopaj sonrası yeniden yatırılır) × USD/TRY: SPY, QQQ, AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA |
| BIST          | Yahoo kapanış + temettüler (stopaj sonrası): THYAO, ASELS, BIMAS, KCHOL, TUPRS, GARAN, AKBNK, EREGL, SISE, FROTO; XU100 fiyat endeksi |

Bir ödemenin fiyatı, ödeme tarihindeki ya da öncesindeki en yakın işlem gününün değeridir. Veriler 2005'ten itibaren
mevcuttur. Bazı hisselerde daha geç başlar (Tesla 2010, Meta 2012); öncesindeki ödemeler o varlık için "hariç" sayılır
ve arayüzde belirtilir.

Faiz ve enflasyon "endeks fiyatı" olarak modellenir (1 TL'nin zamanla değişen değeri). Böylece hesaplama motoru onları
diğer varlıklarla aynı şekilde işler.

### Getiri ölçüleri

- **Toplam getiri**: (bugünkü değer − ödenen) ÷ ödenen. Ödeme zamanlarını hesaba katmaz.
- **Yıllık (XIRR)**: para ağırlıklı yıllık getiri. Karşılaştırma tablosu varsayılan olarak buna göre sıralanır. 365 günden
  kısa sürelerde gösterilmez (kısa dönemi yıllığa çevirmek yanıltıcı olur).
- **Reel**: her ödeme TÜFE ile bugünün parasına çevrilerek hesaplanan getiri (yıllık; 1 yıldan kısaysa toplam).
- Bugünden sonraya tarihli ödemeler **planlanan** olarak kaydedilir ve tarihi gelene kadar hesaplara katılmaz.

### Alacaklarım: peşin mi, taksit mi?

Peşin fiyat, peşinat, taksit sayısı ve aylık taksit (ya da taksitli toplam) girilir. Model: peşin fiyat kadar paranız var;
taksitli alırsanız kalanını mevduatta tutup taksitleri oradan ödersiniz (`shared/src/installment.ts`).

- **Taksitlerin bugünkü değeri**: her taksit, paranın getirisiyle (yıllık net faiz, günlük bileşik) bugüne indirgenir.
  Peşin fiyattan düşükse taksit avantajlıdır; fark ve son taksitten sonra mevduatta kalan tutar gösterilir.
- **Teklifin faizi**: taksitlerin bugünkü değerini peşin fiyata eşitleyen aylık oran (yıllık bileşik olarak da).
- **Bugünün parasıyla**: taksitler beklenen enflasyonla bugünün parasına çevrilir.
- Getiri ve enflasyon boş bırakılırsa güncel net mevduat faizi (politika faizi + fark, stopaj sonrası) ve son 12 aylık
  TÜFE kullanılır. Her ürün veritabanında saklanır (`purchase_plans`), form değiştikçe otomatik kaydedilir.

### Hesaplama varsayımları (arayüzden değiştirilebilir)

| Ayar | Varsayılan |
| --- | --- |
| Alım-satım maliyeti (gidiş-dönüş, her alımda kesilir) | altın %1, döviz %1, ABD hisse %1, BIST %0,2, faiz %0 |
| Altın yerel piyasa primi (parite üzerine) | %0 |
| Mevduat stopajı | %15 |
| Mevduat faizi − politika faizi | 0 puan |
| Temettü stopajı | ABD %20, BIST %15 |

> Bilinen sınırlar: Stopaj oranları dönemlere göre değişmiştir, uygulama tek oran kullanır. Politika faizi, fiili fonlama
> faizinden ayrıştığı dönemlerde (ör. 2011–2013 faiz koridoru) mevduat getirisini tam yansıtmayabilir. ABD hisseleri aynı
> günün USD/TRY kapanışıyla çevrilir; saat farkı küçük günlük sapmalara yol açar. BIST serilerinde tek günde %25'ten büyük
> değişimler "düzeltilmemiş bölünme olabilir" uyarısıyla gösterilir, otomatik düzeltilmez.

## Mimari

```
shared/   Ortak tipler, varlık tanımları (assets.ts), saf hesaplama motoru (analysis.ts, installment.ts), fiyat serisi
          hesapları (assetPricing.ts, seriesMath.ts, priceCalc.ts), doğrulama (schemas.ts), Excel (excelExport.ts) + testler
server/   Fastify API + SQLite
  src/db/              bağlantı ve sıralı migration'lar
  src/repositories/    tablo erişimi (yatırım, ödeme, fiyat)
  src/providers/       fiyat kaynakları (PriceProvider arayüzü, Yahoo, TCMB faiz ve TÜFE)
  src/services/        fiyat güncelleme ve analiz
  src/routes/          HTTP uçları
  src/container.ts     bağımlılıkların kurulduğu tek yer
  src/snapshot.ts      tüm fiyatları tek JSON dosyasına yazar (GitHub Pages)
web/      React + TypeScript + Vite, React Query, Recharts
  src/api/http.ts      yerel sunucuya bağlanan API
  src/api/local.ts     GitHub Pages sürümünün tarayıcıda çalışan API'si (aynı arayüz)
```

### API

| Metot  | Yol                                   | Açıklama                                 |
| ------ | ------------------------------------- | ---------------------------------------- |
| GET    | `/api/investments`                    | Yatırım listesi                          |
| POST   | `/api/investments`                    | `{ name, description? }`                 |
| GET    | `/api/investments/:id`                | Yatırım + ödemeler                       |
| PUT/DELETE | `/api/investments/:id`            |                                          |
| POST   | `/api/investments/:id/payments`       | `{ date, amount, note? }`                |
| POST   | `/api/investments/:id/payments/bulk`  | `{ startMonth, endMonth, day, amount }`  |
| PUT/DELETE | `/api/payments/:id`               |                                          |
| GET    | `/api/investments/:id/analysis`       | Altın/döviz karşılıkları, aylık seri     |
| GET    | `/api/investments/:id/export.xlsx`    | Excel dosyası                            |
| GET/POST | `/api/plans`                       | Alacaklarım listesi / yeni ürün          |
| GET/PUT/DELETE | `/api/plans/:id`             | Ürün ve peşin/taksit teklifi             |
| GET    | `/api/prices/status`                  | Güncel fiyatlar                          |
| POST   | `/api/prices/refresh`                 | Fiyatları zorla güncelle                 |
| GET    | `/api/prices/:assetId/monthly`        | Aylık fiyat serisi                       |

## Geliştirme rehberi

**Yeni karşılaştırma varlığı (ör. yeni bir hisse):**
1. `shared/src/assets.ts` → `ASSETS` içine tanım ekleyin, ör. `SAHOL: stock('Sabancı Holding', 'SAHOL', 'tr_stock', '#123456')`.
2. `shared/src/assetPricing.ts` → `ASSET_RECIPES` içine tarif ekleyin, ör. `SAHOL: stock('SAHOL', 'tr')`
   (ABD için `stock('SEMBOL', 'us')`; çeyrek altın gibi türetilmiş fiyatlar için `{ type: 'product', sources, factor }`).

Karşılaştırma tablosu, grafik ve Excel yeni varlığı otomatik olarak içerir.

**Yeni fiyat kaynağı (ör. TCMB EVDS):** `server/src/providers/types.ts` içindeki `PriceProvider` arayüzünü uygulayın,
`container.ts` içindeki `providers` listesine ekleyin ve `assetPricing.ts` içindeki `SOURCES` tanımında kullanın.

**Şema değişikliği:** `server/src/db/migrations.ts` sonuna yeni bir migration ekleyin. Mevcut olanları değiştirmeyin.
