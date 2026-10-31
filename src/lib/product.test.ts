import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allowanceLine, dailyAllowance } from './allowance.ts';
import { frequentSpends } from './frequent.ts';
import { suggestBudget } from './budgetPlan.ts';
import { setupChecklist } from './checklist.ts';
import { addMonthsClamped, daysBetween, weekStart } from './dates.ts';
import { defaultCategories } from './defaults.ts';
import { crossedStep, goalPct } from './goals.ts';
import { buildInsights } from './insights.ts';
import { lastFullWeek, weekRecap } from './recap.ts';
import { detectRecurring, reservedForMonth, upcomingBills } from './recurring.ts';
import { buildSampleData, isSample } from './sample.ts';
import { newMilestone, nextMilestone, streakInfo, tallyGroups } from './streak.ts';
import { DEFAULT_SETTINGS, type Budget, type Transaction } from './types.ts';

let n = 0;
const id = () => `p${++n}`;
const tx = (date: string, amount = 1000, over: Partial<Transaction> = {}): Transaction => ({
  id: id(), kind: 'expense', amount, accountId: 'a', toAccountId: null, categoryId: 'food', note: '', date, createdAt: n, importHash: null, ...over,
});
const overall = (amount: number): Budget => ({ id: 'b', categoryId: null, amount });

