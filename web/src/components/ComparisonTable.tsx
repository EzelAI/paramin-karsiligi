import {
  ASSET_GROUPS,
  ASSET_IDS,
  getAsset,
  PRIMARY_ASSET,
  type AssetGroup,
  type AssetResult,
  type InvestmentAnalysis,
} from '@paramin-karsiligi/shared';
import { useState } from 'react';
import { formatPct, formatRate, formatTL, formatUnits } from '../lib/format';
import { tone } from './AssetCards';

type Filter = AssetGroup | 'all';
type SortKey = 'xirr' | 'real' | 'gainPct' | 'value';

const SORTS: Record<SortKey, { label: string; value: (r: AssetResult) => number | null }> = {
  xirr: { label: 'Yıllık getiri', value: (r) => r.xirr ?? (r.gainPct !== null ? r.gainPct / 100 : null) },
  real: { label: 'Reel getiri', value: (r) => r.real?.xirr ?? r.real?.gainPct ?? null },
  gainPct: { label: 'Toplam getiri', value: (r) => r.gainPct },
  value: { label: 'Bugünkü değer', value: (r) => r.currentValue },
};

/**
 * Tüm varlıkları karşılaştırır. Varsayılan sıralama yıllık getiriye (XIRR) göredir: fiyatı olmayan
 * ödemeler hariç tutulduğunda varlıkların kapsadığı tutar farklılaşır, oran bazlı sıralama bunu dengeler.
 */
export function ComparisonTable({ analysis }: { analysis: InvestmentAnalysis }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortKey>('xirr');
  const hasXirr = ASSET_IDS.some((id) => analysis.assets[id]?.xirr != null);

  const rows = ASSET_IDS.map((id) => analysis.assets[id])
    .filter((r): r is AssetResult => !!r && (filter === 'all' || getAsset(r.assetId).group === filter))
    .sort((a, b) => (SORTS[sort].value(b) ?? -Infinity) - (SORTS[sort].value(a) ?? -Infinity));
  const maxValue = Math.max(...rows.map((r) => r.currentValue ?? 0), analysis.totalPaid);

  const header = (key: SortKey, label: string, className = '') => (
    <th className={`num sortable ${className}`} aria-sort={sort === key ? 'descending' : 'none'}>
      <button className="th-btn" onClick={() => setSort(key)}>
        {label}
        {sort === key ? ' ↓' : ''}
      </button>
    </th>
  );

  return (
    <div>
      <div className="table-tools">
        <div className="chips scroll-x" role="group" aria-label="Varlık grubu">
          {(['all', ...Object.keys(ASSET_GROUPS)] as Filter[]).map((g) => (
            <button
              key={g}
              className={`chip${filter === g ? ' active' : ''}`}
              aria-pressed={filter === g}
              onClick={() => setFilter(g)}
            >
              {g === 'all' ? 'Tümü' : ASSET_GROUPS[g]}
            </button>
          ))}
        </div>
        <label className="sort-select only-narrow">
          Sırala
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {(Object.keys(SORTS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORTS[k].label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="table-wrap">
        <table className="ranking">
          <thead>
            <tr>
              <th className="hide-narrow">#</th>
              <th>Varlık</th>
              <th className="num hide-narrow">Biriken</th>
              {header('value', 'Bugünkü değer')}
              {header('gainPct', 'Toplam', 'hide-narrow')}
              {header('xirr', hasXirr ? 'Yıllık' : 'Yıllık*')}
              {header('real', 'Reel', 'hide-narrow')}
              <th className="bar-col hide-narrow" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const def = getAsset(r.assetId);
              const warnings = analysis.warnings?.[r.assetId] ?? [];
              const partial = r.missingCount > 0;
              return (
                <tr
                  key={r.assetId}
                  className={[r.assetId === PRIMARY_ASSET && 'highlight', partial && 'partial'].filter(Boolean).join(' ')}
                >
                  <td className="muted hide-narrow">{i + 1}</td>
                  <td title={def.note} className="asset-cell">
                    <span className="dot" style={{ background: def.color }} />
                    {def.label}
                    <span className="group-tag">{ASSET_GROUPS[def.group]}</span>
                    <span className="only-narrow sub">
                      {def.kind === 'unit' ? `${formatUnits(r.assetId, r.totalUnits)}, ` : ''}toplam {formatPct(r.gainPct)}
                    </span>
                    {def.note && <span className="info" aria-label={def.note}>ⓘ</span>}
                    {partial && (
                      <div className="warn-text small">
                        {r.missingCount} ödeme hariç (bu tarihlerde veri yok) — yalnızca {formatTL(r.coveredPaid)} kapsanıyor
                      </div>
                    )}
                    {warnings.map((w) => (
                      <div key={w} className="warn-text small">
                        ⚠ {w}
                      </div>
                    ))}
                  </td>
                  <td className="num hide-narrow">{def.kind === 'unit' ? formatUnits(r.assetId, r.totalUnits) : '—'}</td>
                  <td className="num strong">{formatTL(r.currentValue)}</td>
                  <td className={`num hide-narrow ${tone(r.gainPct)}`}>{formatPct(r.gainPct)}</td>
                  <td className={`num ${tone(r.xirr)}`}>{formatRate(r.xirr)}</td>
                  <td className={`num hide-narrow ${tone(r.real?.gain)}`}>
                    {r.real ? (r.real.xirr !== null ? formatRate(r.real.xirr) : formatPct(r.real.gainPct)) : '—'}
                  </td>
                  <td className="bar-col hide-narrow">
                    <div className="bar">
                      <div
                        className="bar-value"
                        style={{ width: `${((r.currentValue ?? 0) / maxValue) * 100}%`, background: def.color }}
                      />
                      <div className="bar-paid" style={{ left: `${(r.coveredPaid / maxValue) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="notes">
        <li>
          <b>Yıllık</b>: para ağırlıklı yıllık getiri (XIRR); erken ödenen para daha uzun süre çalıştığı için daha ağır
          sayılır. {hasXirr ? '' : 'Yatırım 1 yıldan kısa olduğu için yıllık getiri gösterilmez; sıralama toplam getiriye göre. '}
          <b>Reel</b>: TÜFE'ye göre enflasyondan arındırılmış getiri (yıllık; 1 yıldan kısaysa toplam).
        </li>
        <li>
          Alım-satım maliyeti, altın primi, mevduat ve temettü stopajı <b>Hesaplama varsayımları</b> ekranından
          değiştirilebilir. Vergi ve masraflar dışında kalan kesintiler hesaba katılmaz.
        </li>
        <li>
          Hisselerde net temettü (stopaj sonrası) yeniden yatırılır; BIST 100 fiyat endeksidir, temettü içermez. ABD
          hisseleri aynı günün USD/TRY kuruyla çevrilir; kur ve borsa kapanış saatleri farklı olduğundan küçük günlük
          sapmalar olabilir.
        </li>
        <li>Çubuktaki çizgi ödenen tutarı gösterir.</li>
      </ul>
    </div>
  );
}
