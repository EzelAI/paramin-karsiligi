import { ASSETS, newPurchasePlan, type AssetId } from '@paramin-karsiligi/shared';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useCreateInvestment, useCreatePlan, usePriceStatus, useRefreshPrices } from '../api/hooks';
import { formatDate, formatNumber, formatTL } from '../lib/format';
import { IS_STATIC } from '../lib/storage';
import { IconPlus, IconPulse, IconReceipt, IconSliders, IconTag } from './Icons';

const SIDEBAR_ASSETS: AssetId[] = ['GRAM_GOLD', 'USD', 'EUR', 'FAIZ', 'XU100'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/**
 * İki ayrı hesap: aldıklarım (yapılmış ödemelerin bugünkü karşılığı) ve alacaklarım (peşin/taksit karşılaştırması)
 */
export type Section = 'bought' | 'planned';

/** Ana alanda gösterilen sayfa; fiyatlar sayfası yalnızca mobilde (masaüstünde fiyatlar kenar çubuğunda) */
export type Page = 'main' | 'settings' | 'prices';

export const SECTIONS: Record<Section, { label: string; hint: string; placeholder: string }> = {
  bought: {
    label: 'Aldıklarım',
    hint: 'Ödediğiniz paranın altın, döviz, faiz ve hisselere göre bugünkü karşılığı',
    placeholder: 'Yeni yatırım, ör. Ev',
  },
  planned: {
    label: 'Alacaklarım',
    hint: 'Alacağınız ürün için peşin mi, taksit mi daha avantajlı',
    placeholder: 'Alınacak ürün, ör. Araba',
  },
};

export interface NavProps {
  section: Section;
  onSection: (s: Section) => void;
  items: { id: number; name: string }[];
  /** Ana sayfa dışındayken null */
  selectedId: number | null;
  onSelect: (id: number) => void;
  page: Page;
  onPage: (p: Page) => void;
}

/** Masaüstü: sol kenar çubuğu */
export function Sidebar({ section, onSection, items, selectedId, onSelect, page, onPage }: NavProps) {
  return (
    <aside className="rail">
      <Brand />
      {IS_STATIC && <SessionNote />}

      <div className="section-switch" role="tablist" aria-label="Bölüm">
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

      <nav className="item-list" aria-label={SECTIONS[section].label}>
        {items.map((item) => (
          <button
            key={item.id}
            className={`item${item.id === selectedId ? ' active' : ''}`}
            aria-current={item.id === selectedId ? 'page' : undefined}
            onClick={() => onSelect(item.id)}
          >
            {item.name}
          </button>
        ))}
      </nav>
      <NewItemForm section={section} onCreated={onSelect} />

      <div className="rail-foot">
        <PriceStatusPanel compact />
        <button
          className={`item settings-link${page === 'settings' ? ' active' : ''}`}
          onClick={() => onPage(page === 'settings' ? 'main' : 'settings')}
        >
          <IconSliders />
          Hesaplama varsayımları
        </button>
      </div>
    </aside>
  );
}

/** Mobil: üst çubuk ve kayıtlar arasında yatay geçiş */
export function MobileTopBar({ section, items, selectedId, onSelect, page }: NavProps) {
  const [adding, setAdding] = useState(false);
  const ref = useRef<HTMLElement>(null);

  // Yapışkan sekmeler üst çubuğun altında dursun diye yüksekliğini CSS değişkeni olarak yayınla
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--topbar-h', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const title = page === 'settings' ? 'Hesaplama varsayımları' : page === 'prices' ? 'Güncel fiyatlar' : SECTIONS[section].label;

  return (
    <header className="topbar" ref={ref}>
      <div className="topbar-row">
        <Brand />
        <span className="topbar-title">{title}</span>
      </div>
      {page === 'main' && (
        <>
          <div className="strip" role="tablist" aria-label={SECTIONS[section].label}>
            {items.map((item) => (
              <button
                key={item.id}
                role="tab"
                aria-selected={item.id === selectedId}
                className={`strip-item${item.id === selectedId ? ' active' : ''}`}
                onClick={() => onSelect(item.id)}
              >
                {item.name}
              </button>
            ))}
            <button
              className={`strip-item add${adding ? ' active' : ''}`}
              onClick={() => setAdding((v) => !v)}
              aria-expanded={adding}
            >
              <IconPlus />
              {items.length === 0 ? (section === 'bought' ? 'Yatırım ekle' : 'Ürün ekle') : 'Yeni'}
            </button>
          </div>
          {adding && (
            <NewItemForm
              section={section}
              autoFocus
              onCreated={(id) => {
                setAdding(false);
                onSelect(id);
              }}
            />
          )}
        </>
      )}
      {IS_STATIC && page === 'main' && items.length === 0 && <SessionNote />}
    </header>
  );
}

/** Mobil: alt sekme çubuğu */
export function MobileTabBar({ section, onSection, page, onPage }: NavProps) {
  const tab = (active: boolean, label: string, icon: ReactNode, onClick: () => void) => (
    <button className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
  return (
    <nav className="tabbar" aria-label="Ana menü">
      {tab(page === 'main' && section === 'bought', 'Aldıklarım', <IconReceipt />, () => (onSection('bought'), onPage('main')))}
      {tab(page === 'main' && section === 'planned', 'Alacaklarım', <IconTag />, () => (onSection('planned'), onPage('main')))}
      {tab(page === 'prices', 'Fiyatlar', <IconPulse />, () => onPage('prices'))}
      {tab(page === 'settings', 'Varsayımlar', <IconSliders />, () => onPage('settings'))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden />
      Paramın Karşılığı
    </div>
  );
}

function SessionNote() {
  return (
    <p className="session-note">
      Girdiğiniz bilgiler hiçbir yere gönderilmez, yalnızca bu sekmede tutulur ve sekmeyi kapatınca silinir.
    </p>
  );
}

function NewItemForm({ section, onCreated, autoFocus }: { section: Section; onCreated: (id: number) => void; autoFocus?: boolean }) {
  const [name, setName] = useState('');
  const createInvestment = useCreateInvestment();
  const createPlan = useCreatePlan();
  const create = section === 'bought' ? createInvestment : createPlan;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    const done = (item: { id: number }) => (setName(''), onCreated(item.id));
    if (section === 'bought') createInvestment.mutate({ name: n }, { onSuccess: done });
    else createPlan.mutate(newPurchasePlan(n), { onSuccess: done });
  };

  return (
    <form className="new-item" onSubmit={submit}>
      <input
        aria-label={SECTIONS[section].placeholder}
        placeholder={SECTIONS[section].placeholder}
        value={name}
        autoFocus={autoFocus}
        enterKeyHint="done"
        onChange={(e) => setName(e.target.value)}
      />
      <button type="submit" className="btn primary" disabled={create.isPending || !name.trim()}>
        Ekle
      </button>
      {create.error && <p className="error">{create.error.message}</p>}
    </form>
  );
}

/** Güncel fiyatlar: masaüstünde kenar çubuğunda (compact), mobilde ayrı sayfada */
export function PriceStatusPanel({ compact = false }: { compact?: boolean }) {
  const { data, error, isLoading } = usePriceStatus();
  const refresh = useRefreshPrices();
  const cpi = data?.find((s) => s.assetId === 'TUFE');
  // TÜFE bir endekstir, fiyatı anlamlı değil; son açıklanan ay aşağıda yazılır
  const shown = data?.filter((s) => (compact ? SIDEBAR_ASSETS.includes(s.assetId as AssetId) : s.assetId !== 'TUFE'));

  return (
    <div className={`prices${compact ? ' compact' : ''}`}>
      {compact && <div className="prices-title">Güncel fiyatlar</div>}
      {isLoading && <p className="muted">Fiyatlar yükleniyor…</p>}
      {error && <p className="error">{error.message}</p>}
      <dl className="price-list">
        {shown?.map((s) => (
          <div key={s.assetId} className="price-row">
            <dt>{compact ? ASSETS[s.assetId as AssetId].shortLabel : ASSETS[s.assetId as AssetId].label}</dt>
            <dd title={s.ratePct != null ? `Politika faizi (brüt), son karar ${formatDate(s.sourceLastDate)}` : undefined}>
              {s.ratePct != null ? `%${formatNumber(s.ratePct)}` : formatTL(s.lastPrice)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="prices-meta">
        {data?.[0]?.lastDate && <>Son piyasa verisi {formatDate(data[0].lastDate)}. </>}
        {cpi?.sourceLastDate && (
          <>
            Son TÜFE {MONTHS[Number(cpi.sourceLastDate.slice(5, 7)) - 1]} {cpi.sourceLastDate.slice(0, 4)}.{' '}
          </>
        )}
        Kaynak: TCMB, Yahoo Finance. Veriler gecikmeli olabilir, bilgi amaçlıdır.
        {IS_STATIC && ' Fiyatlar her gün otomatik güncellenir.'}
      </p>
      {!IS_STATIC && (
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
