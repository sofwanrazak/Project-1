import { daysInMonth, monthEnd, monthKey, monthStart } from './dates.ts';
import type { Budget, Transaction } from './types.ts';

export type AllowanceStatus = 'safe' | 'tight' | 'over' | 'none';

export interface Allowance {
  status: AllowanceStatus;
  /** What you could spend today, given the month so far and bills still to come. 0 when over. */
  allowance: number;
  spentToday: number;
  /** allowance - spentToday; negative when today is already over. */
  left: number;
  /** spentToday / allowance, 0 when there is no allowance. */
  ratio: number;
  monthLeft: number;
  /** Detected bills still due this month; subtracted so the daily number is honest. */
  reserved: number;
  daysLeft: number;
}

/**
 * The daily number: (budget - spent before today - bills still to come) / days left including today.
 * Past spending is fixed, so a bad day reduces tomorrow's number instead of silently breaking the month.
 */
export function dailyAllowance(args: { budgets: Budget[]; transactions: Transaction[]; today: string; reserved?: number }): Allowance {
  const { budgets, transactions, today } = args;
  const overall = budgets.find((b) => b.categoryId === null);
  const mk = monthKey(today);
  const daysLeft = daysInMonth(mk) - Number(today.slice(8)) + 1;
  let spentBefore = 0;
  let spentToday = 0;
  for (const t of transactions) {
    if (t.kind !== 'expense' || t.date < monthStart(mk) || t.date > monthEnd(mk) || t.date > today) continue;
    if (t.date === today) spentToday += t.amount;
    else spentBefore += t.amount;
  }
  const reserved = Math.max(args.reserved ?? 0, 0);
  if (!overall) {
    return { status: 'none', allowance: 0, spentToday, left: 0, ratio: 0, monthLeft: 0, reserved, daysLeft };
  }
  const monthLeft = overall.amount - spentBefore - spentToday - reserved;
  const poolAtDawn = overall.amount - spentBefore - reserved;
  const allowance = Math.max(Math.floor(poolAtDawn / daysLeft), 0);
  const left = allowance - spentToday;
  const ratio = allowance > 0 ? spentToday / allowance : spentToday > 0 ? 2 : 0;
  const status: AllowanceStatus = allowance === 0 || spentToday > allowance ? 'over' : ratio >= 0.6 ? 'tight' : 'safe';
  return { status, allowance, spentToday, left, ratio, monthLeft, reserved, daysLeft };
}

/**
 * The line shown right after a spend is logged: immediate, specific, never scolding.
 * "Over" states the fact and the fix instead of a warning.
 */
export function allowanceLine(a: Allowance, fmt: (minor: number) => string): string {
  switch (a.status) {
    case 'none':
      return 'Logged';
    case 'over':
      return a.allowance === 0 ? 'Logged. This month is past budget' : `Logged. ${fmt(-a.left)} over today, tomorrow adjusts`;
    case 'tight':
      return `Logged. ${fmt(a.left)} left today`;
    default:
      return `Logged. ${fmt(a.left)} left today`;
  }
}
