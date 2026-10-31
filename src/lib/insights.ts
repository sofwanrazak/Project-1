import { addDays, daysBetween, daysInMonth, monthEnd, monthKey, monthStart, weekStart, weekdayName } from './dates.ts';
import type { RecurringBill } from './recurring.ts';
import type { Budget, Category, Transaction } from './types.ts';

export interface Insight {
  id: string;
  tone: 'good' | 'warn' | 'bad' | 'info';
  icon: string;
  title: string;
  body: string;
  action?: { label: string; route: string; params?: Record<string, string> };
  priority: number;
}

interface Args {
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  bills: RecurringBill[];
  today: string;
  /** Formats minor units for display, so hidden-amount mode and currency are respected. */
  fmt: (minor: number) => string;
}

const catName = (cats: Category[], id: string | null) => cats.find((c) => c.id === id)?.name ?? 'Uncategorised';
const sum = (ts: Transaction[]) => ts.reduce((s, t) => s + t.amount, 0);

/**
 * Plain-language observations from the user's own data. Rules, not guesses: every card states
 * a number the user can verify in Activity.
 */
export function buildInsights(a: Args): Insight[] {
  const { transactions, categories, budgets, bills, today, fmt } = a;
  const out: Insight[] = [];
  const real = transactions.filter((t) => !t.importHash?.startsWith('sample:'));

  if (transactions.length < 3) {
    return [{ id: 'starter', tone: 'info', icon: '🌱', title: 'Log a few spends to unlock insights', body: 'After three transactions Tally starts spotting patterns in your money.', priority: 1 }];
  }

  const mk = monthKey(today);
  const month = transactions.filter((t) => t.date >= monthStart(mk) && t.date <= monthEnd(mk) && t.date <= today);
  const expenses = month.filter((t) => t.kind === 'expense');
  const spent = sum(expenses);
  const elapsed = Number(today.slice(8));
  const total = daysInMonth(mk);
  const overall = budgets.find((b) => b.categoryId === null);

  // 1. Month-end projection against the overall budget.
  if (overall && elapsed >= 5 && spent > 0) {
    const projected = Math.round((spent / elapsed) * total);
    if (projected > overall.amount * 1.05) {
      out.push({ id: 'pace-over', tone: 'warn', icon: '🐢', title: `On pace to overspend by ${fmt(projected - overall.amount)}`, body: `You've used ${fmt(spent)} in ${elapsed} days. At this speed the month ends near ${fmt(projected)}.`, action: { label: 'See budgets', route: '/budgets' }, priority: 90 });
    } else if (projected < overall.amount * 0.9 && elapsed >= 7) {
      out.push({ id: 'pace-under', tone: 'good', icon: '🎯', title: `On track to finish ${fmt(overall.amount - projected)} under budget`, body: `Projected ${fmt(projected)} against a ${fmt(overall.amount)} budget. Keep it up.`, priority: 60 });
    }
  }

  // 2. Category budgets at or past their limit.
  for (const b of budgets) {
    if (b.categoryId === null) continue;
    const used = sum(expenses.filter((t) => t.categoryId === b.categoryId));
    const ratio = used / b.amount;
    const name = catName(categories, b.categoryId);
    if (ratio >= 1) out.push({ id: `over-${b.categoryId}`, tone: 'bad', icon: '🚨', title: `${name} is over budget`, body: `${fmt(used)} spent of ${fmt(b.amount)}, ${fmt(used - b.amount)} over.`, action: { label: 'Adjust', route: '/budget-edit', params: { category: b.categoryId } }, priority: 95 });
    else if (ratio >= 0.8) out.push({ id: `near-${b.categoryId}`, tone: 'warn', icon: '⚠️', title: `${name} is at ${Math.round(ratio * 100)}% of budget`, body: `${fmt(b.amount - used)} left for the rest of the month.`, priority: 80 });
  }

  // 3. This week against the usual week, per category.
  const wk = weekStart(today);
  const thisWeek = transactions.filter((t) => t.kind === 'expense' && t.date >= wk && t.date <= today);
  const past = transactions.filter((t) => t.kind === 'expense' && t.date >= addDays(wk, -28) && t.date < wk);
  if (past.length >= 6) {
    let best: { id: string | null; now: number; avg: number } | null = null;
    for (const id of new Set(thisWeek.map((t) => t.categoryId))) {
      const now = sum(thisWeek.filter((t) => t.categoryId === id));
      const avg = sum(past.filter((t) => t.categoryId === id)) / 4;
      if (avg > 0 && now >= avg * 1.5 && now - avg >= 2000 && (!best || now - avg > best.now - best.avg)) best = { id, now, avg };
    }
    if (best) {
      out.push({ id: `spike-${best.id}`, tone: 'warn', icon: '📈', title: `${catName(categories, best.id)} is up ${Math.round((best.now / best.avg - 1) * 100)}% this week`, body: `${fmt(best.now)} so far against a usual ${fmt(Math.round(best.avg))} a week.`, action: { label: 'Review', route: '/activity', params: best.id ? { category: best.id } : undefined }, priority: 70 });
    }
  }

  // 4. A place you keep going back to.
  const spots = new Map<string, { name: string; n: number; total: number }>();
  for (const t of expenses) {
    const k = t.note.trim().toLowerCase();
    if (!k) continue;
    const row = spots.get(k) ?? { name: t.note.trim(), n: 0, total: 0 };
    row.n++;
    row.total += t.amount;
    spots.set(k, row);
  }
  const top = [...spots.values()].filter((s) => s.n >= 3).sort((x, y) => y.total - x.total)[0];
  if (top) out.push({ id: 'spot', tone: 'info', icon: '📍', title: `${top.name}: ${top.n} times this month`, body: `That adds up to ${fmt(top.total)}.`, priority: 40 });

  // 5. Saving well.
  const income = sum(month.filter((t) => t.kind === 'income'));
  if (income > 0 && elapsed >= 10) {
    const rate = Math.round(((income - spent) / income) * 100);
    if (rate >= 20) out.push({ id: 'saving', tone: 'good', icon: '🌱', title: `You've kept ${rate}% of this month's income`, body: `${fmt(income - spent)} left after spending so far.`, priority: 55 });
  }

  // 6. Bills.
  const due = bills.filter((b) => b.nextDate >= today && daysBetween(today, b.nextDate) <= 3);
  for (const b of due.slice(0, 2)) {
    const d = daysBetween(today, b.nextDate);
    out.push({ id: `due-${b.key}`, tone: 'warn', icon: '🗓️', title: `${b.name} ${fmt(b.amount)} ${d === 0 ? 'is due today' : d === 1 ? 'is due tomorrow' : `is due ${weekdayName(b.nextDate)}`}`, body: 'Detected from your past payments.', priority: 85 });
  }
  if (bills.length >= 2) {
    const monthly = bills.reduce((s, b) => s + b.amount, 0);
    out.push({ id: 'bills', tone: 'info', icon: '🔁', title: `${bills.length} repeating payments, about ${fmt(monthly)} a month`, body: bills.slice(0, 3).map((b) => b.name).join(', ') + (bills.length > 3 ? ' and more' : ''), priority: 35 });
  }

  if (real.length >= 5 && out.length === 0) {
    out.push({ id: 'steady', tone: 'good', icon: '✅', title: 'Nothing unusual this week', body: 'Spending looks steady. Tally will flag it when something changes.', priority: 10 });
  }
  return out.sort((x, y) => y.priority - x.priority);
}
