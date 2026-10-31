import assert from 'node:assert/strict';
import { test } from 'node:test';

import { avgMonthly, cashFlow, categoryTrends, heatmapMonth, lastMonths, netWorthSeries, paceSeries, weekdayProfile, whatIf } from './analytics.ts';
import { billFromDetected, commitments, dueItems, monthlyEquivalent, nextDue, occurrence, reservedForMonth, unmanaged } from './bills.ts';
import { defaultCategories } from './defaults.ts';
import { createParser } from './smartEntry.ts';
import type { Account, Bill, Transaction } from './types.ts';

let n = 0;
const id = () => `x${++n}`;
const tx = (date: string, amount = 1000, over: Partial<Transaction> = {}): Transaction => ({
  id: id(), kind: 'expense', amount, accountId: 'a', toAccountId: null, categoryId: 'food', note: '', date, createdAt: n, importHash: null, ...over,
});
const bill = (over: Partial<Bill> = {}): Bill => ({
  id: id(), name: 'Rent', amount: 120000, categoryId: 'home', accountId: 'a', cadence: 'monthly', startDate: '2026-01-31', paidThrough: '', autoPost: 0, archived: 0, createdAt: 1, ...over,
});

/* ------------------------------------------------------------------ bills */

test('occurrences keep their day without drifting', () => {
  const b = bill();
  assert.deepEqual([0, 1, 2, 3].map((k) => occurrence(b, k)), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.equal(occurrence(bill({ cadence: 'weekly', startDate: '2026-10-05' }), 3), '2026-10-26');
  assert.equal(occurrence(bill({ cadence: 'yearly', startDate: '2024-02-29' }), 1), '2025-02-28');
  assert.equal(occurrence(bill({ cadence: 'yearly', startDate: '2024-02-29' }), 4), '2028-02-29');
});

test('nextDue follows what has been settled', () => {
  assert.equal(nextDue(bill()), '2026-01-31'); // nothing paid yet: the start date itself
  assert.equal(nextDue(bill({ paidThrough: '2026-01-31' })), '2026-02-28');
  assert.equal(nextDue(bill({ paidThrough: '2026-02-28' })), '2026-03-31');
  assert.equal(nextDue(bill({ paidThrough: '2026-02-10' })), '2026-02-28'); // between dates: the next one after it
  assert.equal(nextDue(bill({ cadence: 'weekly', startDate: '2026-10-05', paidThrough: '2026-10-12' })), '2026-10-19');
});

test('dueItems lists overdue and upcoming occurrences, oldest first, skipping archived', () => {
  const today = '2026-10-10';
  const rent = bill({ startDate: '2026-08-05', paidThrough: '2026-08-05' }); // Sept and Oct 5 are unpaid
  const weekly = bill({ name: 'Gym', cadence: 'weekly', startDate: '2026-10-12', amount: 5000 });
  const gone = bill({ name: 'Old', archived: 1 });
  const items = dueItems([rent, weekly, gone], today, '2026-10-31');
  assert.deepEqual(items.map((i) => [i.bill.name, i.due, i.inDays]), [
    ['Rent', '2026-09-05', -35],
    ['Rent', '2026-10-05', -5],
    ['Gym', '2026-10-12', 2],
    ['Gym', '2026-10-19', 9],
    ['Gym', '2026-10-26', 16],
  ]);
});

test('reservedForMonth counts everything still owed through month end, overdue included', () => {
  const today = '2026-10-10';
  const rent = bill({ startDate: '2026-08-05', paidThrough: '2026-09-05', amount: 100000 }); // Oct 5 overdue
  const netflix = bill({ name: 'Netflix', startDate: '2026-10-20', amount: 5500 });
  const nextMonth = bill({ name: 'Insurance', startDate: '2026-11-02', amount: 90000 });
  assert.equal(reservedForMonth([rent, netflix, nextMonth], today), 105500);
  assert.equal(reservedForMonth([], today), 0);
  // Once paid it stops being reserved.
  assert.equal(reservedForMonth([{ ...rent, paidThrough: '2026-10-05' }, netflix], today), 5500);
});

test('monthly equivalent of each cadence', () => {
  assert.equal(monthlyEquivalent({ amount: 1200, cadence: 'monthly' }), 1200);
  assert.equal(monthlyEquivalent({ amount: 12000, cadence: 'yearly' }), 1000);
  assert.equal(monthlyEquivalent({ amount: 1000, cadence: 'weekly' }), 4333);
});

test('detected repeats already managed are not offered or double counted', () => {
  const today = '2026-10-10';
  const detected = [
    { key: 'netflix', name: 'Netflix', categoryId: 'subs', amount: 5500, lastDate: '2026-09-20', nextDate: '2026-10-20', count: 3, confidence: 'sure' as const },
    { key: 'unifi', name: 'Unifi', categoryId: 'bills', amount: 12900, lastDate: '2026-09-25', nextDate: '2026-10-25', count: 3, confidence: 'sure' as const },
  ];
  const managed = [bill({ name: 'netflix 4821', amount: 5500, startDate: '2026-10-20' })];
  assert.deepEqual(unmanaged(detected, managed).map((d) => d.name), ['Unifi']);
  // Netflix counted once (managed), Unifi from detection: 5,500 + 12,900.
  assert.equal(commitments({ bills: managed, detected, today }), 18400);
  assert.equal(commitments({ bills: [], detected, today }), 18400);
  // A detected repeat due next month is not reserved against this one.
  assert.equal(commitments({ bills: [], detected: [{ ...detected[1], nextDate: '2026-11-03' }], today }), 0);
});

test('a detected repeat becomes a monthly bill from its next date', () => {
  const d = { key: 'k', name: 'Netflix', categoryId: 'subs', amount: 5500, lastDate: '2026-09-20', nextDate: '2026-10-20', count: 3, confidence: 'sure' as const };
  const b = billFromDetected(d, 'acc', id, 7)!;
  assert.deepEqual([b.name, b.amount, b.cadence, b.startDate, b.paidThrough, b.autoPost], ['Netflix', 5500, 'monthly', '2026-10-20', '', 0]);
  assert.equal(billFromDetected({ ...d, categoryId: null }, 'acc', id, 7), null);
});

/* -------------------------------------------------------------- analytics */

test('heatmap: grid shape, levels, no-spend days and future days', () => {
  const today = '2026-10-10';
  const txs = [tx('2026-10-01', 1000), tx('2026-10-02', 2000), tx('2026-10-03', 9000), tx('2026-10-04', 500), tx('2026-10-04', 500, { kind: 'income' }), tx('2026-10-20', 7000)];
  const h = heatmapMonth(txs, '2026-10', today);
  assert.equal(h.weeks.every((w) => w.length === 7), true);
  assert.equal(h.weeks[0].filter((d) => d === null).length, 3); // 1 Oct 2026 is a Thursday: Mon-Wed are padding
  const day = (d: number) => h.weeks.flat().find((c) => c?.day === d)!;
  assert.equal(day(1).level >= 1, true);
  assert.equal(day(3).level, 4); // the big day
  assert.equal(day(5).noSpend, true);
  assert.equal(day(10).today, true);
  assert.equal(day(20).future, true);
  assert.equal(day(20).level, 0); // future spending never lights up
  assert.equal(day(4).income, 500);
  assert.equal(h.total, 1000 + 2000 + 9000 + 500); // income and the future day excluded
  assert.equal(h.heaviest?.day, 3);
  assert.equal(h.noSpendDays, 10 - 4); // days 1-10 minus the four with spending
  assert.equal(heatmapMonth([], '2026-02', '2026-10-10').weeks.flat().filter(Boolean).length, 28);
});

test('pace: cumulative actual, straight-line ideal, projection and status', () => {
  const today = '2026-10-10';
  const heavy = Array.from({ length: 10 }, (_, i) => tx(`2026-10-${String(i + 1).padStart(2, '0')}`, 10000));
  const p = paceSeries(heavy, 100000, '2026-10', today);
  assert.equal(p.elapsed, 10);
  assert.equal(p.actual.length, 10);
  assert.equal(p.actual[9], 100000);
  assert.equal(p.ideal!.length, 31);
  assert.equal(p.ideal![30], 100000);
  assert.equal(p.projectedEnd, 310000);
  assert.equal(p.status, 'over');
  const light = Array.from({ length: 10 }, (_, i) => tx(`2026-10-${String(i + 1).padStart(2, '0')}`, 1000));
  assert.equal(paceSeries(light, 100000, '2026-10', today).status, 'under');
  assert.equal(paceSeries(heavy, null, '2026-10', today).status, 'none');
  assert.equal(paceSeries(heavy, 100000, '2026-10', '2026-10-02').status, 'none'); // too early to call
  assert.equal(paceSeries(heavy, 100000, '2026-09', today).elapsed, 30); // a finished month is complete
  assert.equal(paceSeries([], 100000, '2026-11', today).elapsed, 0);
});

test('cash flow excludes transfers and reports the savings rate', () => {
  const rows = cashFlow(
    [tx('2026-09-02', 40000), tx('2026-09-03', 100000, { kind: 'income' }), tx('2026-09-04', 99999, { kind: 'transfer', toAccountId: 'b' }), tx('2026-10-02', 70000), tx('2026-10-03', 50000, { kind: 'income' })],
    ['2026-09', '2026-10', '2026-11'],
  );
  assert.deepEqual(rows.map((r) => [r.income, r.expense, r.net, r.rate]), [[100000, 40000, 60000, 60], [50000, 70000, -20000, -40], [0, 0, 0, null]]);
});

test('weekday profile averages over every weekday in range, zero days included', () => {
  // 1-14 Oct 2026: Thu 1 ... Wed 14. Two of each weekday.
  const txs = [tx('2026-10-03', 6000), tx('2026-10-10', 2000), tx('2026-10-05', 1000)]; // two Saturdays, one Monday
  const { bars, top } = weekdayProfile(txs, '2026-10-01', '2026-10-14', '2026-10-28');
  assert.equal(bars[5].label, 'Sat');
  assert.equal(bars[5].days, 2);
  assert.equal(bars[5].avg, 4000);
  assert.equal(bars[0].avg, 500); // one Monday of two had spending
  assert.equal(top?.label, 'Sat');
  // Capped at today.
  assert.equal(weekdayProfile(txs, '2026-10-01', '2026-10-31', '2026-10-07').bars.reduce((s, b) => s + b.days, 0), 7);
  assert.equal(weekdayProfile([], '2026-10-01', '2026-10-07', '2026-10-28').top, null);
});

test('category trends rank by total and compare the last two months', () => {
  const cats = defaultCategories(id);
  const food = cats.find((c) => c.name === 'Food & Drink')!.id;
  const fuel = cats.find((c) => c.name === 'Transport')!.id;
  const rows = categoryTrends(
    [tx('2026-08-05', 1000, { categoryId: food }), tx('2026-09-05', 2000, { categoryId: food }), tx('2026-10-05', 3000, { categoryId: food }), tx('2026-10-06', 9000, { categoryId: fuel }), tx('2026-10-07', 500, { categoryId: null }), tx('2026-10-08', 777, { kind: 'income', categoryId: food })],
    cats,
    ['2026-08', '2026-09', '2026-10'],
  );
  assert.deepEqual(rows.map((r) => r.name), ['Transport', 'Food & Drink', 'Uncategorised']);
  const f = rows.find((r) => r.name === 'Food & Drink')!;
  assert.deepEqual(f.series, [1000, 2000, 3000]);
  assert.equal(f.change, 50);
  assert.equal(rows.find((r) => r.name === 'Transport')!.change, null); // nothing the month before
});

test('what-if: savings scale with the cut and reach a goal sooner', () => {
  const w = whatIf({ monthly: 60000, cutPct: 20, goalRemaining: 360000 });
  assert.deepEqual(w, { perMonth: 12000, perYear: 144000, monthsToGoal: 30 });
  assert.equal(whatIf({ monthly: 60000, cutPct: 0 }).monthsToGoal, null);
  assert.equal(whatIf({ monthly: 60000, cutPct: 250 }).perMonth, 60000); // clamped to everything
  assert.equal(whatIf({ monthly: 60000, cutPct: 10, goalRemaining: 0 }).monthsToGoal, null);
  assert.equal(avgMonthly([tx('2026-08-01', 3000), tx('2026-10-01', 3000), tx('2026-07-01', 99999)], 'food', ['2026-08', '2026-09', '2026-10']), 2000);
  assert.equal(avgMonthly([], 'food', []), 0);
  assert.deepEqual(lastMonths('2026-10', 3), ['2026-08', '2026-09', '2026-10']);
});

test('net worth: opening balance, earlier history, neutral transfers, per-account view', () => {
  const acct = (aid: string, opening: number, archived = 0): Account => ({ id: aid, name: aid, type: 'bank', openingBalance: opening, color: '#fff', archived, sort: 0 });
  const accounts = [acct('a', 100000), acct('b', 50000), acct('old', 999999, 1)];
  const txs = [
    tx('2026-09-30', 10000, { accountId: 'a' }), // before the window: reduces a
    tx('2026-10-01', 30000, { kind: 'income', accountId: 'a' }),
    tx('2026-10-02', 20000, { kind: 'transfer', accountId: 'a', toAccountId: 'b' }), // neutral overall
    tx('2026-10-03', 5000, { accountId: 'b' }),
    tx('2026-10-04', 7000, { kind: 'transfer', accountId: 'a', toAccountId: 'old' }), // money leaves to a hidden account
  ];
  const all = netWorthSeries(accounts, txs, '2026-10-01', '2026-10-05');
  assert.deepEqual(all.dates.length, 5);
  assert.deepEqual(all.values, [170000, 170000, 165000, 158000, 158000]); // 150000 - 10000 + 30000 ...
  const a = netWorthSeries(accounts, txs, '2026-10-01', '2026-10-05', 'a');
  assert.deepEqual(a.values, [120000, 100000, 100000, 93000, 93000]);
  const b = netWorthSeries(accounts, txs, '2026-10-01', '2026-10-05', 'b');
  assert.deepEqual(b.values, [50000, 70000, 65000, 65000, 65000]);
});

/* ------------------------------------------------------------- split a bill */

test('"/3" turns a total into your share', () => {
  const cats = defaultCategories(id);
  const parse = createParser({ today: '2026-10-28', accounts: [], categories: cats, transactions: [], defaultAccountId: null });
  const a = parse('120 dinner /3');
  assert.equal(a.amount, 4000);
  assert.deepEqual(a.share, { n: 3, total: 12000 });
  assert.equal(a.note, 'Dinner');
  assert.equal(parse('100 dinner ÷3').amount, 3333); // rounds to the sen
  assert.equal(parse('90 lunch split 3').amount, 3000);
  assert.equal(parse('90 lunch split 3').note, 'Lunch');
  assert.equal(parse('120 dinner /1').share, null); // one person is not a split
  assert.equal(parse('120 dinner /99').share, null);
  assert.equal(parse('120 dinner').share, null);
  assert.equal(parse('dinner /3').amount, null); // no amount, nothing to split
  assert.equal(parse('0.01 sweets /3').amount, null); // a share under one sen is no amount
});

test('backup carries bills and rejects broken references', async () => {
  const { buildBackup, parseBackup, BackupError } = await import('./backup.ts');
  const acc: Account = { id: 'a1', name: 'Bank', type: 'bank', openingBalance: 0, color: '#112233', archived: 0, sort: 0 };
  const cat = { id: 'c1', name: 'Home', icon: '🏠', color: '#aabbcc', kind: 'expense' as const, archived: 0, sort: 0 };
  const b = bill({ id: 'b1', accountId: 'a1', categoryId: 'c1', startDate: '2026-10-05' });
  const snap = { accounts: [acc], categories: [cat], transactions: [], budgets: [], goals: [], bills: [b], settings: {} };
  const out = parseBackup(buildBackup(snap));
  assert.equal(out.bills.length, 1);
  assert.equal(out.bills[0].cadence, 'monthly');
  const mutate = (fn: (d: any) => void) => {
    const j = JSON.parse(buildBackup(snap));
    fn(j.data);
    return JSON.stringify(j);
  };
  assert.throws(() => parseBackup(mutate((d) => (d.bills[0].accountId = 'ghost'))), BackupError);
  assert.throws(() => parseBackup(mutate((d) => (d.bills[0].categoryId = 'ghost'))), BackupError);
  assert.throws(() => parseBackup(mutate((d) => (d.bills[0].cadence = 'daily'))), BackupError);
  assert.throws(() => parseBackup(mutate((d) => (d.bills[0].startDate = '2026-02-31'))), BackupError);
  assert.throws(() => parseBackup(mutate((d) => (d.bills[0].amount = 0))), BackupError);
  // Backups from before bills existed still restore.
  const old = JSON.parse(buildBackup(snap));
  delete old.data.bills;
  assert.deepEqual(parseBackup(JSON.stringify(old)).bills, []);
});
