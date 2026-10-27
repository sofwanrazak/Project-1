import { parseAmount, parseDate, rowFingerprint, unguardCell, type DateFormat } from './csv.ts';
import { suggestCategory } from './defaults.ts';
import type { Category, Transaction } from './types.ts';

export interface Mapping {
  date: number;
  description: number;
  /** Single signed amount column, or -1 when using debit/credit. */
  amount: number;
  debit: number;
  credit: number;
  format: DateFormat;
  /** Flip sign: credit-card statements list purchases as positive numbers. */
  invert: boolean;
}

export interface ImportPlan {
  items: Transaction[];
  duplicates: number;
  invalid: number;
}

const cell = (row: string[], i: number) => (i >= 0 && i < row.length ? row[i] : '');

/** Signed minor units for a row (negative = money out), or null if unreadable. */
export function rowAmount(row: string[], m: Mapping): number | null {
  let v: number | null;
  if (m.amount >= 0) v = parseAmount(cell(row, m.amount));
  else {
    const debit = parseAmount(cell(row, m.debit));
    const credit = parseAmount(cell(row, m.credit));
    if (debit === null && credit === null) return null;
    v = Math.abs(credit ?? 0) - Math.abs(debit ?? 0);
  }
  if (v === null || v === 0) return null;
  return m.invert ? -v : v;
}

export function planImport(args: {
  rows: string[][];
  mapping: Mapping;
  accountId: string;
  categories: Category[];
  existingHashes: Set<string>;
  newId: () => string;
  now: number;
}): ImportPlan {
  const { rows, mapping: m, accountId, categories, existingHashes, newId, now } = args;
  const items: Transaction[] = [];
  const seen = new Map<string, number>();
  let duplicates = 0;
  let invalid = 0;

  const fallback = (kind: 'expense' | 'income') => {
    const usable = categories.filter((c) => c.kind === kind && !c.archived);
    return (usable.find((c) => c.name === (kind === 'expense' ? 'Other' : 'Other income')) ?? usable[0])?.id ?? null;
  };

  for (const row of rows) {
    const date = parseDate(cell(row, m.date), m.format);
    const signed = rowAmount(row, m);
    if (!date || signed === null || Math.abs(signed) > Number.MAX_SAFE_INTEGER / 100) {
      invalid++;
      continue;
    }
    const kind = signed < 0 ? 'expense' : 'income';
    const description = unguardCell(cell(row, m.description).trim()).replace(/\s+/g, ' ').slice(0, 200);
    // Two identical lines in one file (two coffees, same price) are distinct; only a re-import is a duplicate.
    const base = rowFingerprint(accountId, date, signed, description);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const hash = `${base}-${n}`;
    if (existingHashes.has(hash)) {
      duplicates++;
      continue;
    }
    const categoryId = suggestCategory(description, kind, categories) ?? fallback(kind);
    if (!categoryId) {
      invalid++;
      continue;
    }
    items.push({ id: newId(), kind, amount: Math.abs(signed), accountId, toAccountId: null, categoryId, note: description, date, createdAt: now + items.length, importHash: hash });
  }
  return { items, duplicates, invalid };
}
