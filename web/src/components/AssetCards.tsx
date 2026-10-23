import {
  DEFLATOR_ASSET,
  FEATURED_ASSETS,
  getAsset,
  MIN_XIRR_DAYS,
  PRIMARY_ASSET,
  type AssetId,
  type InvestmentAnalysis,
} from '@paramin-karsiligi/shared';
import { formatPct, formatRate, formatTL, formatUnits } from '../lib/format';

export function AssetCards({ analysis }: { analysis: InvestmentAnalysis }) {
  const gold = analysis.assets[PRIMARY_ASSET];
  const inflation = analysis.assets[DEFLATOR_ASSET];

  return (
    <>
      {gold && (
        <section className="hero card">
          <div className="hero-main">
            <div className="label">Toplam ödeme</div>
            <div className="hero-value">{formatTL(analysis.totalPaid)}</div>
            {inflation?.currentValue != null && (
              <div className="muted small" title="Her ödemenin TÜFE'ye göre bugünkü karşılığı">
                bugünün parasıyla {formatTL(inflation.currentValue)}
              </div>
            )}
          </div>
          <div className="hero-arrow" aria-hidden>
            →
          </div>
          <div className="hero-main">
            <div className="label">Altın karşılığı</div>
            <div className="hero-value gold">{formatUnits(PRIMARY_ASSET, gold.totalUnits)}</div>
            <div className="muted small">ort. gram maliyeti {formatTL(gold.averageCost)}</div>
          </div>
          <div className="hero-arrow" aria-hidden>
            →
          </div>
          <div className="hero-main">
            <div className="label">Altın biriktirseydiniz bugün</div>
            <div className="hero-value">{formatTL(gold.currentValue)}</div>
            <Returns assetId={PRIMARY_ASSET} analysis={analysis} />
          </div>
        </section>
      )}

      <div className="compare-grid">
        {FEATURED_ASSETS.map((id) => (
          <FeaturedCard key={id} assetId={id} analysis={analysis} />
        ))}
      </div>
    </>
  );
}

function FeaturedCard({ assetId, analysis }: { assetId: AssetId; analysis: InvestmentAnalysis }) {
  const r = analysis.assets[assetId];
  const def = getAsset(assetId);
  if (!r) return null;
  return (
    <div className="card compare-card" style={{ borderTopColor: def.color }} title={def.note}>
      <div className="label">{def.group === 'interest' ? 'Faize yatırsaydınız' : `${def.shortLabel} alsaydınız`}</div>
      <div className="compare-value">{formatTL(r.currentValue)}</div>
      <div className="muted small">{def.kind === 'unit' ? formatUnits(assetId, r.totalUnits) : 'net, stopaj sonrası'}</div>
      <Returns assetId={assetId} analysis={analysis} />
      {r.missingCount > 0 && <div className="warn-text small">{r.missingCount} ödeme hariç (veri yok)</div>}
    </div>
  );
}

/** Toplam, yıllık (XIRR) ve reel getiri satırları */
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
