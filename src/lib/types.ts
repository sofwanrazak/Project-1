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

export type Settings = {
  name: string;
  currency: string;
  theme: 'system' | 'light' | 'dark';
  lockEnabled: boolean;
  lockAfterSec: number;
  hideAmounts: boolean;
  blockScreenshots: boolean;
  onboarded: boolean;
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
};

export type TableName = 'accounts' | 'categories' | 'transactions' | 'budgets';

export interface Snapshot {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  settings: Partial<Settings>;
}
