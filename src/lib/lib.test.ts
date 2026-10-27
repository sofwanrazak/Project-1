import assert from 'node:assert/strict';
import { test } from 'node:test';

import { csvCell, detectDateFormat, guessColumns, parseAmount, parseCsv, parseDate, rowFingerprint, toCsv, unguardCell } from './csv.ts';
import { addDays, addMonths, dayLabel, daysInMonth, monthEnd, toDateStr } from './dates.ts';
import { defaultCategories, suggestCategory } from './defaults.ts';
import { formatMoney, parseMinor, pressKey } from './money.ts';
import { accountBalances, budgetUsage, expenseByCategory, groupByDay, pctChange, sortNewestFirst, totals } from './stats.ts';
import type { Account, Transaction } from './types.ts';

let n = 0;
const id = () => `id${++n}`;

const acct = (over: Partial<Account> = {}): Account => ({ id: id(), name: 'A', type: 'bank', openingBalance: 0, color: '#fff', archived: 0, sort: 0, ...over });
const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: id(), kind: 'expense', amount: 100, accountId: 'a', toAccountId: null, categoryId: null,
  note: '', date: '2025-03-10', createdAt: 0, importHash: null, ...over,
});

test('parseMinor', () => {
  assert.equal(parseMinor('12'), 1200);
  assert.equal(parseMinor('12.5'), 1250);
  assert.equal(parseMinor('1,234.50'), 123450);
  assert.equal(parseMinor('0.07'), 7);
  assert.equal(parseMinor('.5'), 50);
  assert.equal(parseMinor('12.345'), null);
  assert.equal(parseMinor(''), null);
  assert.equal(parseMinor('abc'), null);
  assert.equal(parseMinor('-5'), null);
  assert.equal(parseMinor('19.99'), 1999); // float trap: 19.99 * 100 = 1998.9999...
});

test('formatMoney', () => {
  assert.equal(formatMoney(123450, 'MYR'), 'RM1,234.50');
  assert.equal(formatMoney(-500, 'MYR'), '-RM5.00');
  assert.equal(formatMoney(100, 'MYR', { sign: true }), '+RM1.00');
  assert.equal(formatMoney(0, 'MYR'), 'RM0.00');
  assert.equal(formatMoney(1500000, 'MYR', { compact: true }), 'RM15k');
  assert.equal(formatMoney(1234500, 'MYR', { compact: true }), 'RM12.3k');
  assert.equal(formatMoney(5000, 'MYR', { compact: true }), 'RM50');
  assert.equal(formatMoney(463000, 'MYR', { compact: true, sign: true }), '+RM4.6k');
  assert.equal(formatMoney(100000, 'MYR', { compact: true }), 'RM1k');
  assert.equal(formatMoney(99999, 'MYR', { compact: true }), 'RM999.99');
  assert.equal(formatMoney(-250000, 'MYR', { compact: true }), '-RM2.5k');
  assert.ok(formatMoney(100, 'MYR', { sign: true }).startsWith('+'));
  assert.doesNotThrow(() => formatMoney(100, 'NOT_A_CODE'));
});

test('dates', () => {
  assert.equal(toDateStr(new Date(2025, 0, 5)), '2025-01-05');
  assert.equal(addDays('2025-02-28', 1), '2025-03-01');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addMonths('2025-01', -1), '2024-12');
  assert.equal(addMonths('2025-11', 3), '2026-02');
  assert.equal(monthEnd('2024-02'), '2024-02-29');
  assert.equal(daysInMonth('2025-04'), 30);
  assert.equal(dayLabel('2025-03-10', '2025-03-10'), 'Today');
  assert.equal(dayLabel('2025-03-09', '2025-03-10'), 'Yesterday');
  assert.equal(dayLabel('2025-03-07', '2025-03-10'), 'Fri, 7 Mar');
});

test('account balances handle income, expense and transfers', () => {
  const a = acct({ id: 'a', openingBalance: 10000 });
  const b = acct({ id: 'b', openingBalance: 0 });
  const bal = accountBalances([a, b], [
    tx({ accountId: 'a', kind: 'expense', amount: 2500 }),
    tx({ accountId: 'a', kind: 'income', amount: 500 }),
    tx({ accountId: 'a', kind: 'transfer', amount: 3000, toAccountId: 'b' }),
  ]);
  assert.equal(bal.get('a'), 10000 - 2500 + 500 - 3000);
  assert.equal(bal.get('b'), 3000);
});

