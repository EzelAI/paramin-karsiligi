import { useEffect, useState } from 'react';
import { useInvestments, usePlans } from './api/hooks';
import { ErrorBoundary } from './components/ErrorBoundary';
import { InvestmentView } from './components/InvestmentView';
import { PlanView } from './components/PlanView';
import { SettingsView } from './components/SettingsView';
import { SECTIONS, Sidebar, type Section } from './components/Sidebar';
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
  const [showSettings, setShowSettings] = useState(false);
  const [investmentId, setInvestmentId] = useSelection('bought', investments.data);
  const [planId, setPlanId] = useSelection('planned', plans.data);

  useEffect(() => writeItem(SECTION_KEY, section), [section]);

  const list = section === 'bought' ? investments : plans;
  const selectedId = section === 'bought' ? investmentId : planId;
  const select = (id: number) => {
    (section === 'bought' ? setInvestmentId : setPlanId)(id);
    setShowSettings(false);
  };

  return (
    <div className="layout">
      <Sidebar
        section={section}
        onSection={(s) => (setSection(s), setShowSettings(false))}
        items={list.data ?? []}
        selectedId={showSettings ? null : selectedId}
        onSelect={select}
        settingsOpen={showSettings}
        onOpenSettings={() => setShowSettings(true)}
      />
      <main className="main">
        {showSettings ? (
          <ErrorBoundary key="settings">
            <SettingsView onClose={() => setShowSettings(false)} />
          </ErrorBoundary>
        ) : selectedId !== null ? (
          <ErrorBoundary key={`${section}-${selectedId}`}>
            {section === 'bought' ? <InvestmentView investmentId={selectedId} /> : <PlanView planId={selectedId} />}
          </ErrorBoundary>
        ) : list.error ? (
          <p className="error">{list.error.message}</p>
        ) : (
          !list.isLoading && <EmptySection section={section} />
        )}
      </main>
    </div>
  );
}

function EmptySection({ section }: { section: Section }) {
  return (
    <div className="empty">
      <div className="eyebrow">{SECTIONS[section].label}</div>
      {section === 'bought' ? (
        <>
          <h2>Henüz yatırım yok</h2>
          <p>
            Aldığınız bir şey için (ör. "Ev") soldan bir yatırım ekleyin, sonra ödemelerinizi girin. O paranın altın, döviz,
            faiz ve hisselerde bugün ne kadar edeceğini gösteririz.
          </p>
        </>
      ) : (
        <>
          <h2>Henüz alacağınız bir ürün yok</h2>
          <p>
            Almayı düşündüğünüz bir ürünü (ör. "Araba") soldan ekleyin, peşin ve taksitli fiyatını girin. Peşin parayı faizde
            tutup taksitleri oradan ödeseydiniz hangisinin daha ucuza geleceğini hesaplarız.
          </p>
        </>
      )}
    </div>
  );
}
