import { ASSET_IDS } from '@paramin-karsiligi/shared';
import { useState } from 'react';
import { api } from '../api/client';
import { useAnalysis, useDeleteInvestment, useInvestment, useUpdateInvestment } from '../api/hooks';
import { formatDate, formatTL } from '../lib/format';
import { AssetCards } from './AssetCards';
import { ComparisonTable } from './ComparisonTable';
import { GrowthChart } from './GrowthChart';
import { PaymentEntry } from './PaymentEntry';
import { PaymentsTable } from './PaymentsTable';

export function InvestmentView({ investmentId }: { investmentId: number }) {
  const { data: investment, error } = useInvestment(investmentId);
  const analysis = useAnalysis(investmentId);
  const update = useUpdateInvestment(investmentId);
  const remove = useDeleteInvestment();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  if (error) return <p className="error">{error.message}</p>;
  if (!investment) return <p className="muted">Yükleniyor…</p>;

  const hasPayments = investment.payments.length > 0;
  // Ödeme eklenince ödeme listesi analizden önce yenilenir; ödeme sayısı tutmayan eski analizi gösterme
  const d = analysis.data;
  const fresh = d && d.paymentCount + d.planned.length === investment.payments.length ? d : undefined;
  // Kartlar ve tablo için en az bir gerçekleşmiş ödeme gerekir (yalnızca planlanan olabilir)
  const a = fresh && fresh.paymentCount > 0 ? fresh : undefined;

  const saveName = () => {
    if (name.trim() && name.trim() !== investment.name) update.mutate({ name: name.trim(), description: investment.description });
    setEditing(false);
  };

  const exportExcel = () => {
    setExporting(true);
    setExportError(null);
    api
      .exportExcel(investment.id)
      .catch((err: Error) => setExportError(`Excel oluşturulamadı: ${err.message}`))
      .finally(() => setExporting(false));
  };

  const confirmDelete = () => {
    if (confirm(`"${investment.name}" ve tüm ödemeleri silinsin mi?`)) remove.mutate(investment.id);
  };

  return (
    <div className="inv-view">
      <header className="inv-header">
        {editing ? (
          <input
            className="title-input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => (e.key === 'Enter' ? saveName() : e.key === 'Escape' && setEditing(false))}
          />
        ) : (
          <h1 onDoubleClick={() => (setName(investment.name), setEditing(true))} title="Yeniden adlandırmak için çift tıklayın">
            {investment.name}
          </h1>
        )}
        <div className="header-actions">
          <button className="btn ghost" onClick={() => (setName(investment.name), setEditing(true))}>
            Yeniden adlandır
          </button>
          {hasPayments && (
            <button className="btn ghost" onClick={exportExcel} disabled={exporting}>
              {exporting ? 'Hazırlanıyor…' : "Excel'e aktar"}
            </button>
          )}
          <button className="btn danger-ghost" onClick={confirmDelete}>
            Sil
          </button>
        </div>
      </header>

      {exportError && <p className="error">{exportError}</p>}

      {a?.firstDate && a.lastDate && (
        <p className="muted">
          {a.paymentCount} ödeme · {formatDate(a.firstDate)} – {formatDate(a.lastDate)} · değerleme {formatDate(a.asOf)}
        </p>
      )}

      {fresh && fresh.planned.length > 0 && (
        <p className="warning">
          {fresh.planned.length} planlanan ödeme ({formatTL(fresh.plannedTotal)}) bugünden sonraya tarihli; tarihi gelene kadar
          hesaplara katılmaz.
        </p>
      )}

      {analysis.error && <p className="error">Hesaplama yapılamadı: {analysis.error.message}</p>}
      {hasPayments && !fresh && !analysis.error && <p className="muted">Hesaplanıyor…</p>}

      {a && (
        <>
          <AssetCards analysis={a} />
          <section className="card">
            <h2>Bu parayla başka ne alsaydınız?</h2>
            <ComparisonTable analysis={a} />
          </section>
          <section className="card">
            <h2>Birikim değeri</h2>
            <GrowthChart
              timeline={a.timeline}
              partial={new Set(ASSET_IDS.filter((id) => (a.assets[id]?.missingCount ?? 0) > 0))}
            />
          </section>
        </>
      )}

      <section className="card">
        <h2>Ödeme ekle</h2>
        <PaymentEntry investmentId={investment.id} />
      </section>

      {hasPayments && (
        <section className="card">
          <h2>Ödemeler</h2>
          <PaymentsTable payments={investment.payments} analysis={fresh} />
        </section>
      )}
    </div>
  );
}