test('transfers are excluded from income/expense totals', () => {
  const t = totals([tx({ kind: 'expense', amount: 300 }), tx({ kind: 'income', amount: 1000 }), tx({ kind: 'transfer', amount: 9999, toAccountId: 'b' })]);
  assert.deepEqual(t, { expense: 300, income: 1000, net: 700 });
});

test('expenseByCategory sorts by total desc', () => {
  const rows = expenseByCategory([
    tx({ categoryId: 'x', amount: 100 }), tx({ categoryId: 'y', amount: 500 }), tx({ categoryId: 'x', amount: 100 }), tx({ kind: 'income', categoryId: 'z', amount: 9000 }),
  ]);
  assert.deepEqual(rows.map((r) => [r.categoryId, r.total, r.count]), [['y', 500, 1], ['x', 200, 2]]);
});

test('budgetUsage: overall and per-category', () => {
  const usage = budgetUsage(
    [{ id: 'b1', categoryId: null, amount: 1000 }, { id: 'b2', categoryId: 'food', amount: 200 }],
    [tx({ categoryId: 'food', amount: 300 }), tx({ categoryId: 'other', amount: 200 })],
  );
  assert.equal(usage[0].spent, 500);
  assert.equal(usage[0].ratio, 0.5);
  assert.equal(usage[1].spent, 300);
  assert.equal(usage[1].ratio, 1.5);
});

test('sort + group by day', () => {
  const sorted = sortNewestFirst([
    tx({ id: 'old', date: '2025-03-01' }), tx({ id: 'new1', date: '2025-03-05', createdAt: 1 }), tx({ id: 'new2', date: '2025-03-05', createdAt: 2 }),
  ]);
  assert.deepEqual(sorted.map((t) => t.id), ['new2', 'new1', 'old']);
  const groups = groupByDay(sorted);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].net, -200);
});

test('pctChange', () => {
  assert.equal(pctChange(150, 100), 50);
  assert.equal(pctChange(50, 0), null);
});

test('parseCsv handles quotes, embedded commas/newlines, CRLF, BOM, semicolons', () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n'), [['a', 'b'], ['x, y', 'he said "hi"']]);
  assert.deepEqual(parseCsv('a;b\n1;2\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a,b\n"line1\nline2",2'), [['a', 'b'], ['line1\nline2', '2']]);
  assert.deepEqual(parseCsv('a,b\n\n,\n1,2'), [['a', 'b'], ['1', '2']]);
});

test('csvCell neutralises formula injection and round-trips', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(unguardCell("'=SUM(1)"), '=SUM(1)');
  assert.equal(unguardCell("'tis"), "'tis");
  const out = toCsv([['a', 'b,c'], [1, '=x']]);
  assert.deepEqual(parseCsv(out), [['a', 'b,c'], ['1', "'=x"]]);
});

test('parseDate', () => {
  assert.equal(parseDate('12/03/2025', 'DMY'), '2025-03-12');
  assert.equal(parseDate('12/03/2025', 'MDY'), '2025-12-03');
  assert.equal(parseDate('2025-03-12', 'DMY'), '2025-03-12');
  assert.equal(parseDate('12 Mar 2025', 'DMY'), '2025-03-12');
  assert.equal(parseDate('12-Mar-25', 'DMY'), '2025-03-12');
  assert.equal(parseDate('31/02/2025', 'DMY'), null);
  assert.equal(parseDate('garbage', 'DMY'), null);
});

test('detectDateFormat', () => {
  assert.equal(detectDateFormat(['25/03/2025', '01/04/2025']), 'DMY');
  assert.equal(detectDateFormat(['03/25/2025', '04/01/2025']), 'MDY');
  assert.equal(detectDateFormat(['2025-03-25']), 'YMD');
  assert.equal(detectDateFormat(['01/02/2025']), 'DMY');
});

