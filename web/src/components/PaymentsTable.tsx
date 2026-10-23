import { type InvestmentAnalysis, type Payment } from '@paramin-karsiligi/shared';
import { useMemo, useState } from 'react';
import { useDeletePayment, useUpdatePayment } from '../api/hooks';
import { formatDate, formatNumber, formatTL, formatUnits, parseAmount } from '../lib/format';

interface Props {
  payments: Payment[];
  analysis: InvestmentAnalysis | undefined;
}

export function PaymentsTable({ payments, analysis }: Props) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const remove = useDeletePayment();

  const conversions = useMemo(() => new Map(analysis?.payments.map((p) => [p.id, p.conversions])), [analysis]);
  const plannedIds = useMemo(() => new Set(analysis?.planned.map((p) => p.id)), [analysis]);

  // Kümülatif gram, tarih sırasına göre
  const rows = useMemo(() => {
    let cumGold = 0;
    return [...payments]
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
      .map((p) => {
        const c = conversions.get(p.id);
        cumGold += c?.GRAM_GOLD?.units ?? 0;
        return { payment: p, conv: c, cumGold };
      });
  }, [payments, conversions]);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Tarih</th>
            <th className="num">Tutar</th>
            <th className="num">Gram fiyatı</th>
            <th className="num">Altın</th>
            <th className="num">Toplam altın</th>
            <th className="num">USD</th>
            <th className="num">EUR</th>
            <th>Not</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ payment: p, conv, cumGold }) =>
            editingId === p.id ? (
              <EditRow key={p.id} payment={p} onDone={() => setEditingId(null)} />
            ) : (
              <tr key={p.id} className={plannedIds.has(p.id) ? 'planned' : undefined}>
                <td>
                  {formatDate(p.date)}
                  {plannedIds.has(p.id) && <span className="group-tag">Planlanan</span>}
                </td>
                <td className="num">{formatTL(p.amount)}</td>
                <td className="num">{formatTL(conv?.GRAM_GOLD?.price)}</td>
                <td className="num gold">{formatUnits('GRAM_GOLD', conv?.GRAM_GOLD?.units)}</td>
                <td className="num">{formatNumber(cumGold)} gr</td>
                <td className="num">{formatUnits('USD', conv?.USD?.units)}</td>
                <td className="num">{formatUnits('EUR', conv?.EUR?.units)}</td>
                <td className="note">{p.note}</td>
                <td className="actions">
                  <button className="icon-btn" title="Düzenle" onClick={() => setEditingId(p.id)}>
                    ✎
                  </button>
                  <button
                    className="icon-btn"
                    title="Sil"
                    disabled={remove.isPending}
                    onClick={() => confirm(`${formatDate(p.date)} tarihli ödeme silinsin mi?`) && remove.mutate(p.id)}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function EditRow({ payment, onDone }: { payment: Payment; onDone: () => void }) {
  const [date, setDate] = useState(payment.date);
  const [amount, setAmount] = useState(formatNumber(payment.amount));
  const [note, setNote] = useState(payment.note ?? '');
  const update = useUpdatePayment();
  const value = parseAmount(amount);

  const save = () => {
    if (!(value > 0) || !date) return;
    update.mutate({ id: payment.id, input: { date, amount: value, note: note.trim() || null } }, { onSuccess: onDone });
  };

  return (
    <tr className="editing">
      <td>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </td>
      <td>
        <input className="num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </td>
      <td colSpan={5} className="muted small">
        {update.error ? <span className="error">{update.error.message}</span> : 'Kaydedince altın karşılığı yeniden hesaplanır'}
      </td>
      <td>
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </td>
      <td className="actions">
        <button className="icon-btn" title="Kaydet" onClick={save} disabled={update.isPending}>
          ✓
        </button>
        <button className="icon-btn" title="Vazgeç" onClick={onDone}>
          ↺
        </button>
      </td>
    </tr>
  );
}
