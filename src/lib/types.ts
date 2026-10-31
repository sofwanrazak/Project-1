export type TxKind = 'expense' | 'income' | 'transfer';
export type AccountType = 'cash' | 'bank' | 'card' | 'ewallet' | 'savings';

/** All money values are integers in minor units (sen), never floats. */
export interface Account {
  id: string;
  name: string;
  type: AccountType;
  openingBalance: number;
  color: string;
  archived: number; // 0 | 1 (SQLite has no boolean)
  sort: number;
}

export interface Category {
  id: string;
  name: string;
  icon: string; // emoji
  color: string;
  kind: 'expense' | 'income';
  archived: number;
  sort: number;
}

export interface Transaction {
  id: string;
  kind: TxKind;
  amount: number; // always positive
  accountId: string;
  toAccountId: string | null; // transfers only
  categoryId: string | null; // null for transfers
  note: string;
  date: string; // YYYY-MM-DD, local
  createdAt: number;
  importHash: string | null;
}

export interface Budget {
  id: string;
  categoryId: string | null; // null = overall monthly budget
  amount: number;
}

export interface Goal {
  id: string;
  name: string;
  icon: string; // emoji
  color: string;
  target: number;
  saved: number;
  createdAt: number;
}

export type MoneyGoal = 'save' | 'track' | 'debt' | 'budget';

export type Settings = {
  name: string;
  currency: string;
  theme: 'system' | 'light' | 'dark';
  lockEnabled: boolean;
  lockAfterSec: number;
  hideAmounts: boolean;
  blockScreenshots: boolean;
  onboarded: boolean;
  /** Why the user is here; shapes the suggested budget and the tone of nudges. */
  goal: MoneyGoal | null;
  monthlyIncome: number; // minor units, 0 = not given
  /** True while the app holds generated demo transactions the user has not cleared yet. */
  sampleData: boolean;
  /** Days the user confirmed they spent nothing; they count toward the streak. */
  noSpendDays: string[];
  /** Streak milestones already celebrated, so each fires once. */
  seenMilestones: number[];
  remindDaily: boolean;
  remindTime: string; // HH:MM, 24h
  remindWeekly: boolean;
  remindBills: boolean;
  /** Set once we have asked about notifications, so we never nag. */
  askedReminders: boolean;
  lastBackupAt: number;
  /** Week (Monday, YYYY-MM-DD) of the last recap the user finished. */
  lastRecapWeek: string;
  checklistHidden: boolean;
  lockNudgeDismissed: boolean;
  /** Which way the + button logs a spend: one typed line, or the keypad. Remembers the last choice. */
  entryMode: 'type' | 'keypad';
};

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  currency: 'MYR',
  theme: 'system',
  lockEnabled: false,
  lockAfterSec: 30,
  hideAmounts: false,
  blockScreenshots: false,
  onboarded: false,
  goal: null,
  monthlyIncome: 0,
  sampleData: false,
  noSpendDays: [],
  seenMilestones: [],
  remindDaily: false,
  remindTime: '21:00',
  remindWeekly: false,
  remindBills: false,
  askedReminders: false,
  lastBackupAt: 0,
  lastRecapWeek: '',
  checklistHidden: false,
  lockNudgeDismissed: false,
  entryMode: 'type',
};

export type TableName = 'accounts' | 'categories' | 'transactions' | 'budgets' | 'goals';

export interface Snapshot {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  settings: Partial<Settings>;
}