test('parseAmount', () => {
  assert.equal(parseAmount('RM 1,234.50'), 123450);
  assert.equal(parseAmount('-12.30'), -1230);
  assert.equal(parseAmount('(12.00)'), -1200);
  assert.equal(parseAmount('12.00 DR'), -1200);
  assert.equal(parseAmount('12.00 CR'), 1200);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('n/a'), null);
});

test('guessColumns', () => {
  assert.deepEqual(guessColumns(['Date', 'Description', 'Amount']), { date: 0, description: 1, amount: 2, debit: -1, credit: -1 });
  assert.deepEqual(guessColumns(['Transaction Date', 'Details', 'Debit', 'Credit', 'Balance']), { date: 0, description: 1, amount: -1, debit: 2, credit: 3 });
});

test('rowFingerprint is stable and discriminating', () => {
  const a = rowFingerprint('acc', '2025-03-01', -500, 'GRAB  Ride');
  assert.equal(a, rowFingerprint('acc', '2025-03-01', -500, 'grab ride'));
  assert.notEqual(a, rowFingerprint('acc', '2025-03-01', -501, 'grab ride'));
  assert.notEqual(a, rowFingerprint('other', '2025-03-01', -500, 'grab ride'));
});

test('suggestCategory uses token boundaries', () => {
  const cats = defaultCategories(id);
  const name = (d: string, k: 'expense' | 'income' = 'expense') => cats.find((c) => c.id === suggestCategory(d, k, cats))?.name ?? null;
  assert.equal(name('GRABFOOD KL'), 'Food & Drink');
  assert.equal(name('GRAB*RIDE 1234'), 'Transport');
  assert.equal(name('PETRONAS STATION'), 'Transport');
  assert.equal(name('TNB BILL'), 'Bills & Utilities');
  assert.equal(name('Digital marketplace'), null); // "digi" must not match "digital"
  assert.equal(name('Assistance fund'), null); // "sst" must not match inside a word
  assert.equal(name('SALARY MARCH', 'income'), 'Salary');
  assert.equal(name('SALARY MARCH', 'expense'), null);
});

test('backup: round-trips and rejects hostile input', async () => {
  const { buildBackup, parseBackup, BackupError } = await import('./backup.ts');
  const a = acct({ id: 'a1', color: '#112233' });
  const b = acct({ id: 'a2', color: '#112233' });
  const cat = { id: 'c1', name: 'Food', icon: '🍜', color: '#aabbcc', kind: 'expense' as const, archived: 0, sort: 0 };
  const snap = {
    accounts: [a, b],
    categories: [cat],
    transactions: [
      tx({ id: 't1', accountId: 'a1', categoryId: 'c1' }),
      tx({ id: 't2', kind: 'transfer', accountId: 'a1', toAccountId: 'a2' }),
    ],
    budgets: [{ id: 'b1', categoryId: 'c1', amount: 5000 }],
    settings: { name: 'Sofwan', currency: 'MYR' as const, lockEnabled: true },
  };
  const out = parseBackup(buildBackup(snap));
  assert.equal(out.transactions.length, 2);
  assert.equal(out.settings.name, 'Sofwan');
  assert.equal('lockEnabled' in out.settings, false); // security settings never restored from a file

  const mutate = (fn: (d: any) => void) => {
    const j = JSON.parse(buildBackup(snap));
    fn(j.data);
    return JSON.stringify(j);
  };
  assert.throws(() => parseBackup('nope'), BackupError);
  assert.throws(() => parseBackup('{"app":"other"}'), BackupError);
  assert.throws(() => parseBackup(mutate((d) => (d.transactions[0].amount = -5))), BackupError);
  assert.throws(() => parseBackup(mutate((d) => (d.transactions[0].amount = 1.5))), BackupError);
  assert.throws(() => parseBackup(mutate((d) => (d.transactions[0].date = '2025-02-31'))), BackupError);
  assert.throws(() => parseBackup(mutate((d) => (d.transactions[0].accountId = 'ghost'))), BackupError);
  assert.throws(() => parseBackup(mutate((d) => (d.transactions[1].toAccountId = 'a1'))), BackupError);
  assert.throws(() => parseBackup(mutate((d) => (d.accounts[0].color = 'url(javascript:1)'))), BackupError);
  assert.throws(() => parseBackup(mutate((d) => d.accounts.push({ ...d.accounts[0] }))), BackupError); // duplicate id
  assert.throws(() => parseBackup(mutate((d) => (d.categories = 'x'))), BackupError);
});

