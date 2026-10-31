import { addMonths, daysInMonth, monthEnd, monthStart } from './dates.ts';

export type PeriodKind = 'month' | '3m' | '6m' | '12m';

export interface Period {
  /** Month keys covered, oldest first. */
  months: string[];
  from: string;
  to: string;
  prev: { months: string[]; from: string; to: string };
}

const SPAN: Record<PeriodKind, number> = { month: 1, '3m': 3, '6m': 6, '12m': 12 };

/** `anchor` is the last month of the period (YYYY-MM). The previous period is the same length, directly before. */
export function periodFor(kind: PeriodKind, anchor: string): Period {
  const n = SPAN[kind];
  const months = Array.from({ length: n }, (_, i) => addMonths(anchor, i - n + 1));
  const prevMonths = Array.from({ length: n }, (_, i) => addMonths(anchor, i - 2 * n + 1));
  return {
    months,
    from: monthStart(months[0]),
    to: monthEnd(months[n - 1]),
    prev: { months: prevMonths, from: monthStart(prevMonths[0]), to: monthEnd(prevMonths[n - 1]) },
  };
}

/** Days in the period that have actually happened as of `today` (for a fair daily average). */
export function elapsedDays(p: Period, today: string): number {
  if (today < p.from) return 0;
  const total = p.months.reduce((s, m) => s + daysInMonth(m), 0);
  if (today >= p.to) return total;
  const [y, m, d] = [today.slice(0, 4), today.slice(5, 7), Number(today.slice(8))];
  const idx = p.months.indexOf(`${y}-${m}`);
  const before = p.months.slice(0, idx).reduce((s, mk) => s + daysInMonth(mk), 0);
  return before + d;
}
