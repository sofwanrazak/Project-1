import { isValidDate } from './dates.ts';
import type { Account, Budget, Category, Goal, Settings, Snapshot, Transaction } from './types.ts';

export const BACKUP_VERSION = 1;

export class BackupError extends Error {}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function str(o: Obj, k: string, max: number, allowEmpty = false): string {
  const v = o[k];
  if (typeof v !== 'string' || v.length > max || (!allowEmpty && v.length === 0)) throw new BackupError(`Invalid "${k}"`);
  return v;
}

function optStr(o: Obj, k: string, max: number): string | null {
  const v = o[k];
  if (v === null || v === undefined) return null;
  return str(o, k, max);
}

function int(o: Obj, k: string, opts: { min?: number } = {}): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || (opts.min !== undefined && v < opts.min)) throw new BackupError(`Invalid "${k}"`);
  return v;
}

function oneOf<T extends string>(o: Obj, k: string, allowed: readonly T[]): T {
  const v = o[k];
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) throw new BackupError(`Invalid "${k}"`);
  return v as T;
}

const flag = (o: Obj, k: string) => (int(o, k) ? 1 : 0);
const color = (o: Obj, k: string) => {
  const v = str(o, k, 9);
  if (!/^#[0-9a-fA-F]{6,8}$/.test(v)) throw new BackupError(`Invalid "${k}"`);
  return v;
};

function list(snapshot: Obj, key: string, optional = false): Obj[] {
  const v = snapshot[key];
  if (optional && v === undefined) return [];
  if (!Array.isArray(v) || v.length > 200_000) throw new BackupError(`Invalid "${key}"`);
  return v.map((x) => {
    if (!isObj(x)) throw new BackupError(`Invalid row in "${key}"`);
    return x;
  });
}

/** Strictly validates untrusted JSON from a backup file; copies only known fields. */
export function validateSnapshot(input: unknown): Snapshot {
  if (!isObj(input)) throw new BackupError('Not a Tally backup');
  if (input.app !== 'tally' || input.version !== BACKUP_VERSION) throw new BackupError('Unsupported backup version');
  const data = input.data;
  if (!isObj(data)) throw new BackupError('Backup has no data');

  const accounts: Account[] = list(data, 'accounts').map((o) => ({
    id: str(o, 'id', 64),
    name: str(o, 'name', 80),
    type: oneOf(o, 'type', ['cash', 'bank', 'card', 'ewallet', 'savings'] as const),
    openingBalance: int(o, 'openingBalance'),
    color: color(o, 'color'),
    archived: flag(o, 'archived'),
    sort: int(o, 'sort'),
  }));
  const categories: Category[] = list(data, 'categories').map((o) => ({
    id: str(o, 'id', 64),
    name: str(o, 'name', 80),
    icon: str(o, 'icon', 16),
    color: color(o, 'color'),
    kind: oneOf(o, 'kind', ['expense', 'income'] as const),
    archived: flag(o, 'archived'),
    sort: int(o, 'sort'),
  }));
  const accountIds = new Set(accounts.map((a) => a.id));
  const categoryIds = new Set(categories.map((c) => c.id));

  const transactions: Transaction[] = list(data, 'transactions').map((o) => {
    const date = str(o, 'date', 10);
    const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m || !isValidDate(Number(m[1]), Number(m[2]), Number(m[3]))) throw new BackupError('Invalid transaction date');
    const t: Transaction = {
      id: str(o, 'id', 64),
      kind: oneOf(o, 'kind', ['expense', 'income', 'transfer'] as const),
      amount: int(o, 'amount', { min: 1 }),
      accountId: str(o, 'accountId', 64),
      toAccountId: optStr(o, 'toAccountId', 64),
      categoryId: optStr(o, 'categoryId', 64),
      note: str(o, 'note', 500, true),
      date,
      createdAt: int(o, 'createdAt', { min: 0 }),
      importHash: optStr(o, 'importHash', 64),
    };
    if (!accountIds.has(t.accountId)) throw new BackupError('Transaction references a missing account');
    if (t.kind === 'transfer') {
      if (!t.toAccountId || !accountIds.has(t.toAccountId) || t.toAccountId === t.accountId) throw new BackupError('Invalid transfer');
    } else if (t.categoryId && !categoryIds.has(t.categoryId)) throw new BackupError('Transaction references a missing category');
    return t;
  });
  const budgets: Budget[] = list(data, 'budgets').map((o) => {
    const b: Budget = { id: str(o, 'id', 64), categoryId: optStr(o, 'categoryId', 64), amount: int(o, 'amount', { min: 1 }) };
    if (b.categoryId && !categoryIds.has(b.categoryId)) throw new BackupError('Budget references a missing category');
    return b;
  });

  // Older backups predate goals, so the list is optional.
  const goals: Goal[] = list(data, 'goals', true).map((o) => {
    const g: Goal = { id: str(o, 'id', 64), name: str(o, 'name', 80), icon: str(o, 'icon', 16), color: color(o, 'color'), target: int(o, 'target', { min: 1 }), saved: int(o, 'saved', { min: 0 }), createdAt: int(o, 'createdAt', { min: 0 }) };
    return g;
  });

  for (const [name, rows] of [['accounts', accounts], ['categories', categories], ['transactions', transactions], ['budgets', budgets], ['goals', goals]] as const) {
    const ids = (rows as { id: string }[]).map((r) => r.id);
    if (new Set(ids).size !== ids.length) throw new BackupError(`Duplicate ids in "${name}"`);
  }

  return { accounts, categories, transactions, budgets, goals, settings: validateSettings(data.settings) };
}

function validateSettings(v: unknown): Partial<Settings> {
  if (v === undefined) return {};
  if (!isObj(v)) throw new BackupError('Invalid "settings"');
  const out: Partial<Settings> = {};
  if (typeof v.name === 'string') out.name = v.name.slice(0, 60);
  if (typeof v.currency === 'string' && /^[A-Z]{3}$/.test(v.currency)) out.currency = v.currency;
  if (v.theme === 'system' || v.theme === 'light' || v.theme === 'dark') out.theme = v.theme;
  if (typeof v.hideAmounts === 'boolean') out.hideAmounts = v.hideAmounts;
  if (typeof v.onboarded === 'boolean') out.onboarded = v.onboarded;
  if (typeof v.monthlyIncome === 'number' && Number.isSafeInteger(v.monthlyIncome) && v.monthlyIncome >= 0) out.monthlyIncome = v.monthlyIncome;
  if (v.goal === 'save' || v.goal === 'track' || v.goal === 'debt' || v.goal === 'budget') out.goal = v.goal;
  if (Array.isArray(v.noSpendDays)) {
    out.noSpendDays = v.noSpendDays
      .filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
      .slice(-800);
  }
  // Security-sensitive settings (lock, screenshot blocking) are deliberately NOT restored from a file.
  return out;
}

export function buildBackup(snapshot: Snapshot, now = new Date()): string {
  return JSON.stringify({ app: 'tally', version: BACKUP_VERSION, exportedAt: now.toISOString(), data: snapshot }, null, 2);
}

export function parseBackup(text: string): Snapshot {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupError('File is not valid JSON');
  }
  return validateSnapshot(json);
}
