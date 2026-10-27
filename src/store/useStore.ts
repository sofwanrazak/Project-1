import * as Crypto from 'expo-crypto';
import { create } from 'zustand';

import { destroyDatabase, openRepo } from '../db';
import { DbOpenError, type Repo } from '../db/schema.ts';
import { defaultAccount, defaultCategories } from '../lib/defaults.ts';
import { sortNewestFirst } from '../lib/stats.ts';
import {
  DEFAULT_SETTINGS,
  type Account,
  type Budget,
  type Category,
  type Settings,
  type Snapshot,
  type Transaction,
} from '../lib/types.ts';

export const newId = () => Crypto.randomUUID();

export type TxInput = Omit<Transaction, 'id' | 'createdAt' | 'importHash'> & { id?: string };

let repo: Repo | null = null;
const db = () => {
  if (!repo) throw new Error('Database not ready');
  return repo;
};

interface State {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  encrypted: boolean;
  /** Session-only: has the user passed app lock since launch / last auto-lock. Never persisted. */
  unlocked: boolean;
  setUnlocked(v: boolean): void;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[]; // newest first
  budgets: Budget[];
  settings: Settings;

  init(): Promise<void>;
  resetAfterError(): Promise<void>;
  completeOnboarding(p: { name: string; currency: string; openingBalance: number }): Promise<void>;

  saveTransaction(input: TxInput): Promise<Transaction>;
  deleteTransaction(id: string): Promise<Transaction | undefined>;
  restoreTransaction(t: Transaction): Promise<void>;
  importTransactions(rows: Transaction[]): Promise<number>;

  saveAccount(a: Omit<Account, 'id' | 'sort' | 'archived'> & { id?: string }): Promise<void>;
  removeAccount(id: string): Promise<'deleted' | 'archived'>;
  saveCategory(c: Omit<Category, 'id' | 'sort' | 'archived'> & { id?: string }): Promise<void>;
  removeCategory(id: string): Promise<'deleted' | 'archived'>;
  setBudget(categoryId: string | null, amount: number): Promise<void>;
  setArchived(table: 'accounts' | 'categories', id: string, archived: boolean): Promise<void>;

  updateSettings(p: Partial<Settings>): Promise<void>;
  snapshot(): Snapshot;
  restore(s: Snapshot): Promise<void>;
  eraseAll(): Promise<void>;
}

function fail(msg: string): never {
  throw new Error(msg);
}

