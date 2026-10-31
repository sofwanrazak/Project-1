import type { Transaction } from './types.ts';

export interface FrequentSpend {
  note: string;
  amount: number;
  categoryId: string;
  accountId: string;
  count: number;
}

/**
 * The spends you repeat (same note, category and amount): candidates for one-tap logging.
 * Needs at least two occurrences so one-offs never show up as shortcuts.
 */
export function frequentSpends(txs: Transaction[], limit = 6): FrequentSpend[] {
  const groups = new Map<string, FrequentSpend & { last: string }>();
  for (const t of txs) {
    const note = t.note.trim();
    if (t.kind !== 'expense' || !note || !t.categoryId) continue;
    const key = `${note.toLowerCase()}|${t.categoryId}|${t.amount}`;
    const g = groups.get(key);
    if (g) {
      g.count++;
      if (t.date > g.last) {
        g.last = t.date;
        g.accountId = t.accountId;
      }
    } else groups.set(key, { note, amount: t.amount, categoryId: t.categoryId, accountId: t.accountId, count: 1, last: t.date });
  }
  return [...groups.values()]
    .filter((g) => g.count >= 2)
    .sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1))
    .slice(0, limit)
    .map(({ last: _last, ...rest }) => rest);
}
