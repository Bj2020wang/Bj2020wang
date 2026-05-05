import { formatDateKey } from '@/lib/calendar-utils';

export function todoDateKeyToday(): string {
  const n = new Date();
  return formatDateKey(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

/** `datetime-local` 控件用的 `YYYY-MM-DDTHH:mm` */
export function todoToDatetimeLocalValue(dateKey: string, timeHHmm: string): string {
  const dk = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : todoDateKeyToday();
  const tm = /^\d{2}:\d{2}$/.test(timeHHmm) ? timeHHmm : '09:00';
  return `${dk}T${tm}`;
}

export function todoParseDatetimeLocal(v: string): { dateKey: string; time: string } | null {
  const [d, t] = v.split('T');
  if (!d || !t) return null;
  const time = t.length >= 5 ? t.slice(0, 5) : t;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [y, mo, day] = d.split('-').map(Number);
  const dt = new Date(y, mo - 1, day);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== day) return null;
  return { dateKey: d, time };
}
