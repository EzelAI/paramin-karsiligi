import type { IsoDate } from './types';

/** Yerel saat dilimine göre ISO tarih */
export function toIsoDate(d: Date): IsoDate {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthOf(date: IsoDate): string {
  return date.slice(0, 7);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** startMonth..endMonth (dahil) arasındaki ayları YYYY-MM olarak döndürür */
export function monthRange(startMonth: string, endMonth: string): string[] {
  const [sy, sm] = startMonth.split('-').map(Number) as [number, number];
  const [ey, em] = endMonth.split('-').map(Number) as [number, number];
  const result: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return result;
}

/** Ay + gün → ISO tarih; gün ayın son gününü aşarsa son güne sabitlenir */
export function dateInMonth(month: string, day: number): IsoDate {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = Math.min(day, daysInMonth(y, m));
  return `${month}-${String(d).padStart(2, '0')}`;
}

/** Ayın son günü (ISO) */
export function endOfMonth(month: string): IsoDate {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return dateInMonth(month, daysInMonth(y, m));
}
