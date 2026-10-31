import type { Account, Budget, Transaction } from './types.ts';

export function accountBalances(accounts: Account[], txs: Transaction[]): Map<string, number> {
  const bal = new Map<string, number>();
  for (const a of accounts) bal.set(a.id, a.openingBalance);
  for (const t of txs) {
    const from = bal.get(t.accountId);
    if (t.kind === 'income' && from !== undefined) bal.set(t.accountId, from + t.amount);
    else if (t.kind === 'expense' && from !== undefined) bal.set(t.accountId, from - t.amount);
    else if (t.kind === 'transfer') {
      if (from !== undefined) bal.set(t.accountId, from - t.amount);
      const to = t.toAccountId ? bal.get(t.toAccountId) : undefined;
      if (t.toAccountId && to !== undefined) bal.set(t.toAccountId, to + t.amount);
    }
  }
  return bal;
}

/** Inclusive range on YYYY-MM-DD strings (lexicographic order == chronological). */
export function inRange(txs: Transaction[], from: string, to: string) {
  return txs.filter((t) => t.date >= from && t.date <= to);
}

export function totals(txs: Transaction[]) {
  let expense = 0;
  let income = 0;
  for (const t of txs) {
    if (t.kind === 'expense') expense += t.amount;
    else if (t.kind === 'income') income += t.amount;
  }
  return { expense, income, net: income - expense };
}

export interface CategoryTotal {
  categoryId: string | null;
  total: number;
  count: number;
}

export function expenseByCategory(txs: Transaction[]): CategoryTotal[] {
  const m = new Map<string | null, CategoryTotal>();
  for (const t of txs) {
    if (t.kind !== 'expense') continue;
    const row = m.get(t.categoryId) ?? { categoryId: t.categoryId, total: 0, count: 0 };
    row.total += t.amount;
    row.count += 1;
    m.set(t.categoryId, row);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

/** Expense per day for every day in [from, to], zero-filled. */
export function dailyExpense(txs: Transaction[], from: string, to: string, dayStep: (s: string) => string) {
  const sums = new Map<string, number>();
  for (const t of txs) if (t.kind === 'expense') sums.set(t.date, (sums.get(t.date) ?? 0) + t.amount);
  const out: { date: string; value: number }[] = [];
  for (let d = from; d <= to; d = dayStep(d)) out.push({ date: d, value: sums.get(d) ?? 0 });
  return out;
}

export function monthlyTotals(txs: Transaction[], keys: string[]) {
  const m = new Map(keys.map((k) => [k, { key: k, expense: 0, income: 0 }]));
  for (const t of txs) {
    const row = m.get(t.date.slice(0, 7));
    if (!row) continue;
    if (t.kind === 'expense') row.expense += t.amount;
    else if (t.kind === 'income') row.income += t.amount;
  }
  return keys.map((k) => m.get(k)!);
}

export function topMerchants(txs: Transaction[], limit = 5) {
  const m = new Map<string, { name: string; total: number; count: number }>();
  for (const t of txs) {
    const name = t.note.trim();
    if (t.kind !== 'expense' || !name) continue;
    const key = name.toLowerCase();
    const row = m.get(key) ?? { name, total: 0, count: 0 };
    row.total += t.amount;
    row.count += 1;
    m.set(key, row);
  }
  return [...m.values()].sort((a, b) => b.total - a.total).slice(0, limit);
}

export interface BudgetUsage {
  budget: Budget;
  spent: number;
  ratio: number; // 0..n, can exceed 1
}

/** `monthTxs` must already be filtered to the month in question. */
export function budgetUsage(budgets: Budget[], monthTxs: Transaction[]): BudgetUsage[] {
  const overall = totals(monthTxs).expense;
  const perCat = new Map<string | null, number>();
  for (const t of monthTxs) if (t.kind === 'expense') perCat.set(t.categoryId, (perCat.get(t.categoryId) ?? 0) + t.amount);
  return budgets.map((budget) => {
    const spent = budget.categoryId === null ? overall : (perCat.get(budget.categoryId) ?? 0);
    return { budget, spent, ratio: budget.amount > 0 ? spent / budget.amount : 0 };
  });
}

export interface DayGroup {
  date: string;
  items: Transaction[];
  /** Net of the day: income - expense (transfers ignored). */
  net: number;
}

/** Expects `txs` already sorted newest first. */
export function groupByDay(txs: Transaction[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const t of txs) {
    let g = groups[groups.length - 1];
    if (!g || g.date !== t.date) {
      g = { date: t.date, items: [], net: 0 };
      groups.push(g);
    }
    g.items.push(t);
    if (t.kind === 'income') g.net += t.amount;
    else if (t.kind === 'expense') g.net -= t.amount;
  }
  return groups;
}

export function sortNewestFirst(txs: Transaction[]) {
  return [...txs].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
}

/** Percent change from prev to cur; null when prev is 0 (undefined growth). */
export function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}
