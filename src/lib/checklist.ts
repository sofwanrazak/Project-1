import type { Account, Budget, Goal, Settings, Transaction } from './types.ts';

export interface ChecklistItem {
  id: 'log' | 'budget' | 'account' | 'goal' | 'lock';
  title: string;
  hint: string;
  done: boolean;
  route: '/add' | '/budget-edit' | '/account-edit' | '/goal-edit' | '/settings';
}

export function setupChecklist(a: { transactions: Transaction[]; budgets: Budget[]; accounts: Account[]; goals: Goal[]; settings: Settings }): ChecklistItem[] {
  const real = a.transactions.some((t) => !t.importHash?.startsWith('sample:'));
  return [
    { id: 'log', title: 'Log your first expense', hint: 'Takes five seconds', done: real, route: '/add' },
    { id: 'budget', title: 'Set a monthly budget', hint: 'Unlocks your daily allowance', done: a.budgets.some((b) => b.categoryId === null), route: '/budget-edit' },
    { id: 'account', title: 'Add your bank or e-wallet', hint: 'See every balance in one place', done: a.accounts.filter((x) => !x.archived).length > 1, route: '/account-edit' },
    { id: 'goal', title: 'Start a savings goal', hint: 'Give your savings a name', done: a.goals.length > 0, route: '/goal-edit' },
    { id: 'lock', title: 'Lock the app', hint: 'Face ID or fingerprint', done: a.settings.lockEnabled, route: '/settings' },
  ];
}
