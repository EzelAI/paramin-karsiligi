import {
  DEFLATOR_ASSET,
  FEATURED_ASSETS,
  getAsset,
  MIN_XIRR_DAYS,
  PRIMARY_ASSET,
  type AssetId,
  type InvestmentAnalysis,
} from '@paramin-karsiligi/shared';
import { useEffect, useState } from 'react';
import { formatDate, formatMonth, formatNumber, formatPct, formatRate, formatTL, formatUnits } from '../lib/format';

/**
 * Sayfanın açılışı: ödenen para, altın karşılığı ve bugünkü değeri tek bir cümle olarak okunur.
 * Altın miktarı sayfa açılırken bir kez sayarak yükselir (hareket azaltma tercihinde sabit).
 */
export function Hero({ analysis, compact = false }: { analysis: InvestmentAnalysis; compact?: boolean }) {
  const gold = analysis.assets[PRIMARY_ASSET];
  const inflation = analysis.assets[DEFLATOR_ASSET];
  const grams = useCountUp(gold?.totalUnits ?? 0);
  if (!gold) return null;

  // Karşılaştırma ve ödemeler sekmelerinde tek satırlık hatırlatma
  if (compact) {
    return (
      <section className="hero compact" aria-label="Özet">
        <p className="hero-sentence">
          <span>
            <b className="hero-num gold">{formatNumber(gold.totalUnits)} gram</b> altın, bugün{' '}
            <b className="hero-num">{formatTL(gold.currentValue)}</b> ediyor.
          </span>
        </p>
      </section>
    );
  }

  const span =
    analysis.firstDate && analysis.lastDate && analysis.firstDate.slice(0, 7) !== analysis.lastDate.slice(0, 7)
      ? `${formatMonth(analysis.firstDate.slice(0, 7))} ile ${formatMonth(analysis.lastDate.slice(0, 7))} arasında`
      : analysis.firstDate
        ? `${formatDate(analysis.firstDate)} tarihinde`
        : '';

  return (
    <section className="hero" aria-label="Özet">
      <GoldBars />
      <p className="hero-sentence">
        <span className="hero-line">
          {span} {analysis.paymentCount} ödemede <b className="hero-num">{formatTL(analysis.totalPaid)}</b> ödediniz.
        </span>
        <span className="hero-line">
          O gün altın alsaydınız <b className="hero-num gold">{formatNumber(grams)} gram</b> altınınız olurdu.
        </span>
        <span className="hero-line">
          Bu altın bugün <b className="hero-num">{formatTL(gold.currentValue)}</b> ediyor.
        </span>
      </p>
      <div className="hero-facts">
        <Returns assetId={PRIMARY_ASSET} analysis={analysis} />
        <span>Gram başına ortalama {formatTL(gold.averageCost)} ödediniz.</span>
        {inflation?.currentValue != null && (
          <span title="Her ödemenin TÜFE'ye göre bugünkü karşılığı">
            Enflasyonla bugünün parasına çevrilince ödediğiniz tutar {formatTL(inflation.currentValue)}.
          </span>
        )}
      </div>
    </section>
  );
}

/** Özet bandının sağındaki külçe yığını (süs; ekran okuyucudan gizli) */
function GoldBars() {
  const bar = (x: number, y: number) => <path key={`${x}-${y}`} d={`M${x + 8} ${y}h44l8 24h-60z`} fill="url(#kulce)" />;
  return (
    <svg className="hero-bars" viewBox="0 0 196 84" aria-hidden>
      <defs>
        <linearGradient id="kulce" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#f6d77e" />
          <stop offset="0.6" stopColor="#c8961e" />
          <stop offset="1" stopColor="#9a6b00" />
        </linearGradient>
      </defs>
      {[bar(68, 0), bar(34, 29), bar(102, 29), bar(0, 58), bar(68, 58), bar(136, 58)]}
    </svg>
  );
}

/** Öne çıkan karşılaştırmalar: mobilde yatay kaydırılır, geniş ekranda ızgara */
export function FeaturedCards({ analysis }: { analysis: InvestmentAnalysis }) {
  return (
    <div className="featured" role="list">
      {FEATURED_ASSETS.map((id) => (
        <FeaturedCard key={id} assetId={id} analysis={analysis} />
      ))}
    </div>
  );
}

function FeaturedCard({ assetId, analysis }: { assetId: AssetId; analysis: InvestmentAnalysis }) {
  const r = analysis.assets[assetId];
  const def = getAsset(assetId);
  if (!r) return null;
  return (
    <article className="feature" role="listitem" title={def.note}>
      <h3 className="feature-title">
        <span className="dot" style={{ background: def.color }} aria-hidden />
        {def.group === 'interest' ? 'Faize yatırsaydınız' : `${def.shortLabel} alsaydınız`}
      </h3>
      <div className="feature-value">{formatTL(r.currentValue)}</div>
      <div className="muted small">{def.kind === 'unit' ? formatUnits(assetId, r.totalUnits) : 'net, stopaj sonrası'}</div>
      <Returns assetId={assetId} analysis={analysis} />
      {r.missingCount > 0 && <div className="warn-text small">{r.missingCount} ödeme hariç (veri yok)</div>}
    </article>
  );
}

/** Toplam, yıllık (XIRR) ve reel getiri */
export function Returns({ assetId, analysis }: { assetId: AssetId; analysis: InvestmentAnalysis }) {
  const r = analysis.assets[assetId];
  if (!r || r.gain == null) return null;
  return (
    <div className="returns">
      <span className={tone(r.gain)}>
        {r.gain >= 0 ? '+' : ''}
        {formatTL(r.gain)} ({formatPct(r.gainPct)})
      </span>
      {r.xirr !== null ? (
        <span className={tone(r.xirr)} title="Para ağırlıklı yıllık getiri (XIRR)">
          yıllık {formatRate(r.xirr)}
        </span>
      ) : (
        <span className="muted" title={`${MIN_XIRR_DAYS} günden kısa sürede yıllık getiri gösterilmez`}>
          yıllık —
        </span>
      )}
      {r.real && assetId !== DEFLATOR_ASSET && (
        <span className={tone(r.real.gain)} title="Enflasyondan (TÜFE) arındırılmış getiri">
          reel {r.real.xirr !== null ? `yıllık ${formatRate(r.real.xirr)}` : formatPct(r.real.gainPct)}
        </span>
      )}
    </div>
  );
}

export const tone = (v: number | null | undefined) => (v == null ? 'muted' : v >= 0 ? 'up' : 'down');

/** İlk gösterimde 0'dan hedefe 0,9 saniyede sayar; sonraki değişikliklerde doğrudan gösterir */
function useCountUp(target: number) {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const [done, setDone] = useState(() => prefersReducedMotion());

  useEffect(() => {
    if (done) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
      else setDone(true);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, done]);

  return value;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