test('pressKey keypad rules', () => {
  const type = (keys: string) => [...keys].reduce(pressKey, '');
  assert.equal(type('123'), '123');
  assert.equal(type('.5'), '0.5');
  assert.equal(type('007'), '7');
  assert.equal(type('0.00'), '0.00');
  assert.equal(type('12.345'), '12.34'); // third decimal ignored
  assert.equal(type('1..2'), '1.2'); // second dot ignored
  assert.equal(type('1234567890'), '123456789'); // 9 integer digits max
  assert.equal(pressKey('12.5', '⌫'), '12.');
  assert.equal(pressKey('', '⌫'), '');
  assert.equal(parseMinor(type('19.99')), 1999);
});

test('periods', async () => {
  const { periodFor, elapsedDays } = await import('./periods.ts');
  const m = periodFor('month', '2025-03');
  assert.deepEqual([m.from, m.to, m.prev.from, m.prev.to], ['2025-03-01', '2025-03-31', '2025-02-01', '2025-02-28']);
  const q = periodFor('3m', '2025-03');
  assert.deepEqual(q.months, ['2025-01', '2025-02', '2025-03']);
  assert.deepEqual([q.prev.from, q.prev.to], ['2024-10-01', '2024-12-31']);
  const y = periodFor('12m', '2025-03');
  assert.equal(y.from, '2024-04-01');
  assert.equal(elapsedDays(m, '2025-03-10'), 10);
  assert.equal(elapsedDays(m, '2025-04-10'), 31);
  assert.equal(elapsedDays(m, '2025-02-10'), 0);
  assert.equal(elapsedDays(q, '2025-02-05'), 31 + 5);
});

test('planImport: sign handling, dedupe, repeats within a file', async () => {
  const { planImport } = await import('./importer.ts');
  const cats = defaultCategories(id);
  const base = { accountId: 'acc', categories: cats, newId: id, now: 1000 };
  const m = { date: 0, description: 1, amount: 2, debit: -1, credit: -1, format: 'DMY' as const, invert: false };
  const rows = [
    ['01/03/2025', 'GRABFOOD KL', '-25.50'],
    ['01/03/2025', 'GRABFOOD KL', '-25.50'], // identical line, same file: both are real
    ['02/03/2025', 'SALARY MARCH', '4,000.00'],
    ['bad', 'x', '1'],
    ['03/03/2025', 'zero', '0'],
  ];
  const first = planImport({ ...base, rows, mapping: m, existingHashes: new Set() });
  assert.equal(first.items.length, 3);
  assert.equal(first.invalid, 2);
  assert.equal(first.items[0].kind, 'expense');
  assert.equal(first.items[0].amount, 2550);
  assert.equal(cats.find((c) => c.id === first.items[0].categoryId)?.name, 'Food & Drink');
  assert.equal(first.items[2].kind, 'income');

  // Re-importing the same file adds nothing.
  const again = planImport({ ...base, rows, mapping: m, existingHashes: new Set(first.items.map((t) => t.importHash!)) });
  assert.equal(again.items.length, 0);
  assert.equal(again.duplicates, 3);

  // Overlapping statement: only the genuinely new line is added.
  const overlap = planImport({ ...base, rows: [...rows, ['04/03/2025', 'TNB', '-80']], mapping: m, existingHashes: new Set(first.items.map((t) => t.importHash!)) });
  assert.equal(overlap.items.length, 1);

  // Debit/credit columns + inverted sign (credit card).
  const dc = planImport({ ...base, rows: [['05/03/2025', 'Shop', '10.00', '']], mapping: { ...m, amount: -1, debit: 2, credit: 3 }, existingHashes: new Set() });
  assert.equal(dc.items[0].kind, 'expense');
  const inv = planImport({ ...base, rows: [['05/03/2025', 'Shop', '10.00']], mapping: { ...m, invert: true }, existingHashes: new Set() });
  assert.equal(inv.items[0].kind, 'expense');
});
