import { ASSET_IDS } from '@paramin-karsiligi/shared';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAnalysis, useDeleteInvestment, useInvestment, useUpdateInvestment } from '../api/hooks';
import { formatTL } from '../lib/format';
import { readItem, writeItem } from '../lib/storage';
import { FeaturedCards, Hero } from './AssetCards';
import { ComparisonTable } from './ComparisonTable';
import { GrowthChart } from './GrowthChart';
import { PageHeader } from './PageHeader';
import { PaymentEntry } from './PaymentEntry';
import { PaymentsTable } from './PaymentsTable';

type Tab = 'summary' | 'compare' | 'payments';
const TAB_KEY = 'altin.investmentTab';

export function InvestmentView({ investmentId }: { investmentId: number }) {
  const { data: investment, error } = useInvestment(investmentId);
  const analysis = useAnalysis(investmentId);
  const update = useUpdateInvestment(investmentId);
  const remove = useDeleteInvestment();
  const [tab, setTab] = useState<Tab>(() => readItem<Tab>(TAB_KEY) ?? 'summary');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => writeItem(TAB_KEY, tab), [tab]);

  if (error) return <p className="error">{error.message}</p>;
  if (!investment) return <p className="muted">Yükleniyor…</p>;

  const hasPayments = investment.payments.length > 0;
  // Ödeme eklenince ödeme listesi analizden önce yenilenir; ödeme sayısı tutmayan eski analizi gösterme
  const d = analysis.data;
  const fresh = d && d.paymentCount + d.planned.length === investment.payments.length ? d : undefined;
  // Kartlar ve tablo için en az bir gerçekleşmiş ödeme gerekir (yalnızca planlanan olabilir)
  const a = fresh && fresh.paymentCount > 0 ? fresh : undefined;

  const exportExcel = () => {
    setExporting(true);
    setExportError(null);
    api
      .exportExcel(investment.id)
      .catch((err: Error) => setExportError(`Excel oluşturulamadı: ${err.message}`))
      .finally(() => setExporting(false));
  };

  const payments = (
    <>
      <section className="panel">
        <h2>Ödeme ekle</h2>
        <PaymentEntry investmentId={investment.id} />
      </section>
      {hasPayments && (
        <section className="panel">
          <h2>Ödemeler ({investment.payments.length})</h2>
          <PaymentsTable payments={investment.payments} analysis={fresh} />
        </section>
      )}
    </>
  );

  return (
    <div className="page">
      <PageHeader
        title={investment.name}
        onRename={(name) => update.mutate({ name, description: investment.description })}
        onDelete={() => confirm(`"${investment.name}" ve tüm ödemeleri silinsin mi?`) && remove.mutate(investment.id)}
        actions={
          hasPayments && (
            <button className="btn ghost" onClick={exportExcel} disabled={exporting}>
              {exporting ? 'Hazırlanıyor…' : "Excel'e aktar"}
            </button>
          )
        }
      />

      {exportError && <p className="error">{exportError}</p>}
      {analysis.error && <p className="error">Hesaplama yapılamadı: {analysis.error.message}</p>}

      {fresh && fresh.planned.length > 0 && (
        <p className="warning">
          {fresh.planned.length} planlanan ödeme ({formatTL(fresh.plannedTotal)}) bugünden sonraya tarihli; tarihi gelene kadar
          hesaplara katılmaz.
        </p>
      )}

      {!hasPayments ? (
        <>
          <p className="lead">
            İlk ödemenizi girin: peşinat için "Tek ödeme", taksitler için "Aylık taksit". Her ödeme o günün altın fiyatına
            çevrilir.
          </p>
          {payments}
        </>
      ) : !a ? (
        <>
          {!fresh && !analysis.error && <p className="muted">Hesaplanıyor…</p>}
          {payments}
        </>
      ) : (
        <>
          <Hero analysis={a} compact={tab !== 'summary'} />

          <div className="tabs page-tabs" role="tablist" aria-label="Yatırım bölümleri">
            {(
              [
                ['summary', 'Özet'],
                ['compare', 'Karşılaştırma'],
                ['payments', `Ödemeler`],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'summary' && (
            <>
              <section className="block">
                <h2>Aynı parayla başka ne olurdu?</h2>
                <FeaturedCards analysis={a} />
                <button className="link-btn" onClick={() => setTab('compare')}>
                  {ASSET_IDS.length} seçeneğin tamamını karşılaştırın
                </button>
              </section>
              <section className="panel">
                <h2>Birikimin zaman içindeki değeri</h2>
                <GrowthChart
                  timeline={a.timeline}
                  partial={new Set(ASSET_IDS.filter((id) => (a.assets[id]?.missingCount ?? 0) > 0))}
                />
              </section>
            </>
          )}
          {tab === 'compare' && (
            <section className="panel">
              <h2>Bu parayla başka ne alsaydınız?</h2>
              <ComparisonTable analysis={a} />
            </section>
          )}
          {tab === 'payments' && payments}
        </>
      )}
    </div>
  );
}
