import assert from 'node:assert/strict';
import { test } from 'node:test';

import { defaultCategories } from './defaults.ts';
import { createParser } from './smartEntry.ts';
import type { Account, Transaction } from './types.ts';

let n = 0;
const id = () => `s${++n}`;
const cats = defaultCategories(id);
const cat = (name: string, kind: 'expense' | 'income' = 'expense') => cats.find((c) => c.name === name && c.kind === kind)!.id;
const acct = (name: string, i: number): Account => ({ id: `acc-${name.toLowerCase().split(' ')[0]}`, name, type: 'bank', openingBalance: 0, color: '#fff', archived: 0, sort: i });
const accounts = [acct('Maybank', 0), acct('TNG eWallet', 1), acct('Cash', 2)];
const tx = (note: string, categoryId: string, kind: 'expense' | 'income' = 'expense'): Transaction => ({
  id: id(), kind, amount: 1000, accountId: 'acc-maybank', toAccountId: null, categoryId, note, date: '2026-10-01', createdAt: n, importHash: null,
});

const TODAY = '2026-10-28'; // a Wednesday
const mk = (transactions: Transaction[] = []) => createParser({ today: TODAY, accounts, categories: cats, transactions, defaultAccountId: 'acc-maybank' });

test('amount, note and rule-based category from a plain line', () => {
  const p = mk()('18 grab');
  assert.equal(p.amount, 1800);
  assert.equal(p.note, 'Grab');
  assert.equal(p.categoryId, cat('Transport'));
  assert.equal(p.categorySource, 'rule');
  assert.equal(p.kind, 'expense');
  assert.equal(p.date, TODAY);
  assert.equal(p.accountId, 'acc-maybank');
  assert.equal(p.accountExplicit, false);
});

test('amount may come first, last, or carry rm / commas / k', () => {
  const parse = mk();
  assert.equal(parse('grab 18').amount, 1800);
  assert.equal(parse('rm12.50 nasi lemak').amount, 1250);
  assert.equal(parse('rm 12.5 nasi lemak').amount, 1250);
  assert.equal(parse('nasi lemak 12.5 ringgit').amount, 1250);
  assert.equal(parse('rent 1,200').amount, 120000);
  assert.equal(parse('laptop 1.5k').amount, 150000);
  assert.equal(parse('mcd 2 burgers 18').amount, 1800); // last plain number, the 2 stays in the note
  assert.equal(parse('mcd 2 burgers 18').note, 'Mcd 2 burgers');
  assert.equal(parse('7 eleven 12.50').amount, 1250); // the decimal token is the money
  assert.equal(parse('7 eleven 12.50').note, '7 eleven');
});

test('sums are added exactly', () => {
  assert.equal(mk()('8.50+3 lunch').amount, 1150);
  assert.equal(mk()('0.1+0.2 sweets').amount, 30);
});

test('unreadable or missing amounts stay null instead of guessing', () => {
  const parse = mk();
  assert.equal(parse('').amount, null);
  assert.equal(parse('nasi lemak').amount, null);
  assert.equal(parse('1.234 nasi').amount, null); // three decimals is not money
  assert.equal(parse('0 nothing').amount, null);
  assert.equal(parse('99999999999999 big').amount, null);
});

test('income by + marker or income word', () => {
  const parse = mk();
  const a = parse('+4500 salary');
  assert.equal(a.amount, 450000);
  assert.equal(a.kind, 'income');
  assert.equal(a.categoryId, cat('Salary', 'income'));
  const b = parse('gaji 3200');
  assert.equal(b.kind, 'income');
  assert.equal(b.categoryId, cat('Salary', 'income'));
  assert.equal(parse('refund 30 shopee').kind, 'income');
  assert.equal(parse('refund 30').categoryId, cat('Refund', 'income'));
  assert.equal(parse('+50').kind, 'income');
  assert.equal(parse('50 ang pow').kind, 'income');
  assert.equal(parse('50 ang pow').categoryId, cat('Gift received', 'income'));
  assert.equal(parse('50 duit raya').kind, 'income');
});

