import type { Settings, Snapshot, TableName } from '../lib/types.ts';
import type { Repo } from './schema.ts';

/**
 * Browser fallback, used only for the web preview / development. NOT encrypted: real data belongs on
 * the native build, where this file is replaced by the SQLCipher-backed index.ts.
 */
const KEY = 'tally.web.preview.v1';

type Store = Record<TableName, Record<string, unknown>[]> & { settings: Partial<Settings> };

const empty = (): Store => ({ accounts: [], categories: [], transactions: [], budgets: [], goals: [], bills: [], settings: {} });

function read(): Store {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (raw) return { ...empty(), ...(JSON.parse(raw) as Partial<Store>) };
  } catch {
    // corrupt or unavailable storage -> start empty
  }
  return empty();
}

function write(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // quota or private mode: state stays in memory for this session
  }
}

export async function openRepo(): Promise<Repo> {
  let store = read();
  return {
    encrypted: false,
    async load() {
      return JSON.parse(JSON.stringify(store)) as Snapshot;
    },
    async upsert(table, rows) {
      const map = new Map(store[table].map((r) => [r.id as string, r]));
      for (const r of rows as { id: string }[]) map.set(r.id, { ...r });
      store[table] = [...map.values()];
      write(store);
    },
    async remove(table, ids) {
      const drop = new Set(ids);
      store[table] = store[table].filter((r) => !drop.has(r.id as string));
      write(store);
    },
    async setSettings(partial) {
      store.settings = { ...store.settings, ...partial };
      write(store);
    },
    async replaceAll(snapshot) {
      store = { ...empty(), ...(JSON.parse(JSON.stringify(snapshot)) as Partial<Store>) };
      write(store);
    },
    async wipe() {
      store = empty();
      write(store);
    },
  };
}

export async function destroyDatabase() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to remove
  }
}
