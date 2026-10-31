import { addDays, addMonthsClamped, daysBetween } from './dates.ts';
import type { Transaction } from './types.ts';

export interface RecurringBill {
  key: string;
  name: string;
  categoryId: string | null;
  amount: number; // typical amount, minor units
  lastDate: string;
  nextDate: string;
  count: number;
  /** "sure" needs three or more matching months; "likely" is two. */
  confidence: 'likely' | 'sure';
}

const norm = (note: string) => note.toLowerCase().replace(/[0-9#*]+/g, ' ').replace(/\s+/g, ' ').trim();

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/**
 * Finds bills that repeat roughly monthly at a steady price (Netflix, Unifi, rent).
 * Variable merchants (Grab, groceries) are rejected because their amounts do not hold within 15%.
 */
export function detectRecurring(txs: Transaction[], today: string): RecurringBill[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (t.kind !== 'expense' || t.date > today) continue;
    const key = norm(t.note);
    if (key.length < 3) continue;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const bills: RecurringBill[] = [];
  for (const [key, list] of groups) {
    // One charge per calendar month at most counts toward the pattern.
    const byMonth = new Map<string, Transaction>();
    for (const t of [...list].sort((a, b) => (a.date < b.date ? -1 : 1))) byMonth.set(t.date.slice(0, 7), t);
    const rows = [...byMonth.values()];
    if (rows.length < 2) continue;

    // Two matching months is thin evidence, so it must be an almost identical price (a subscription);
    // from three months a bill may vary a little, like an electricity or phone bill.
    const amt = median(rows.map((r) => r.amount));
    const tol = rows.length >= 3 ? 0.15 : 0.05;
    if (!rows.every((r) => Math.abs(r.amount - amt) <= amt * tol)) continue;

    const gaps = rows.slice(1).map((r, i) => daysBetween(rows[i].date, r.date));
    const monthly = gaps.filter((g) => g >= 26 && g <= 35).length;
    if (monthly / gaps.length < 0.75) continue;

    // Bills fall on about the same day each month; a pharmacy visit that happens to be 30 days apart does not.
    const dom = rows.map((r) => Number(r.date.slice(8)));
    if (!dom.slice(1).every((d, i) => Math.abs(d - dom[i]) <= 3 || (d >= 28 && dom[i] >= 28))) continue;

    const last = rows[rows.length - 1];
    if (daysBetween(last.date, today) > 45) continue; // stopped paying: no longer upcoming
    bills.push({
      key,
      name: last.note.trim(),
      categoryId: last.categoryId,
      amount: amt,
      lastDate: last.date,
      nextDate: addMonthsClamped(last.date, 1),
      count: rows.length,
      confidence: rows.length >= 3 ? 'sure' : 'likely',
    });
  }
  return bills.sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1));
}

/** Bills due from `today` (or up to 3 days overdue) through the next `days` days. */
export function upcomingBills(bills: RecurringBill[], today: string, days = 30) {
  const from = addDays(today, -3);
  const to = addDays(today, days);
  return bills.filter((b) => b.nextDate >= from && b.nextDate <= to);
}

/** Bills still to be paid later this calendar month; the daily allowance sets these aside. */
export function reservedForMonth(bills: RecurringBill[], today: string): number {
  const end = `${today.slice(0, 7)}-31`;
  return bills.filter((b) => b.nextDate > today && b.nextDate <= end).reduce((s, b) => s + b.amount, 0);
}
