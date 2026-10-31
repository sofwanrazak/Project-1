import { addDays } from './dates.ts';
import type { Category, Transaction } from './types.ts';

export const SAMPLE_PREFIX = 'sample:';
export const isSample = (t: Pick<Transaction, 'importHash'>) => !!t.importHash?.startsWith(SAMPLE_PREFIX);

/** [category, note, amount sen, weight] */
const MENU: [string, string, number, number][] = [
  ['Food & Drink', 'Nasi lemak', 850, 6],
  ['Food & Drink', 'Teh tarik & roti', 640, 4],
  ['Food & Drink', 'Starbucks', 1650, 2],
  ['Food & Drink', 'GrabFood', 2400, 3],
  ['Groceries', 'Jaya Grocer', 8800, 1],
  ['Groceries', 'Mydin', 4620, 1],
  ['Transport', 'Grab', 1800, 3],
  ['Transport', 'Petronas', 5000, 1],
  ['Transport', 'Touch n Go', 2000, 1],
  ['Shopping', 'Shopee', 5990, 1],
  ['Entertainment', 'GSC cinema', 3400, 1],
  ['Health', 'Guardian', 3200, 1],
];

const BILLS: [string, string, number, number][] = [
  ['Subscriptions', 'Netflix', 5500, 3],
  ['Bills & Utilities', 'Unifi', 12900, 8],
];

/** Small deterministic generator so the demo looks the same every time and tests can pin it. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * About six weeks of believable Malaysian spending, tagged `sample:` so streaks and checklists ignore it
 * and one tap can remove it. Everything lands on `accountId` (the user's first account).
 */
export function buildSampleData(args: { categories: Category[]; accountId: string; today: string; newId: () => string; income: number }): Transaction[] {
  const { categories, accountId, today, newId } = args;
  const cat = (name: string, kind: 'expense' | 'income' = 'expense') => categories.find((c) => c.name === name && c.kind === kind)?.id ?? null;
  const rand = rng(20251);
  const out: Transaction[] = [];
  let n = 0;
  const push = (kind: 'expense' | 'income', categoryId: string | null, note: string, amount: number, date: string) => {
    if (!categoryId) return;
    out.push({ id: newId(), kind, amount, accountId, toAccountId: null, categoryId, note, date, createdAt: 1_700_000_000_000 + n, importHash: `${SAMPLE_PREFIX}${n++}` });
  };

  const pool = MENU.flatMap((m) => Array(m[3]).fill(m) as typeof MENU);
  for (let off = 44; off >= 0; off--) {
    const date = addDays(today, -off);
    if (rand() < 0.14) continue; // a no-spend day
    const picks = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < picks; i++) {
      const [c, note, amount] = pool[Math.floor(rand() * pool.length)];
      // +/- 12% so amounts do not repeat to the sen
      push('expense', cat(c), note, Math.max(100, Math.round((amount * (0.88 + rand() * 0.24)) / 10) * 10), date);
    }
  }
  for (const [c, note, amount, dom] of BILLS) {
    for (let m = 0; m < 2; m++) {
      const d = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - m, dom);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (date <= today) push('expense', cat(c), note, amount, date);
    }
  }
  if (args.income > 0) {
    const d = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, 1);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    if (date <= today) push('income', cat('Salary', 'income'), 'Salary', args.income, date);
  }
  return out;
}