test('dates: words, relative, weekdays and d/m', () => {
  const parse = mk();
  assert.equal(parse('15 lunch yesterday').date, '2026-10-27');
  assert.equal(parse('15 lunch yesterday').dateExplicit, true);
  assert.equal(parse('15 lunch semalam').date, '2026-10-27');
  assert.equal(parse('15 lunch kelmarin').date, '2026-10-26');
  assert.equal(parse('15 lunch 3 days ago').date, '2026-10-25');
  assert.equal(parse('15 lunch 3d ago').date, '2026-10-25');
  assert.equal(parse('15 lunch 3 days ago').amount, 1500); // "3" was a date, not the amount
  assert.equal(parse('15 lunch monday').date, '2026-10-26');
  assert.equal(parse('15 lunch last wed').date, '2026-10-21'); // never today
  assert.equal(parse('15 lunch on fri').date, '2026-10-23');
  assert.equal(parse('15 lunch 25/10').date, '2026-10-25');
  assert.equal(parse('15 lunch 31/12').date, '2025-12-31'); // a future d/m means last year
  assert.equal(parse('15 lunch 31/02').date, TODAY); // not a real date: ignored
  assert.equal(parse('15 lunch').dateExplicit, false);
  assert.equal(parse('15 lunch yesterday').note, 'Lunch'); // date words leave the note
});

test('accounts by @prefix or a distinctive word', () => {
  const parse = mk();
  const a = parse('12 grab @tng');
  assert.equal(a.accountId, 'acc-tng');
  assert.equal(a.accountExplicit, true);
  assert.equal(a.note, 'Grab');
  assert.equal(parse('12 grab tng').accountId, 'acc-tng');
  assert.equal(parse('12 grab @may').accountId, 'acc-maybank');
  assert.equal(parse('12 grab @nope').accountExplicit, false);
  assert.equal(parse('12 grab').accountId, 'acc-maybank'); // default
});

test('history beats rules and learns your own labels', () => {
  const parse = mk([tx('Kedai ah meng', cat('Groceries')), tx('Kedai ah meng', cat('Groceries')), tx('Kedai ah meng', cat('Shopping'))]);
  const p = parse('20 kedai ah meng');
  assert.equal(p.categoryId, cat('Groceries')); // most frequent
  assert.equal(p.categorySource, 'history');
  // A rule would say Transport; your history says Groceries.
  const g = mk([tx('Grab', cat('Groceries'))])('9 grab');
  assert.equal(g.categoryId, cat('Groceries'));
  assert.equal(g.categorySource, 'history');
});

test('history matches a known note inside a longer one', () => {
  const parse = mk([tx('Grab', cat('Transport')), tx('Nasi lemak', cat('Food & Drink'))]);
  assert.equal(parse('18 grab to klcc').categoryId, cat('Transport'));
  assert.equal(parse('18 grab to klcc').note, 'Grab to klcc');
  // Typing a prefix of a known note suggests it while you type.
  assert.equal(parse('6 nasi').categoryId, cat('Food & Drink'));
});

test('history respects kind and archived categories', () => {
  const salary = cat('Salary', 'income');
  const parse = mk([tx('Acme', salary, 'income')]);
  assert.equal(parse('+100 acme').categoryId, salary);
  assert.equal(parse('100 acme').categoryId, null); // an expense named Acme is not income history
  const archived = cats.map((c) => (c.name === 'Transport' && c.kind === 'expense' ? { ...c, archived: 1 } : c));
  const p = createParser({ today: TODAY, accounts, categories: archived, transactions: [tx('Grab', cat('Transport'))], defaultAccountId: null })('5 grab');
  assert.equal(p.categoryId, null); // never suggests a hidden category
});

test('unknown notes need a pick, and no account is guessed when none exists', () => {
  const p = mk()('50 zzz');
  assert.equal(p.amount, 5000);
  assert.equal(p.categoryId, null);
  assert.equal(p.categorySource, null);
  const none = createParser({ today: TODAY, accounts: [], categories: cats, transactions: [], defaultAccountId: null })('5 grab');
  assert.equal(none.accountId, null);
});

test('malaysian examples read as people write them', () => {
  const parse = mk();
  assert.equal(parse('grabfood 24').categoryId, cat('Food & Drink'));
  assert.equal(parse('petronas 50').categoryId, cat('Transport'));
  assert.equal(parse('tnb 145 bil').categoryId, cat('Bills & Utilities'));
  assert.equal(parse('tesco 88.2').amount, 8820);
});
