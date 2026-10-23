import { ASSETS, newPurchasePlan, type AssetId } from '@paramin-karsiligi/shared';
import { useState, type FormEvent } from 'react';
import { useCreateInvestment, useCreatePlan, usePriceStatus, useRefreshPrices } from '../api/hooks';
import { formatDate, formatNumber, formatTL } from '../lib/format';
import { IS_STATIC } from '../lib/storage';

const SIDEBAR_ASSETS: AssetId[] = ['GRAM_GOLD', 'USD', 'EUR', 'FAIZ', 'XU100'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/**
 * İki ayrı hesap: aldıklarım (yapılmış ödemelerin bugünkü karşılığı) ve alacaklarım (peşin/taksit karşılaştırması)
 */
export type Section = 'bought' | 'planned';

export const SECTIONS: Record<Section, { label: string; hint: string; placeholder: string }> = {
  bought: {
    label: 'Aldıklarım',
    hint: 'Ödediğiniz paranın altın, döviz, faiz ve hisselere göre bugünkü karşılığı',
    placeholder: 'Yeni yatırım (ör. Ev)',
  },
  planned: {
    label: 'Alacaklarım',
    hint: 'Alacağınız ürün için peşin mi, taksit mi daha avantajlı',
    placeholder: 'Ürün (ör. Araba)',
  },
};

interface Props {
  section: Section;
  onSection: (s: Section) => void;
  items: { id: number; name: string }[];
  /** Ayarlar açıkken null */
  selectedId: number | null;
  onSelect: (id: number) => void;
  settingsOpen: boolean;
  onOpenSettings: () => void;
}

export function Sidebar({ section, onSection, items, selectedId, onSelect, settingsOpen, onOpenSettings }: Props) {
  const [name, setName] = useState('');
  const createInvestment = useCreateInvestment();
  const createPlan = useCreatePlan();
  const create = section === 'bought' ? createInvestment : createPlan;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    const done = (item: { id: number }) => (setName(''), onSelect(item.id));
    if (section === 'bought') createInvestment.mutate({ name: n }, { onSuccess: done });
    else createPlan.mutate(newPurchasePlan(n), { onSuccess: done });
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        Paramın Karşılığı
      </div>
      {IS_STATIC && (
        <p className="session-note">
          Girdiğiniz bilgiler hiçbir yere gönderilmez, yalnızca bu sekmede tutulur ve sekmeyi kapatınca silinir.
        </p>
      )}

      <div className="section-switch" role="tablist">
        {(Object.keys(SECTIONS) as Section[]).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={s === section}
            className={s === section ? 'active' : ''}
            onClick={() => onSection(s)}
          >
            {SECTIONS[s].label}
          </button>
        ))}
      </div>
      <p className="section-hint">{SECTIONS[section].hint}</p>

      <nav className="inv-list">
        {items.map((item) => (
          <button
            key={item.id}
            className={`inv-item${item.id === selectedId ? ' active' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            {item.name}
          </button>
        ))}
      </nav>

      <form className="new-inv" onSubmit={submit}>
        <input placeholder={SECTIONS[section].placeholder} value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn primary" disabled={create.isPending || !name.trim()}>
          Ekle
        </button>
      </form>
      {create.error && <p className="error">{create.error.message}</p>}

      <button className={`inv-item settings-link${settingsOpen ? ' active' : ''}`} onClick={onOpenSettings}>
        ⚙ Hesaplama varsayımları
      </button>

      <PriceStatusPanel />
    </aside>
  );
}

function PriceStatusPanel() {
  const { data, error, isLoading } = usePriceStatus();
  const refresh = useRefreshPrices();
  const cpi = data?.find((s) => s.assetId === 'TUFE');

  return (
    <div className="price-status">
      <div className="price-status-title">Güncel fiyatlar</div>
      {isLoading && <p className="muted">Fiyatlar yükleniyor…</p>}
      {error && <p className="error">{error.message}</p>}
      {data
        ?.filter((s) => SIDEBAR_ASSETS.includes(s.assetId as AssetId))
        .map((s) => (
          <div key={s.assetId} className="price-row">
            <span>{ASSETS[s.assetId as AssetId].shortLabel}</span>
            <strong title={s.ratePct != null ? `Politika faizi (brüt), son karar ${formatDate(s.sourceLastDate)}` : undefined}>
              {s.ratePct != null ? `%${formatNumber(s.ratePct)}` : formatTL(s.lastPrice)}
            </strong>
          </div>
        ))}
      {data?.[0]?.lastDate && <p className="muted small">Son piyasa verisi: {formatDate(data[0].lastDate)}</p>}
      {cpi?.sourceLastDate && (
        <p className="muted small">
          Son TÜFE: {MONTHS[Number(cpi.sourceLastDate.slice(5, 7)) - 1]} {cpi.sourceLastDate.slice(0, 4)}
        </p>
      )}
      {IS_STATIC ? (
        <p className="muted small">Fiyatlar her gün otomatik güncellenir.</p>
      ) : (
        <>
          <button className="btn ghost small" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            {refresh.isPending ? 'Güncelleniyor…' : 'Fiyatları güncelle'}
          </button>
          {refresh.error && <p className="error">{refresh.error.message}</p>}
        </>
      )}
    </div>
  );
}
