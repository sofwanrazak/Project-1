import { addDays, addMonths, daysBetween, daysInMonth, fromDateStr, monthEnd, monthStart } from './dates.ts';
import type { Account, Category, Transaction } from './types.ts';

/* ------------------------------------------------------------------------------------------------
 * Pure analysis. Transfers never count as income or spending; amounts are integer minor units.
 * ---------------------------------------------------------------------------------------------- */

interface DayTotals {
  expense: number;
  income: number;
  count: number;
}

export function dailyTotals(txs: Transaction[], from: string, to: string): Map<string, DayTotals> {
  const m = new Map<string, DayTotals>();
  for (const t of txs) {
    if (t.date < from || t.date > to) continue;
    const row = m.get(t.date) ?? { expense: 0, income: 0, count: 0 };
    row.count++;
    if (t.kind === 'expense') row.expense += t.amount;
    else if (t.kind === 'income') row.income += t.amount;
    m.set(t.date, row);
  }
  return m;
}

/* ------------------------------------------------ calendar heatmap */

export interface HeatDay {
  date: string;
  day: number;
  expense: number;
  income: number;
  count: number;
  /** 0 = nothing spent; 1-4 = progressively heavier relative to this month's typical spending day. */
  level: 0 | 1 | 2 | 3 | 4;
  future: boolean;
  today: boolean;
  /** A day in the past with no spending at all. */
  noSpend: boolean;
}

export interface HeatMonth {
  /** Monday-first weeks; null pads the days outside the month. */
  weeks: (HeatDay | null)[][];
  total: number;
  /** Average over days that had spending. */
  avgSpendDay: number;
  heaviest: HeatDay | null;
  noSpendDays: number;
}

