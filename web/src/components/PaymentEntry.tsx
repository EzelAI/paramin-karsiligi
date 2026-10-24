import { monthRange, toIsoDate } from '@paramin-karsiligi/shared';
import { useState, type FormEvent } from 'react';
import { useAddBulkPayments, useAddPayment } from '../api/hooks';
import { formatTL, parseAmount } from '../lib/format';
import { AmountInput } from './AmountInput';

type Mode = 'monthly' | 'single';

export function PaymentEntry({ investmentId }: { investmentId: number }) {
  const [mode, setMode] = useState<Mode>('monthly');
  return (
    <div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={mode === 'monthly'} className={mode === 'monthly' ? 'active' : ''} onClick={() => setMode('monthly')}>
          Aylık taksit
        </button>
        <button role="tab" aria-selected={mode === 'single'} className={mode === 'single' ? 'active' : ''} onClick={() => setMode('single')}>
          Tek ödeme (peşinat vb.)
        </button>
      </div>
      {mode === 'monthly' ? <MonthlyForm investmentId={investmentId} /> : <SingleForm investmentId={investmentId} />}
    </div>
  );
}

function SingleForm({ investmentId }: { investmentId: number }) {
  const [date, setDate] = useState(toIsoDate(new Date()));
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const add = useAddPayment(investmentId);
  const value = parseAmount(amount);
  const valid = date && value > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    add.mutate({ date, amount: value, note: note.trim() || null }, { onSuccess: () => (setAmount(''), setNote('')) });
  };

  return (
    <form className="form-grid entry" onSubmit={submit}>
      <label>
        Tarih
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label>
        Tutar (TL)
        <AmountInput placeholder="2.000.000" value={amount} onChange={setAmount} required />
      </label>
      <label className="grow">
        Not
        <input placeholder="Peşinat" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button className="btn primary" disabled={!valid || add.isPending}>
        Ekle
      </button>
      {add.error && <p className="error full">{add.error.message}</p>}
    </form>
  );
}

function MonthlyForm({ investmentId }: { investmentId: number }) {
  const thisMonth = toIsoDate(new Date()).slice(0, 7);
  const [startMonth, setStartMonth] = useState(thisMonth);
  const [endMonth, setEndMonth] = useState(thisMonth);
  const [day, setDay] = useState('1');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const add = useAddBulkPayments(investmentId);

  const value = parseAmount(amount);
  const dayNum = Number(day);
  const count = startMonth && endMonth && startMonth <= endMonth ? monthRange(startMonth, endMonth).length : 0;
  const valid = value > 0 && count > 0 && dayNum >= 1 && dayNum <= 31;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    add.mutate(
      { startMonth, endMonth, day: dayNum, amount: value, note: note.trim() || null },
      { onSuccess: () => (setAmount(''), setNote('')) },
    );
  };

  return (
    <form className="form-grid entry" onSubmit={submit}>
      <label>
        İlk ay
        <input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} required />
      </label>
      <label>
        Son ay
        <input type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} required />
      </label>
      <label className="narrow">
        Ayın günü
        <input type="number" inputMode="numeric" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} required />
      </label>
      <label>
        Aylık tutar (TL)
        <AmountInput placeholder="50.000" value={amount} onChange={setAmount} required />
      </label>
      <label className="grow">
        Not
        <input placeholder="Taksit" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button className="btn primary" disabled={!valid || add.isPending}>
        {count > 0 ? `${count} ödeme ekle` : 'Ekle'}
      </button>
      {valid && (
        <p className="muted small full">
          {count} ay × {formatTL(value)} = {formatTL(count * value)}
          {endMonth > thisMonth && ' · bugünden sonraki aylar planlanan ödeme olarak kaydedilir'}
        </p>
      )}
      {add.error && <p className="error full">{add.error.message}</p>}
    </form>
  );
}
