import { ASSETS, type AssetId, type Investment } from '@paramin-karsiligi/shared';
import { useState, type FormEvent } from 'react';
import { useCreateInvestment, usePriceStatus, useRefreshPrices } from '../api/hooks';
import { formatDate, formatNumber, formatTL } from '../lib/format';
import { IS_STATIC } from '../lib/storage';

const SIDEBAR_ASSETS: AssetId[] = ['GRAM_GOLD', 'USD', 'EUR', 'FAIZ', 'XU100'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** Ana alanda gösterilen sayfa: seçili yatırım, varsayımlar ya da peşin/taksit hesabı */
export type Page = 'investment' | 'settings' | 'installment';

interface Props {
  investments: Investment[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  page: Page;
  onOpenPage: (page: Page) => void;
}

export function Sidebar({ investments, selectedId, onSelect, page, onOpenPage }: Props) {
  const [name, setName] = useState('');
  const create = useCreateInvestment();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate({ name: name.trim() }, { onSuccess: (inv) => (setName(''), onSelect(inv.id)) });
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

      <nav className="inv-list">
        {investments.map((inv) => (
          <button
            key={inv.id}
            className={`inv-item${inv.id === selectedId ? ' active' : ''}`}
            onClick={() => onSelect(inv.id)}
          >
            {inv.name}
          </button>
        ))}
      </nav>

      <form className="new-inv" onSubmit={submit}>
        <input placeholder="Yeni yatırım (ör. Ev)" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn primary" disabled={create.isPending || !name.trim()}>
          Ekle
        </button>
      </form>
      {create.error && <p className="error">{create.error.message}</p>}

      <button className={`inv-item settings-link${page === 'installment' ? ' active' : ''}`} onClick={() => onOpenPage('installment')}>
        ⚖ Peşin mi, taksit mi?
      </button>
      <button className={`inv-item settings-link${page === 'settings' ? ' active' : ''}`} onClick={() => onOpenPage('settings')}>
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
