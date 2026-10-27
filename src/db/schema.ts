import type { Settings, Snapshot, TableName } from '../lib/types.ts';

/** Column lists are the only identifiers ever interpolated into SQL; every value is a bound parameter. */
export const COLUMNS: Record<TableName, readonly string[]> = {
  accounts: ['id', 'name', 'type', 'openingBalance', 'color', 'archived', 'sort'],
  categories: ['id', 'name', 'icon', 'color', 'kind', 'archived', 'sort'],
  transactions: ['id', 'kind', 'amount', 'accountId', 'toAccountId', 'categoryId', 'note', 'date', 'createdAt', 'importHash'],
  budgets: ['id', 'categoryId', 'amount'],
};

export const TABLE_NAMES = Object.keys(COLUMNS) as TableName[];

export const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
export const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

export const MIGRATIONS: string[] = [
  `
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    opening_balance INTEGER NOT NULL DEFAULT 0,
    color TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('expense','income')),
    archived INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE transactions (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('expense','income','transfer')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    account_id TEXT NOT NULL,
    to_account_id TEXT,
    category_id TEXT,
    note TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    import_hash TEXT
  );
  CREATE INDEX idx_tx_date ON transactions (date DESC, created_at DESC);
  CREATE INDEX idx_tx_hash ON transactions (import_hash);
  CREATE TABLE budgets (
    id TEXT PRIMARY KEY NOT NULL,
    category_id TEXT,
    amount INTEGER NOT NULL CHECK (amount > 0)
  );
  CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];

export interface Repo {
  /** True only when the database file is really encrypted with SQLCipher. */
  encrypted: boolean;
  load(): Promise<Snapshot>;
  upsert(table: TableName, rows: object[]): Promise<void>;
  remove(table: TableName, ids: string[]): Promise<void>;
  setSettings(partial: Partial<Settings>): Promise<void>;
  /** Replace the entire database contents atomically (restore from backup). */
  replaceAll(snapshot: Snapshot): Promise<void>;
  wipe(): Promise<void>;
}

export class DbOpenError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'DbOpenError';
  }
}
