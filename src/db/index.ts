import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';

import type { Settings, Snapshot, TableName } from '../lib/types.ts';
import { camel, COLUMNS, DbOpenError, MIGRATIONS, snake, TABLE_NAMES, type Repo } from './schema.ts';

const DB_NAME = 'tally.db';
const KEY_NAME = 'tally.dbkey.v1';

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** 256-bit random key, generated once and kept only in the Keychain / Android Keystore. */
async function getOrCreateKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_NAME);
  if (existing && /^[0-9a-f]{64}$/.test(existing)) return existing;
  const key = toHex(Crypto.getRandomBytes(32));
  await SecureStore.setItemAsync(KEY_NAME, key, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  return key;
}

type Row = Record<string, unknown>;

function toDb(table: TableName, obj: Row): unknown[] {
  return COLUMNS[table].map((c) => obj[c] ?? null);
}

function fromDb(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[camel(k)] = v;
  return out;
}

async function migrate(db: SQLite.SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version > MIGRATIONS.length) throw new DbOpenError('Database is from a newer version of the app.');
  while (version < MIGRATIONS.length) {
    const next = version + 1;
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}

async function open(): Promise<{ db: SQLite.SQLiteDatabase; encrypted: boolean }> {
  const key = await getOrCreateKey();
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  // Must be the first statement. On a SQLite build without SQLCipher (e.g. Expo Go) this is a silent no-op,
  // which is why we verify via cipher_version instead of trusting that the pragma worked.
  await db.execAsync(`PRAGMA key = "x'${key}'"`);
  const cipher = await db.getFirstAsync<Row>('PRAGMA cipher_version');
  const encrypted = !!cipher && Object.values(cipher).some((v) => typeof v === 'string' && v.length > 0);
  // Forces SQLCipher to actually decrypt page 1: throws "file is not a database" on a wrong key.
  await db.getFirstAsync('SELECT count(*) AS n FROM sqlite_master');
  await db.execAsync('PRAGMA journal_mode = WAL');
  return { db, encrypted };
}

export async function openRepo(): Promise<Repo> {
  let opened: Awaited<ReturnType<typeof open>>;
  try {
    opened = await open();
    await migrate(opened.db);
  } catch (e) {
    throw e instanceof DbOpenError ? e : new DbOpenError('Could not open the encrypted database.', e);
  }
  const { db, encrypted } = opened;

  async function upsertTx(table: TableName, rows: object[]) {
    const cols = COLUMNS[table];
    const sql = `INSERT OR REPLACE INTO ${table} (${cols.map(snake).join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
    for (const r of rows) await db.runAsync(sql, toDb(table, r as Row) as SQLite.SQLiteBindParams);
  }

  return {
    encrypted,

    async load() {
      const snap: Row = {};
      for (const t of TABLE_NAMES) {
        const rows = await db.getAllAsync<Row>(`SELECT * FROM ${t}`);
        snap[t] = rows.map(fromDb);
      }
      const settings: Record<string, unknown> = {};
      for (const r of await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings')) {
        try {
          settings[r.key] = JSON.parse(r.value);
        } catch {
          // ignore a corrupt single setting; defaults apply
        }
      }
      return { ...snap, settings } as unknown as Snapshot;
    },

    async upsert(table, rows) {
      if (rows.length === 0) return;
      await db.withTransactionAsync(() => upsertTx(table, rows));
    },

    async remove(table, ids) {
      if (ids.length === 0) return;
      await db.withTransactionAsync(async () => {
        for (const id of ids) await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, [id]);
      });
    },

    async setSettings(partial: Partial<Settings>) {
      await db.withTransactionAsync(async () => {
        for (const [k, v] of Object.entries(partial)) {
          await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [k, JSON.stringify(v)]);
        }
      });
    },

    async replaceAll(snapshot) {
      await db.withTransactionAsync(async () => {
        for (const t of TABLE_NAMES) await db.execAsync(`DELETE FROM ${t}`);
        await db.execAsync('DELETE FROM settings');
        for (const t of TABLE_NAMES) await upsertTx(t, snapshot[t]);
        for (const [k, v] of Object.entries(snapshot.settings)) {
          await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [k, JSON.stringify(v)]);
        }
      });
    },

    async wipe() {
      await db.withTransactionAsync(async () => {
        for (const t of TABLE_NAMES) await db.execAsync(`DELETE FROM ${t}`);
        await db.execAsync('DELETE FROM settings');
      });
      await db.execAsync('VACUUM');
    },
  };
}

/** Last resort when the DB cannot be opened (lost key). Destroys the local data file and its key. */
export async function destroyDatabase() {
  try {
    await SQLite.deleteDatabaseAsync(DB_NAME);
  } catch {
    // file may not exist
  }
  await SecureStore.deleteItemAsync(KEY_NAME);
}
