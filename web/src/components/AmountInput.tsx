import type { InputHTMLAttributes } from 'react';
import { parseAmount } from '../lib/format';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
};

/** "1250000" → "1.250.000"; virgülden sonrası korunur. Sayı değilse olduğu gibi bırakır. */
export function formatAmountText(text: string): string {
  const v = parseAmount(text);
  if (!text.trim() || !Number.isFinite(v)) return text;
  return v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}

/**
 * TL tutarı girişi: telefonda sayı klavyesi açar, alandan çıkınca binlik ayırıcıları ekler.
 * Değer metin olarak tutulur (parseAmount ile sayıya çevrilir).
 */
export function AmountInput({ value, onChange, onBlur, ...rest }: Props) {
  return (
    <input
      inputMode="decimal"
      autoComplete="off"
      enterKeyHint="next"
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        const formatted = formatAmountText(value);
        if (formatted !== value) onChange(formatted);
        onBlur?.(e);
      }}
    />
  );
}