test('date helpers', () => {
  assert.equal(weekStart('2026-10-28'), '2026-10-26'); // Wed -> Mon
  assert.equal(weekStart('2026-11-01'), '2026-10-26'); // Sun belongs to the Monday before
  assert.equal(weekStart('2026-10-26'), '2026-10-26');
  assert.equal(daysBetween('2026-02-27', '2026-03-02'), 3);
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2); // across a DST change elsewhere; must stay whole days
  assert.equal(addMonthsClamped('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonthsClamped('2024-01-31', 1), '2024-02-29');
  assert.equal(addMonthsClamped('2026-12-15', 1), '2027-01-15');
});

test('daily allowance: no budget, safe, tight, over, and bills reserved', () => {
  const today = '2026-10-10'; // 22 days left including today
  assert.equal(dailyAllowance({ budgets: [], transactions: [], today }).status, 'none');

  const b = [overall(220000)]; // RM2,200
  const fresh = dailyAllowance({ budgets: b, transactions: [], today });
  assert.equal(fresh.allowance, 10000); // RM100/day
  assert.equal(fresh.status, 'safe');
  assert.equal(fresh.daysLeft, 22);

  const tight = dailyAllowance({ budgets: b, transactions: [tx(today, 7000)], today });
  assert.equal(tight.status, 'tight');
  assert.equal(tight.left, 3000);

  const over = dailyAllowance({ budgets: b, transactions: [tx(today, 12000)], today });
  assert.equal(over.status, 'over');
  assert.equal(over.left, -2000);

  // Yesterday's overspend lowers today's allowance instead of vanishing.
  const hangover = dailyAllowance({ budgets: b, transactions: [tx('2026-10-09', 22000)], today });
  assert.equal(hangover.allowance, 9000);

  // Bills still to come are set aside before dividing.
  const reserved = dailyAllowance({ budgets: b, transactions: [], today, reserved: 22000 });
  assert.equal(reserved.allowance, 9000);

  // Blown budget never yields a negative allowance.
  assert.equal(dailyAllowance({ budgets: [overall(1000)], transactions: [tx('2026-10-02', 5000)], today }).allowance, 0);
  // Future-dated and income rows are ignored.
  assert.equal(dailyAllowance({ budgets: b, transactions: [tx('2026-10-20', 9999), tx(today, 5000, { kind: 'income' })], today }).spentToday, 0);
});

test('streak: grace for today, gaps, no-spend days, imports ignored', () => {
  const today = '2026-10-10';
  const days = (...ds: string[]) => ds.map((d) => tx(d));

  // Today not logged yet must not reset a live streak.
  let s = streakInfo(days('2026-10-09', '2026-10-08', '2026-10-07'), [], today);
  assert.equal(s.current, 3);
  assert.equal(s.todayDone, false);
  assert.equal(s.week[6].state, 'today');

  // Logging today extends it.
  s = streakInfo(days('2026-10-10', '2026-10-09'), [], today);
  assert.equal(s.current, 2);
  assert.equal(s.todayDone, true);

  // A gap yesterday breaks it.
  assert.equal(streakInfo(days('2026-10-08', '2026-10-07'), [], today).current, 0);

  // Confirmed no-spend days bridge a gap.
  s = streakInfo(days('2026-10-10', '2026-10-08'), ['2026-10-09'], today);
  assert.equal(s.current, 3);
  assert.equal(s.week[5].state, 'nospend');

  // Best streak survives a later break.
  s = streakInfo(days('2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-10'), [], today);
  assert.equal(s.best, 4);
  assert.equal(s.current, 1);

  // Imported or sample rows never count.
  const imported = ['2026-10-09', '2026-10-08'].map((d, i) => tx(d, 1000, { importHash: `h${i}` }));
  assert.equal(streakInfo(imported, [], today).current, 0);
});

test('milestones and tally groups', () => {
  assert.equal(newMilestone(2, []), null);
  assert.equal(newMilestone(3, []), 3);
  assert.equal(newMilestone(7, [3]), 7);
  assert.equal(newMilestone(8, [3, 7]), null);
  assert.equal(newMilestone(31, [3]), 30); // jumped past 7, 14: celebrate the biggest once
  assert.equal(nextMilestone(0), 3);
  assert.equal(nextMilestone(7), 14);
  assert.equal(nextMilestone(365), 465);
  assert.deepEqual(tallyGroups(0), []);
  assert.deepEqual(tallyGroups(3), [{ strokes: 3, slashed: false }]);
  assert.deepEqual(tallyGroups(5), [{ strokes: 4, slashed: true }]);
  assert.deepEqual(tallyGroups(12), [{ strokes: 4, slashed: true }, { strokes: 4, slashed: true }, { strokes: 2, slashed: false }]);
});

test('recurring detection finds steady monthly bills and rejects variable spend', () => {
  const today = '2026-10-20';
  const netflix = ['2026-08-05', '2026-09-05', '2026-10-05'].map((d) => tx(d, 5500, { note: 'Netflix' }));
  const unifi = ['2026-09-08', '2026-10-08'].map((d) => tx(d, 12900, { note: 'Unifi 4821' }));
  const grab = ['2026-08-06', '2026-09-07', '2026-10-06'].map((d, i) => tx(d, [1800, 4500, 900][i], { note: 'Grab' })); // amounts all over
  const daily = Array.from({ length: 30 }, (_, i) => tx(`2026-09-${String((i % 28) + 1).padStart(2, '0')}`, 850, { note: 'Nasi lemak' }));
  const pharmacy = ['2026-09-03', '2026-10-02'].map((d, i) => tx(d, [3200, 3580][i], { note: 'Guardian' })); // 30 days apart, but 12% price drift
  const lateBill = ['2026-08-10', '2026-09-20', '2026-10-31'].map((d) => tx(d, 4000, { note: 'Random fee' })); // 41-day gaps
  const stale = ['2026-04-01', '2026-05-01', '2026-06-01'].map((d) => tx(d, 3000, { note: 'Old gym' })); // stopped

  const bills = detectRecurring([...netflix, ...unifi, ...grab, ...daily, ...pharmacy, ...lateBill, ...stale], today);
  assert.deepEqual(bills.map((b) => b.name), ['Netflix', 'Unifi 4821']);
  assert.equal(bills[0].confidence, 'sure');
  assert.equal(bills[1].confidence, 'likely');
  assert.equal(bills[0].nextDate, '2026-11-05');
  assert.equal(bills[0].amount, 5500);

  assert.deepEqual(upcomingBills(bills, today, 30).map((b) => b.name), ['Netflix', 'Unifi 4821']);
  assert.equal(upcomingBills(bills, today, 10).length, 0);
  // Both fall in November, so nothing is reserved against the rest of October.
  assert.equal(reservedForMonth(bills, today), 0);
  assert.equal(reservedForMonth(bills, '2026-11-01'), 5500 + 12900);
});

test('insights: starter, pace, category budget, bills', () => {
  const cats = defaultCategories(id);
  const food = cats.find((c) => c.name === 'Food & Drink')!.id;
  const fmt = (m: number) => `RM${(m / 100).toFixed(0)}`;
  const base = { categories: cats, bills: [], fmt };

  const starter = buildInsights({ ...base, transactions: [tx('2026-10-10')], budgets: [], today: '2026-10-10' });
  assert.equal(starter[0].id, 'starter');

  // RM900 in 10 days against RM1,000 -> projects RM2,790, well over.
  const heavy = Array.from({ length: 9 }, (_, i) => tx(`2026-10-0${i + 1}`, 10000, { categoryId: food }));
  const pace = buildInsights({ ...base, transactions: heavy, budgets: [overall(100000)], today: '2026-10-10' });
  assert.ok(pace.some((i) => i.id === 'pace-over' && i.tone === 'warn'));

  const capped = buildInsights({ ...base, transactions: heavy, budgets: [{ id: 'c', categoryId: food, amount: 50000 }], today: '2026-10-10' });
  assert.ok(capped.some((i) => i.id === `over-${food}` && i.tone === 'bad'));
  assert.equal(capped[0].id, `over-${food}`); // most severe first

  const light = Array.from({ length: 9 }, (_, i) => tx(`2026-10-0${i + 1}`, 1000, { categoryId: food }));
  const under = buildInsights({ ...base, transactions: light, budgets: [overall(100000)], today: '2026-10-10' });
  assert.ok(under.some((i) => i.id === 'pace-under' && i.tone === 'good'));

  const bill = { key: 'netflix', name: 'Netflix', categoryId: null, amount: 5500, lastDate: '2026-09-11', nextDate: '2026-10-11', count: 3, confidence: 'sure' as const };
  const due = buildInsights({ ...base, bills: [bill], transactions: light, budgets: [], today: '2026-10-10' });
  assert.ok(due.some((i) => i.id === 'due-netflix' && i.title.includes('tomorrow')));
});

test('weekly recap and persona', () => {
  const cats = defaultCategories(id);
  const food = cats.find((c) => c.name === 'Food & Drink')!.id;
  const start = '2026-10-19'; // Monday
  assert.equal(lastFullWeek('2026-10-28'), '2026-10-19');

  const prev = [tx('2026-10-14', 10000, { categoryId: food })];
  const week = [
    tx('2026-10-19', 5000, { categoryId: food, note: 'Mamak' }),
    tx('2026-10-20', 4000, { categoryId: food, note: 'Mamak' }),
    tx('2026-10-22', 1000, { categoryId: cats[2].id }),
  ];
  const r = weekRecap([...prev, ...week], cats, start, '2026-10-28');
  assert.equal(r.total, 10000);
  assert.equal(r.prevTotal, 10000);
  assert.equal(r.delta, 0);
  assert.equal(r.partial, false);
  assert.equal(r.to, '2026-10-25');
  assert.equal(r.count, 3);
  assert.equal(r.noSpendDays, 4);
  assert.equal(r.biggestDay?.date, '2026-10-19');
  assert.equal(r.topCategory?.id, food);
  assert.equal(r.topSpot?.name, 'Mamak');
  assert.equal(r.persona.title, 'Frugal Ninja'); // 4 no-spend days outranks the foodie label

  const empty = weekRecap([], cats, start, '2026-10-28');
  assert.equal(empty.persona.title, 'The Ghost');
  assert.equal(empty.delta, null);

  // A running week is capped at today and flagged partial.
  const running = weekRecap(week, cats, '2026-10-26', '2026-10-28');
  assert.equal(running.partial, true);
  assert.equal(running.to, '2026-10-28');
});

test('goals: progress and milestone crossing', () => {
  assert.equal(goalPct({ saved: 250, target: 1000 }), 25);
  assert.equal(goalPct({ saved: 2000, target: 1000 }), 100); // capped
  assert.equal(goalPct({ saved: 5, target: 0 }), 0);
  assert.equal(crossedStep(0, 300, 1000), 25);
  assert.equal(crossedStep(300, 400, 1000), null);
  assert.equal(crossedStep(400, 800, 1000), 75); // crossed 50 and 75: report the highest
  assert.equal(crossedStep(900, 1000, 1000), 100);
  assert.equal(crossedStep(500, 400, 1000), null); // withdrawing never celebrates
});

test('budget suggestion by goal', () => {
  const s = suggestBudget(500000, 'save'); // RM5,000 income
  assert.equal(s.overall, 350000); // 70%
  assert.ok(s.categories.every((c) => c.amount % 500 === 0));
  assert.ok(s.categories.reduce((t, c) => t + c.amount, 0) <= s.overall);
  assert.equal(suggestBudget(500000, 'debt').overall, 300000);
  assert.equal(suggestBudget(0, 'track').overall, 0);
});

test('sample data is deterministic, tagged and sane', () => {
  const cats = defaultCategories(id);
  const args = { categories: cats, accountId: 'acc', today: '2026-10-28', newId: id, income: 450000 };
  const a = buildSampleData(args);
  const b = buildSampleData(args);
  assert.deepEqual(a.map((t) => [t.date, t.amount, t.note]), b.map((t) => [t.date, t.amount, t.note]));
  assert.ok(a.length > 40);
  assert.ok(a.every(isSample));
  assert.ok(a.every((t) => t.date <= '2026-10-28' && t.amount > 0 && t.accountId === 'acc'));
  assert.ok(a.some((t) => t.kind === 'income' && t.amount === 450000));
  assert.ok(new Set(a.map((t) => t.importHash)).size === a.length);
  // Sample data must not manufacture a streak or tick the "first log" checklist item.
  assert.equal(streakInfo(a, [], '2026-10-28').current, 0);
  const list = setupChecklist({ transactions: a, budgets: [], accounts: [], goals: [], settings: DEFAULT_SETTINGS });
  assert.equal(list.find((i) => i.id === 'log')?.done, false);
  // The bills in the sample are detectable as recurring.
  const bills = detectRecurring(a, '2026-10-28');
  assert.ok(bills.some((x) => x.name === 'Netflix'));
});

test('setup checklist ticks off from real state', () => {
  const acct = (i: number) => ({ id: `a${i}`, name: 'x', type: 'bank' as const, openingBalance: 0, color: '#fff', archived: 0, sort: i });
  const list = setupChecklist({
    transactions: [tx('2026-10-10')],
    budgets: [overall(1000)],
    accounts: [acct(0), acct(1)],
    goals: [],
    settings: { ...DEFAULT_SETTINGS, lockEnabled: true },
  });
  assert.deepEqual(list.map((i) => [i.id, i.done]), [['log', true], ['budget', true], ['account', true], ['goal', false], ['lock', true]]);
});

test('frequent spends only surface repeats, newest account wins', () => {
  const mk = (date: string, note: string, amount: number, accountId = 'a', categoryId = 'food') => tx(date, amount, { note, accountId, categoryId });
  const list = frequentSpends([
    mk('2026-10-01', 'Nasi lemak', 850),
    mk('2026-10-03', ' nasi lemak ', 850, 'b'),
    mk('2026-10-04', 'Nasi lemak', 900), // different amount: its own group, a single one-off
    mk('2026-10-05', 'Starbucks', 1650),
    mk('2026-10-06', 'Starbucks', 1650),
    mk('2026-10-07', 'Starbucks', 1650),
    mk('2026-10-08', 'Once only', 500),
    tx('2026-10-09', 700, { note: '', categoryId: 'food' }), // no note: cannot be a shortcut
    tx('2026-10-09', 700, { note: 'Salary', kind: 'income' }),
  ]);
  assert.deepEqual(list.map((f) => [f.note, f.count, f.accountId]), [['Starbucks', 3, 'a'], ['Nasi lemak', 2, 'b']]);
  assert.equal(frequentSpends([]).length, 0);
});

test('allowance line is specific and never scolds', () => {
  const fmt = (m: number) => `RM${(m / 100).toFixed(0)}`;
  const b = [overall(220000)];
  const today = '2026-10-10';
  assert.equal(allowanceLine(dailyAllowance({ budgets: [], transactions: [], today }), fmt), 'Logged');
  assert.equal(allowanceLine(dailyAllowance({ budgets: b, transactions: [tx(today, 3000)], today }), fmt), 'Logged. RM70 left today');
  assert.equal(allowanceLine(dailyAllowance({ budgets: b, transactions: [tx(today, 12000)], today }), fmt), 'Logged. RM20 over today, tomorrow adjusts');
  assert.equal(allowanceLine(dailyAllowance({ budgets: [overall(1000)], transactions: [tx('2026-10-02', 5000), tx(today, 100)], today }), fmt), 'Logged. This month is past budget');
});

test('reminder plan: skips tonight once logged, never includes amounts, bills the day before', async () => {
  const { planReminders, parseTime } = await import('./reminderPlan.ts');
  assert.deepEqual(parseTime('21:30'), { hour: 21, minute: 30 });
  assert.deepEqual(parseTime('junk'), { hour: 21, minute: 0 });
  assert.deepEqual(parseTime('9:05'), { hour: 9, minute: 5 });

  const noon = new Date(2026, 9, 28, 12, 0).getTime(); // 28 Oct 12:00
  const base = { now: noon, today: '2026-10-28', remindDaily: true, remindTime: '21:00', remindWeekly: false, remindBills: false, loggedToday: false, bills: [] };

  const week = planReminders(base);
  assert.equal(week.length, 7);
  assert.equal(week[0].id, 'daily-2026-10-28');
  assert.ok(week.every((r) => r.at! > noon));

  // Logged today: tonight is skipped, tomorrow onwards remain.
  const logged = planReminders({ ...base, loggedToday: true });
  assert.equal(logged.length, 6);
  assert.equal(logged[0].id, 'daily-2026-10-29');

  // After the reminder time today there is nothing left for today.
  const late = planReminders({ ...base, now: new Date(2026, 9, 28, 22, 0).getTime() });
  assert.equal(late[0].id, 'daily-2026-10-29');

  assert.equal(planReminders({ ...base, remindDaily: false }).length, 0);
  assert.equal(planReminders({ ...base, remindDaily: false, remindWeekly: true })[0].weekly?.weekday, 1);

  const bill = { key: 'netflix', name: 'Netflix', categoryId: null, amount: 5500, lastDate: '2026-10-02', nextDate: '2026-11-02', count: 3, confidence: 'sure' as const };
  const near = planReminders({ ...base, remindDaily: false, remindBills: true, today: '2026-10-30', now: new Date(2026, 9, 30, 8, 0).getTime(), bills: [bill] });
  assert.equal(near.length, 1);
  assert.equal(near[0].at, new Date(2026, 10, 1, 9, 0).getTime()); // the day before, 9am
  assert.equal(near[0].body, 'Netflix is due tomorrow.');
  // Bills more than two weeks out are not scheduled yet.
  const far = { ...bill, nextDate: '2026-12-02' };
  assert.equal(planReminders({ ...base, remindDaily: false, remindBills: true, bills: [far] }).length, 0);

  // Privacy: no digits from amounts in any copy.
  const all = planReminders({ ...base, remindWeekly: true, remindBills: true, today: '2026-10-30', now: new Date(2026, 9, 30, 8, 0).getTime(), bills: [bill] });
  assert.ok(all.every((r) => !/RM|\d{3,}/.test(r.title + r.body)));
});
