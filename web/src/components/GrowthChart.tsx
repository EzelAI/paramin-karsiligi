import {
  ASSET_IDS,
  ASSETS,
  DEFLATOR_ASSET,
  FEATURED_ASSETS,
  isAssetId,
  PRIMARY_ASSET,
  type AssetId,
  type TimelinePoint,
} from '@paramin-karsiligi/shared';
import { useEffect, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMonth, formatTL, formatTLShort } from '../lib/format';
import { readItem, writeItem } from '../lib/storage';

// v2: varsayılan seçime enflasyon eklendi
const SELECTED_KEY = 'altin.chartAssets.v2';
const DEFAULT_SELECTION: AssetId[] = [PRIMARY_ASSET, DEFLATOR_ASSET, ...FEATURED_ASSETS];

function readSelection(): AssetId[] {
  const saved = readItem<unknown>(SELECTED_KEY);
  return Array.isArray(saved) ? saved.filter(isAssetId) : DEFAULT_SELECTION;
}

/** partial: bazı ödemeleri fiyat verisi olmadığı için hariç tutulan varlıklar (çizgileri olduğundan düşük görünür) */
export function GrowthChart({ timeline, partial }: { timeline: TimelinePoint[]; partial: ReadonlySet<AssetId> }) {
  const [selected, setSelected] = useState<AssetId[]>(readSelection);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => writeItem(SELECTED_KEY, selected), [selected]);

  const toggle = (id: AssetId) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const data = timeline.map((t) => ({ month: t.month, paid: t.paid, ...t.values }));
  const chipAssets = showAll ? ASSET_IDS : ASSET_IDS.filter((id) => DEFAULT_SELECTION.includes(id) || selected.includes(id));

  return (
    <div>
      <div className="chips">
        {chipAssets.map((id) => (
          <button
            key={id}
            className={`chip${selected.includes(id) ? ' active' : ''}`}
            style={selected.includes(id) ? { borderColor: ASSETS[id].color } : undefined}
            onClick={() => toggle(id)}
          >
            <span className="dot" style={{ background: ASSETS[id].color }} />
            {ASSETS[id].shortLabel}
          </button>
        ))}
        <button className="chip ghost" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Daha az' : 'Tüm hisseler…'}
        </button>
      </div>
      <div className="chart">
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fill: 'var(--muted)', fontSize: 12 }} minTickGap={24} />
            <YAxis tickFormatter={formatTLShort} tick={{ fill: 'var(--muted)', fontSize: 12 }} width={72} />
            <Tooltip
              formatter={(v: number) => formatTL(v)}
              labelFormatter={formatMonth}
              itemSorter={(item) => -(Number(item.value) || 0)}
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
            />
            <Legend />
            <Line
              type="stepAfter"
              dataKey="paid"
              name="Ödenen TL"
              stroke="var(--muted)"
              strokeDasharray="4 4"
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
            {ASSET_IDS.filter((id) => selected.includes(id)).map((id) => (
              <Line
                key={id}
                type="monotone"
                dataKey={id}
                name={`${ASSETS[id].shortLabel}${partial.has(id) ? '*' : ''}`}
                stroke={ASSETS[id].color}
                strokeDasharray={id === DEFLATOR_ASSET ? '8 3' : undefined}
                dot={false}
                isAnimationActive={false}
                strokeWidth={id === PRIMARY_ASSET || id === DEFLATOR_ASSET ? 3 : 1.5}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="muted small">
        Enflasyon çizgisi, ödemelerinizin TÜFE'ye göre o ayki karşılığıdır: bunun üstündeki varlıklar paranızın değerini
        korumuş demektir.
        {selected.some((id) => partial.has(id)) &&
          ' * işaretli varlıklarda veri başlamadan önceki ödemeler hariç olduğu için çizgi olduğundan düşük görünür.'}
      </p>
    </div>
  );
}
