import { useEffect, useState } from 'react';
import { useInvestments, usePlans } from './api/hooks';
import { DisclaimerFooter, DisclaimerNotice } from './components/Disclaimer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { InvestmentView } from './components/InvestmentView';
import { PlanView } from './components/PlanView';
import { SettingsView } from './components/SettingsView';
import { MobileTabBar, MobileTopBar, PriceStatusPanel, Sidebar, type NavProps, type Page, type Section } from './components/Sidebar';
import { readItem, writeItem } from './lib/storage';

const SECTION_KEY = 'altin.section';
const SELECTED_KEYS: Record<Section, string> = { bought: 'altin.selectedInvestment', planned: 'altin.selectedPlan' };

function readSelected(section: Section): number | null {
  const v = readItem<number>(SELECTED_KEYS[section]);
  return Number.isInteger(v) && v! > 0 ? v : null;
}

/** Bölümün seçili kaydı; silindiyse ya da hiç seçilmediyse ilki */
function useSelection(section: Section, items: { id: number }[] | undefined) {
  const [selectedId, setSelectedId] = useState<number | null>(() => readSelected(section));

  useEffect(() => {
    if (!items) return;
    if (selectedId === null || !items.some((i) => i.id === selectedId)) setSelectedId(items[0]?.id ?? null);
  }, [items, selectedId]);

  useEffect(() => {
    if (selectedId !== null) writeItem(SELECTED_KEYS[section], selectedId);
  }, [section, selectedId]);

  return [selectedId, setSelectedId] as const;
}

export function App() {
  const investments = useInvestments();
  const plans = usePlans();
  const [section, setSection] = useState<Section>(() => (readItem<Section>(SECTION_KEY) === 'planned' ? 'planned' : 'bought'));
  const [page, setPage] = useState<Page>('main');
  const [investmentId, setInvestmentId] = useSelection('bought', investments.data);
  const [planId, setPlanId] = useSelection('planned', plans.data);

  useEffect(() => writeItem(SECTION_KEY, section), [section]);
  // Sayfa değişince başa dön (mobilde alt menüden geçişlerde)
  // Yeni tarayıcılarda scrollTo bir Promise döndürür; etkiden döndürülmemeli
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [page, section]);

  const list = section === 'bought' ? investments : plans;
  const selectedId = section === 'bought' ? investmentId : planId;

  const nav: NavProps = {
    section,
    onSection: (s) => (setSection(s), setPage('main')),
    items: list.data ?? [],
    selectedId: page === 'main' ? selectedId : null,
    onSelect: (id) => {
      (section === 'bought' ? setInvestmentId : setPlanId)(id);
      setPage('main');
    },
    page,
    onPage: setPage,
  };

  return (
    <div className="app">
      <Sidebar {...nav} />
      <div className="app-main">
        <MobileTopBar {...nav} />
        <main className="main" id="icerik">
          {page === 'settings' ? (
            <ErrorBoundary key="settings">
              <SettingsView onClose={() => setPage('main')} />
            </ErrorBoundary>
          ) : page === 'prices' ? (
            <div className="page">
              <h1 className="page-title">Güncel fiyatlar</h1>
              <PriceStatusPanel />
            </div>
          ) : selectedId !== null ? (
            <ErrorBoundary key={`${section}-${selectedId}`}>
              {section === 'bought' ? <InvestmentView investmentId={selectedId} /> : <PlanView planId={selectedId} />}
            </ErrorBoundary>
          ) : list.error ? (
            <p className="error">{list.error.message}</p>
          ) : (
            !list.isLoading && <EmptySection section={section} />
          )}
          <DisclaimerFooter />
        </main>
      </div>
      <MobileTabBar {...nav} />
      <DisclaimerNotice />
    </div>
  );
}

function EmptySection({ section }: { section: Section }) {
  return (
    <div className="empty">
      {section === 'bought' ? (
        <>
          <h1>Ödediğiniz para bugün ne ederdi?</h1>
          <p>
            Bir ev, araba ya da başka bir şey için yaptığınız ödemeleri girin. Her ödemeyi o günün altın fiyatına
            çevirip bugün kaç TL edeceğini; dolar, euro, faiz ve hisselerle karşılaştırmasını gösteririz.
          </p>
          <ol className="steps">
            <li>{isDesktopHint('Soldan', 'Üstten')} bir yatırım ekleyin, ör. "Ev".</li>
            <li>Peşinatı ve aylık taksitleri girin.</li>
            <li>Altın karşılığını ve karşılaştırmayı görün.</li>
          </ol>
        </>
      ) : (
        <>
          <h1>Peşin mi alsanız, taksitle mi?</h1>
          <p>
            Almayı düşündüğünüz ürünün peşin ve taksitli fiyatını girin. Peşin parayı faizde, altında ya da dolarda
            tutup taksitleri oradan ödeseydiniz hangisinin daha ucuza geleceğini hesaplarız.
          </p>
          <ol className="steps">
            <li>{isDesktopHint('Soldan', 'Üstten')} bir ürün ekleyin, ör. "Araba".</li>
            <li>Peşin fiyatı ve taksit tutarını girin.</li>
            <li>Sonucu ve ödeme planını görün.</li>
          </ol>
        </>
      )}
    </div>
  );
}

/** Masaüstünde liste solda, mobilde üstte */
const isDesktopHint = (desktop: string, mobile: string) => (
  <>
    <span className="only-wide">{desktop}</span>
    <span className="only-narrow">{mobile}</span>
  </>
);