export function heatmapMonth(txs: Transaction[], key: string, today: string): HeatMonth {
  const from = monthStart(key);
  const to = monthEnd(key);
  const totals = dailyTotals(txs, from, to);
  const n = daysInMonth(key);

  let total = 0;
  let spendDays = 0;
  for (const [d, v] of totals) {
    if (d <= today && v.expense > 0) {
      total += v.expense;
      spendDays++;
    }
  }
  const avg = spendDays ? total / spendDays : 0;
  const levelOf = (e: number): HeatDay['level'] => (e <= 0 || avg === 0 ? 0 : e <= avg * 0.5 ? 1 : e <= avg ? 2 : e <= avg * 1.75 ? 3 : 4);

  const days: HeatDay[] = [];
  for (let i = 0; i < n; i++) {
    const date = addDays(from, i);
    const v = totals.get(date) ?? { expense: 0, income: 0, count: 0 };
    const future = date > today;
    days.push({ date, day: i + 1, expense: v.expense, income: v.income, count: v.count, level: future ? 0 : levelOf(v.expense), future, today: date === today, noSpend: !future && v.expense === 0 });
  }

  const lead = (fromDateStr(from).getDay() + 6) % 7; // Monday = 0
  const cells: (HeatDay | null)[] = [...Array<null>(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const weeks: (HeatDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const heaviest = days.filter((d) => !d.future && d.expense > 0).sort((a, b) => b.expense - a.expense)[0] ?? null;
  return { weeks, total, avgSpendDay: avg, heaviest, noSpendDays: days.filter((d) => d.noSpend).length };
}

/* ------------------------------------------------ month pace and forecast */

export interface Pace {
  days: number;
  /** Days of the month that have happened. */
  elapsed: number;
  /** Cumulative spending after day 1..elapsed. */
  actual: number[];
  /** Straight-line budget pace after day 1..days, or null without a budget. */
  ideal: number[] | null;
  /** Where the month ends if the average daily spend so far continues. */
  projectedEnd: number;
  budget: number | null;
  status: 'none' | 'under' | 'on-track' | 'over';
}

export function paceSeries(txs: Transaction[], budget: number | null, key: string, today: string): Pace {
  const n = daysInMonth(key);
  const elapsed = today < monthStart(key) ? 0 : today > monthEnd(key) ? n : Number(today.slice(8));
  const totals = dailyTotals(txs, monthStart(key), monthEnd(key));
  const actual: number[] = [];
  let run = 0;
  for (let d = 1; d <= elapsed; d++) {
    run += totals.get(addDays(monthStart(key), d - 1))?.expense ?? 0;
    actual.push(run);
  }
  const projectedEnd = elapsed === 0 ? 0 : Math.round(run + (run / elapsed) * (n - elapsed));
  const ideal = budget ? Array.from({ length: n }, (_, i) => Math.round((budget * (i + 1)) / n)) : null;
  const status: Pace['status'] = !budget || elapsed < 3 ? 'none' : projectedEnd > budget * 1.05 ? 'over' : projectedEnd < budget * 0.9 ? 'under' : 'on-track';
  return { days: n, elapsed, actual, ideal, projectedEnd, budget, status };
}

/* ------------------------------------------------ cash flow */

export interface FlowMonth {
  key: string;
  income: number;
  expense: number;
  net: number;
  /** Share of income kept, 0-100; null when nothing came in. */
  rate: number | null;
}

export function cashFlow(txs: Transaction[], months: string[]): FlowMonth[] {
  const m = new Map(months.map((k) => [k, { key: k, income: 0, expense: 0 }]));
  for (const t of txs) {
    const row = m.get(t.date.slice(0, 7));
    if (!row) continue;
    if (t.kind === 'income') row.income += t.amount;
    else if (t.kind === 'expense') row.expense += t.amount;
  }
  return months.map((k) => {
    const r = m.get(k)!;
    return { ...r, net: r.income - r.expense, rate: r.income > 0 ? Math.round(((r.income - r.expense) / r.income) * 100) : null };
  });
}

/* ------------------------------------------------ weekday profile */

export interface WeekdayBar {
  /** 0 = Monday ... 6 = Sunday. */
  index: number;
  label: string;
  avg: number;
  total: number;
  days: number;
}

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Average spending per weekday over [from, min(to, today)], counting days with no spending as zero. */
export function weekdayProfile(txs: Transaction[], from: string, to: string, today: string): { bars: WeekdayBar[]; top: WeekdayBar | null } {
  const end = to < today ? to : today;
  const bars: WeekdayBar[] = WD.map((label, index) => ({ index, label, avg: 0, total: 0, days: 0 }));
  for (let d = from; d <= end && daysBetween(from, d) < 800; d = addDays(d, 1)) bars[(fromDateStr(d).getDay() + 6) % 7].days++;
  for (const t of txs) {
    if (t.kind !== 'expense' || t.date < from || t.date > end) continue;
    bars[(fromDateStr(t.date).getDay() + 6) % 7].total += t.amount;
  }
  for (const b of bars) b.avg = b.days ? Math.round(b.total / b.days) : 0;
  const top = [...bars].sort((a, b) => b.avg - a.avg)[0];
  return { bars, top: top && top.avg > 0 ? top : null };
}

/* ------------------------------------------------ category trends */

export interface CategoryTrend {
  categoryId: string | null;
  name: string;
  icon: string;
  color: string;
  /** Monthly totals, oldest first, one per month passed in. */
  series: number[];
  current: number;
  previous: number;
  /** Percent change last month vs the one before; null when there was no spending before. */
  change: number | null;
  total: number;
}

export function categoryTrends(txs: Transaction[], categories: Category[], months: string[]): CategoryTrend[] {
  const idx = new Map(months.map((k, i) => [k, i]));
  const rows = new Map<string | null, number[]>();
  for (const t of txs) {
    if (t.kind !== 'expense') continue;
    const i = idx.get(t.date.slice(0, 7));
    if (i === undefined) continue;
    const s = rows.get(t.categoryId) ?? Array<number>(months.length).fill(0);
    s[i] += t.amount;
    rows.set(t.categoryId, s);
  }
  const out: CategoryTrend[] = [];
  for (const [categoryId, series] of rows) {
    const c = categories.find((x) => x.id === categoryId);
    const current = series[series.length - 1];
    const previous = series.length > 1 ? series[series.length - 2] : 0;
    out.push({ categoryId, name: c?.name ?? 'Uncategorised', icon: c?.icon ?? '❓', color: c?.color ?? '#64748B', series, current, previous, change: previous > 0 ? ((current - previous) / previous) * 100 : null, total: series.reduce((a, b) => a + b, 0) });
  }
  return out.sort((a, b) => b.total - a.total);
}

/* ------------------------------------------------ what-if */

/** Average monthly spending in a category over `months` (zero months count). */
export function avgMonthly(txs: Transaction[], categoryId: string | null, months: string[]): number {
  if (!months.length) return 0;
  const set = new Set(months);
  let total = 0;
  for (const t of txs) if (t.kind === 'expense' && t.categoryId === categoryId && set.has(t.date.slice(0, 7))) total += t.amount;
  return Math.round(total / months.length);
}

export interface WhatIf {
  perMonth: number;
  perYear: number;
  /** Months for the saving alone to cover `goalRemaining`; null when there is no goal or nothing saved. */
  monthsToGoal: number | null;
}

export function whatIf(args: { monthly: number; cutPct: number; goalRemaining?: number }): WhatIf {
  const pct = Math.min(Math.max(args.cutPct, 0), 100);
  const perMonth = Math.round((args.monthly * pct) / 100);
  const monthsToGoal = args.goalRemaining && args.goalRemaining > 0 && perMonth > 0 ? Math.ceil(args.goalRemaining / perMonth) : null;
  return { perMonth, perYear: perMonth * 12, monthsToGoal };
}

/* ------------------------------------------------ net worth */

export interface WorthSeries {
  dates: string[];
  values: number[];
}

/**
 * Daily total balance from `from` to `to`. Starts from opening balances plus everything before `from`.
 * With `accountId` it follows one account; otherwise all non-archived accounts, so a transfer between
 * them is neutral and a transfer to a hidden account counts as money leaving.
 */
export function netWorthSeries(accounts: Account[], txs: Transaction[], from: string, to: string, accountId?: string): WorthSeries {
  const included = new Set((accountId ? accounts.filter((a) => a.id === accountId) : accounts.filter((a) => !a.archived)).map((a) => a.id));
  let value = accounts.filter((a) => included.has(a.id)).reduce((s, a) => s + a.openingBalance, 0);

  const effect = (t: Transaction) => {
    if (t.kind === 'income') return included.has(t.accountId) ? t.amount : 0;
    if (t.kind === 'expense') return included.has(t.accountId) ? -t.amount : 0;
    return (included.has(t.accountId) ? -t.amount : 0) + (t.toAccountId && included.has(t.toAccountId) ? t.amount : 0);
  };

  const perDay = new Map<string, number>();
  for (const t of txs) {
    if (t.date > to) continue;
    const e = effect(t);
    if (t.date < from) value += e;
    else perDay.set(t.date, (perDay.get(t.date) ?? 0) + e);
  }
  const dates: string[] = [];
  const values: number[] = [];
  for (let d = from; d <= to && dates.length < 800; d = addDays(d, 1)) {
    value += perDay.get(d) ?? 0;
    dates.push(d);
    values.push(value);
  }
  return { dates, values };
}

/** Month keys ending at `end`, oldest first. */
export const lastMonths = (end: string, n: number) => Array.from({ length: n }, (_, i) => addMonths(end, i - n + 1));
