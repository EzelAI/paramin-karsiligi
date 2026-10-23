import { useEffect, useState } from 'react';
import { useInvestments } from './api/hooks';
import { ErrorBoundary } from './components/ErrorBoundary';
import { InstallmentView } from './components/InstallmentView';
import { InvestmentView } from './components/InvestmentView';
import { SettingsView } from './components/SettingsView';
import { Sidebar, type Page } from './components/Sidebar';
import { readItem, writeItem } from './lib/storage';

const SELECTED_KEY = 'altin.selectedInvestment';

function readSelected(): number | null {
  const v = readItem<number>(SELECTED_KEY);
  return Number.isInteger(v) && v! > 0 ? v : null;
}

export function App() {
  const { data: investments = [], isLoading } = useInvestments();
  const [selectedId, setSelectedId] = useState<number | null>(readSelected);
  const [page, setPage] = useState<Page>('investment');

  // Seçili yatırım silindiyse ya da hiç seçilmediyse ilkini seç
  useEffect(() => {
    if (isLoading) return;
    if (selectedId === null || !investments.some((i) => i.id === selectedId)) {
      setSelectedId(investments[0]?.id ?? null);
    }
  }, [investments, isLoading, selectedId]);

  useEffect(() => {
    if (selectedId !== null) writeItem(SELECTED_KEY, selectedId);
  }, [selectedId]);

  return (
    <div className="layout">
      <Sidebar
        investments={investments}
        selectedId={page === 'investment' ? selectedId : null}
        onSelect={(id) => (setSelectedId(id), setPage('investment'))}
        page={page}
        onOpenPage={setPage}
      />
      <main className="main">
        {page === 'settings' ? (
          <ErrorBoundary key="settings">
            <SettingsView onClose={() => setPage('investment')} />
          </ErrorBoundary>
        ) : page === 'installment' ? (
          <ErrorBoundary key="installment">
            <InstallmentView />
          </ErrorBoundary>
        ) : selectedId !== null ? (
          <ErrorBoundary key={selectedId}>
            <InvestmentView investmentId={selectedId} />
          </ErrorBoundary>
        ) : (
          !isLoading && (
            <div className="empty">
              <h2>Henüz yatırım yok</h2>
              <p>Soldan bir yatırım ekleyin (ör. "Ev"), sonra ödemelerinizi girin.</p>
            </div>
          )
        )}
      </main>
    </div>
  );
}
