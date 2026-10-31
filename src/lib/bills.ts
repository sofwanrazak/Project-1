import { addDays, addMonthsClamped, daysBetween, monthEnd } from './dates.ts';
import type { RecurringBill } from './recurring.ts';
import type { Bill, Cadence } from './types.ts';

const CAP = 400; // guards every loop; a weekly bill reaches this in about 8 years of being unpaid

/** The k-th due date (k = 0 is startDate). Day-of-month never drifts: 31 Jan, 28 Feb, 31 Mar. */
export function occurrence(b: Pick<Bill, 'cadence' | 'startDate'>, k: number): string {
  switch (b.cadence) {
    case 'weekly':
      return addDays(b.startDate, 7 * k);
    case 'monthly':
      return addMonthsClamped(b.startDate, k);
    case 'yearly':
      return addMonthsClamped(b.startDate, 12 * k);
  }
}

/** Index of the first occurrence still owed: after paidThrough, or 0 when nothing has been settled. */
function firstOwed(b: Pick<Bill, 'cadence' | 'startDate' | 'paidThrough'>): number {
  if (!b.paidThrough) return 0;
  let k = 0;
  while (k < CAP && occurrence(b, k) <= b.paidThrough) k++;
  return k;
}

export function nextDue(b: Pick<Bill, 'cadence' | 'startDate' | 'paidThrough'>): string {
  return occurrence(b, firstOwed(b));
}

export interface DueItem {
  bill: Bill;
  due: string;
  /** Days from today: negative = overdue. */
  inDays: number;
}

/** Unpaid occurrences from the next one through `until`, oldest first. Archived bills are skipped. */
export function dueItems(bills: Bill[], today: string, until: string): DueItem[] {
  const out: DueItem[] = [];
  for (const bill of bills) {
    if (bill.archived) continue;
    for (let k = firstOwed(bill), n = 0; n < 24; k++, n++) {
      const due = occurrence(bill, k);
      if (due > until) break;
      out.push({ bill, due, inDays: daysBetween(today, due) });
    }
  }
  return out.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.bill.name.localeCompare(b.bill.name)));
}

/** Everything still owed this month: overdue items plus those due through month end. */
export function reservedForMonth(bills: Bill[], today: string): number {
  return dueItems(bills, today, monthEnd(today.slice(0, 7))).reduce((s, d) => s + d.bill.amount, 0);
}

/** What a bill costs per month on average, for "about RM X a month" summaries. */
export function monthlyEquivalent(b: Pick<Bill, 'amount' | 'cadence'>): number {
  const factor: Record<Cadence, number> = { weekly: 52 / 12, monthly: 1, yearly: 1 / 12 };
  return Math.round(b.amount * factor[b.cadence]);
}

const norm = (s: string) => s.toLowerCase().replace(/[0-9#*]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Detected repeats the user has not already turned into a bill. */
export function unmanaged(detected: RecurringBill[], bills: Bill[]): RecurringBill[] {
  const known = bills.filter((b) => !b.archived).map((b) => norm(b.name));
  return detected.filter((d) => {
    const n = norm(d.name);
    return !known.some((k) => k === n || k.startsWith(n) || n.startsWith(k));
  });
}

/** Turn a detected repeat into a bill that continues from its next expected date. */
export function billFromDetected(d: RecurringBill, accountId: string, newId: () => string, now: number): Bill | null {
  if (!d.categoryId) return null;
  return { id: newId(), name: d.name, amount: d.amount, categoryId: d.categoryId, accountId, cadence: 'monthly', startDate: d.nextDate, paidThrough: '', autoPost: 0, archived: 0, createdAt: now };
}

/** Overdue and upcoming amounts for the Home card and allowance, with detected repeats not already managed. */
export function commitments(args: { bills: Bill[]; detected: RecurringBill[]; today: string }): number {
  const managed = reservedForMonth(args.bills, args.today);
  const end = monthEnd(args.today.slice(0, 7));
  const guessed = unmanaged(args.detected, args.bills)
    .filter((d) => d.nextDate > args.today && d.nextDate <= end)
    .reduce((s, d) => s + d.amount, 0);
  return managed + guessed;
}