function validateTx(s: Pick<State, 'accounts' | 'categories'>, t: TxInput) {
  if (!Number.isSafeInteger(t.amount) || t.amount <= 0) fail('Enter an amount greater than zero.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date)) fail('Pick a valid date.');
  if (!s.accounts.some((a) => a.id === t.accountId)) fail('Pick an account.');
  if (t.kind === 'transfer') {
    if (!t.toAccountId || !s.accounts.some((a) => a.id === t.toAccountId)) fail('Pick the destination account.');
    if (t.toAccountId === t.accountId) fail('Choose two different accounts.');
  } else {
    const cat = s.categories.find((c) => c.id === t.categoryId);
    if (!cat || cat.kind !== t.kind) fail('Pick a category.');
  }
}

export const useStore = create<State>()((set, get) => ({
  status: 'loading',
  error: null,
  encrypted: false,
  unlocked: false,
  setUnlocked: (unlocked) => set({ unlocked }),
  accounts: [],
  categories: [],
  transactions: [],
  budgets: [],
  settings: DEFAULT_SETTINGS,

  async init() {
    try {
      repo = await openRepo();
      const snap = await repo.load();
      set({
        status: 'ready',
        error: null,
        encrypted: repo.encrypted,
        accounts: snap.accounts.sort((a, b) => a.sort - b.sort),
        categories: snap.categories.sort((a, b) => a.sort - b.sort),
        transactions: sortNewestFirst(snap.transactions),
        budgets: snap.budgets,
        settings: { ...DEFAULT_SETTINGS, ...snap.settings },
      });
    } catch (e) {
      set({ status: 'error', error: e instanceof DbOpenError ? e.message : 'Something went wrong while loading your data.' });
    }
  },

  async resetAfterError() {
    await destroyDatabase();
    repo = null;
    set({ status: 'loading' });
    await get().init();
  },

  async completeOnboarding({ name, currency, openingBalance }) {
    const r = db();
    const s = get();
    if (s.accounts.length === 0) {
      const acc = defaultAccount(newId, openingBalance);
      await r.upsert('accounts', [acc]);
      set({ accounts: [acc] });
    }
    if (s.categories.length === 0) {
      const cats = defaultCategories(newId);
      await r.upsert('categories', cats);
      set({ categories: cats });
    }
    await get().updateSettings({ name: name.trim().slice(0, 60), currency, onboarded: true });
  },

  async saveTransaction(input) {
    const s = get();
    validateTx(s, input);
    const existing = input.id ? s.transactions.find((t) => t.id === input.id) : undefined;
    const t: Transaction = {
      ...input,
      id: existing?.id ?? newId(),
      toAccountId: input.kind === 'transfer' ? input.toAccountId : null,
      categoryId: input.kind === 'transfer' ? null : input.categoryId,
      note: input.note.trim().slice(0, 500),
      createdAt: existing?.createdAt ?? Date.now(),
      importHash: existing?.importHash ?? null,
    };
    await db().upsert('transactions', [t]);
    set({ transactions: sortNewestFirst([...s.transactions.filter((x) => x.id !== t.id), t]) });
    return t;
  },

  async deleteTransaction(id) {
    const t = get().transactions.find((x) => x.id === id);
    if (!t) return undefined;
    await db().remove('transactions', [id]);
    set((s) => ({ transactions: s.transactions.filter((x) => x.id !== id) }));
    return t;
  },

  async restoreTransaction(t) {
    await db().upsert('transactions', [t]);
    set((s) => ({ transactions: sortNewestFirst([...s.transactions.filter((x) => x.id !== t.id), t]) }));
  },

  async importTransactions(planned) {
    if (planned.length === 0) return 0;
    const now = Date.now();
    const rows = planned.map((t, i) => ({ ...t, createdAt: now + i }));
    await db().upsert('transactions', rows);
    set((s) => ({ transactions: sortNewestFirst([...s.transactions, ...rows]) }));
    return rows.length;
  },

  async saveAccount(a) {
    const s = get();
    const name = a.name.trim().slice(0, 80);
    if (!name) fail('Give the account a name.');
    if (!Number.isSafeInteger(a.openingBalance)) fail('Invalid opening balance.');
    const existing = a.id ? s.accounts.find((x) => x.id === a.id) : undefined;
    const row: Account = {
      id: existing?.id ?? newId(),
      name,
      type: a.type,
      openingBalance: a.openingBalance,
      color: a.color,
      archived: existing?.archived ?? 0,
      sort: existing?.sort ?? s.accounts.length,
    };
    await db().upsert('accounts', [row]);
    set({ accounts: [...s.accounts.filter((x) => x.id !== row.id), row].sort((x, y) => x.sort - y.sort) });
  },

  async removeAccount(id) {
    const s = get();
    const used = s.transactions.some((t) => t.accountId === id || t.toAccountId === id);
    if (!used) {
      await db().remove('accounts', [id]);
      set({ accounts: s.accounts.filter((a) => a.id !== id) });
      return 'deleted';
    }
    // History must keep adding up, so a used account is archived (hidden), never deleted.
    const row = { ...s.accounts.find((a) => a.id === id)!, archived: 1 };
    await db().upsert('accounts', [row]);
    set({ accounts: s.accounts.map((a) => (a.id === id ? row : a)) });
    return 'archived';
  },

  async saveCategory(c) {
    const s = get();
    const name = c.name.trim().slice(0, 80);
    if (!name) fail('Give the category a name.');
    const existing = c.id ? s.categories.find((x) => x.id === c.id) : undefined;
    const row: Category = {
      id: existing?.id ?? newId(),
      name,
      icon: c.icon.trim().slice(0, 16) || '📦',
      color: c.color,
      kind: existing?.kind ?? c.kind,
      archived: existing?.archived ?? 0,
      sort: existing?.sort ?? s.categories.length,
    };
    await db().upsert('categories', [row]);
    set({ categories: [...s.categories.filter((x) => x.id !== row.id), row].sort((x, y) => x.sort - y.sort) });
  },

  async removeCategory(id) {
    const s = get();
    const used = s.transactions.some((t) => t.categoryId === id);
    const budget = s.budgets.find((b) => b.categoryId === id);
    if (budget) {
      await db().remove('budgets', [budget.id]);
      set({ budgets: s.budgets.filter((b) => b.id !== budget.id) });
    }
    if (!used) {
      await db().remove('categories', [id]);
      set({ categories: get().categories.filter((c) => c.id !== id) });
      return 'deleted';
    }
    const row = { ...s.categories.find((c) => c.id === id)!, archived: 1 };
    await db().upsert('categories', [row]);
    set({ categories: get().categories.map((c) => (c.id === id ? row : c)) });
    return 'archived';
  },

  async setBudget(categoryId, amount) {
    const s = get();
    const existing = s.budgets.find((b) => b.categoryId === categoryId);
    if (amount <= 0) {
      if (existing) {
        await db().remove('budgets', [existing.id]);
        set({ budgets: s.budgets.filter((b) => b.id !== existing.id) });
      }
      return;
    }
    const row: Budget = { id: existing?.id ?? newId(), categoryId, amount };
    await db().upsert('budgets', [row]);
    set({ budgets: [...s.budgets.filter((b) => b.id !== row.id), row] });
  },

  async setArchived(table, id, archived) {
    const s = get();
    const flag = archived ? 1 : 0;
    if (table === 'accounts') {
      const row = s.accounts.find((a) => a.id === id);
      if (!row) return;
      await db().upsert('accounts', [{ ...row, archived: flag }]);
      set({ accounts: s.accounts.map((a) => (a.id === id ? { ...a, archived: flag } : a)) });
    } else {
      const row = s.categories.find((c) => c.id === id);
      if (!row) return;
      await db().upsert('categories', [{ ...row, archived: flag }]);
      set({ categories: s.categories.map((c) => (c.id === id ? { ...c, archived: flag } : c)) });
    }
  },

  async updateSettings(p) {
    await db().setSettings(p);
    set((s) => ({ settings: { ...s.settings, ...p } }));
  },

  snapshot() {
    const s = get();
    return { accounts: s.accounts, categories: s.categories, transactions: s.transactions, budgets: s.budgets, settings: s.settings };
  },

  async restore(snap) {
    // Security settings stay as they are on this device; a file must never switch the lock off.
    const keep = get().settings;
    const settings = { ...DEFAULT_SETTINGS, ...snap.settings, lockEnabled: keep.lockEnabled, lockAfterSec: keep.lockAfterSec, blockScreenshots: keep.blockScreenshots, onboarded: true };
    await db().replaceAll({ ...snap, settings });
    set({
      accounts: [...snap.accounts].sort((a, b) => a.sort - b.sort),
      categories: [...snap.categories].sort((a, b) => a.sort - b.sort),
      transactions: sortNewestFirst(snap.transactions),
      budgets: snap.budgets,
      settings,
    });
  },

  async eraseAll() {
    await db().wipe();
    set({ accounts: [], categories: [], transactions: [], budgets: [], settings: DEFAULT_SETTINGS });
  },
}));
