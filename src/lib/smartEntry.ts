import { addDays, fromDateStr, isValidDate, toDateStr } from './dates.ts';
import { suggestCategory } from './defaults.ts';
import { parseMinor } from './money.ts';
import type { Account, Category, Transaction, TxKind } from './types.ts';

export interface ParsedEntry {
  /** Minor units, or null while the text has no readable amount. */
  amount: number | null;
  kind: 'expense' | 'income';
  note: string;
  categoryId: string | null;
  categorySource: 'history' | 'rule' | null;
  accountId: string | null;
  accountExplicit: boolean;
  date: string;
  dateExplicit: boolean;
}

export interface ParseContext {
  today: string;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  /** Used when the text names no account. */
  defaultAccountId: string | null;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const INCOME_WORDS = new Set(['salary', 'gaji', 'bonus', 'refund', 'angpao', 'dividend', 'cashback', 'rebate', 'received', 'terima', 'income', 'freelance', 'hadiah']);
const INCOME_PHRASES = ['ang pow', 'duit raya'];
const CURRENCY_WORDS = new Set(['rm', 'myr', 'ringgit']);
const MAX_MINOR = 99_999_999_999; // RM999,999,999.99, same ceiling as the keypad

const NUM = String.raw`\d[\d,]*(?:\.\d+)?k?`;
const AMOUNT_TOKEN = new RegExp(String.raw`^\+?(?:rm|myr)?${NUM}(?:\+${NUM})*$`, 'i');

/** "12.5" -> 1250, "1.5k" -> 150000, "8+3.50" -> 1150. Null for more than two decimals or unsafe values. */
function amountOf(raw: string): number | null {
  const body = raw.replace(/^\+/, '').replace(/^(rm|myr)/i, '');
  let total = 0;
  for (const part of body.split('+')) {
    const k = /k$/i.test(part);
    const base = parseMinor(part.replace(/k$/i, '').replace(/,/g, ''));
    if (base === null) return null;
    total += k ? base * 1000 : base;
  }
  return Number.isSafeInteger(total) && total > 0 && total <= MAX_MINOR ? total : null;
}

/** True for tokens that say "this is the money": an rm prefix, decimals, a k suffix, or a sum. */
const looksLikeMoney = (t: string) => /^\+?(rm|myr)/i.test(t) || /\./.test(t) || /k$/i.test(t) || t.slice(1).includes('+');

function lastWeekday(today: string, dow: number): string {
  const back = ((fromDateStr(today).getDay() - dow + 7) % 7) || 7; // never today: "mon" means the Monday just gone
  return addDays(today, -back);
}

interface HistoryIndex {
  /** note (lower) -> category id -> count, per kind */
  byKind: Record<TxKind, Map<string, Map<string, number>>>;
}

function indexHistory(txs: Transaction[]): HistoryIndex {
  const byKind: HistoryIndex['byKind'] = { expense: new Map(), income: new Map(), transfer: new Map() };
  for (const t of txs) {
    const note = t.note.trim().toLowerCase();
    if (!note || !t.categoryId) continue;
    const m = byKind[t.kind];
    const row = m.get(note) ?? new Map<string, number>();
    row.set(t.categoryId, (row.get(t.categoryId) ?? 0) + 1);
    m.set(note, row);
  }
  return { byKind };
}

const topOf = (counts: Map<string, number>) => [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];

function fromHistory(index: HistoryIndex, kind: 'expense' | 'income', note: string, categories: Category[]): string | null {
  const key = note.toLowerCase();
  if (!key) return null;
  const rows = index.byKind[kind];
  const usable = (id: string) => categories.some((c) => c.id === id && !c.archived && c.kind === kind);

  const exact = rows.get(key);
  if (exact) {
    const id = topOf(exact);
    if (usable(id)) return id;
  }
  // "grab to klcc" should find "grab": whole-word containment either way, longest known note wins.
  const words = new Set(key.split(/\s+/));
  let best: { len: number; id: string } | null = null;
  for (const [known, counts] of rows) {
    const hit = known.split(/\s+/).every((w) => words.has(w)) || key.split(/\s+/).every((w) => known.split(/\s+/).includes(w));
    if (!hit) continue;
    const id = topOf(counts);
    if (usable(id) && (!best || known.length > best.len)) best = { len: known.length, id };
  }
  return best?.id ?? null;
}

/**
 * Builds a parser for one-line entries like "18 grab", "12.50 nasi lemak yesterday @maybank", "+4500 salary".
 * Reading is forgiving but never silent about doubt: unresolved parts come back null so the UI can ask.
 */
export function createParser(ctx: ParseContext) {
  const history = indexHistory(ctx.transactions);
  const active = ctx.accounts.filter((a) => !a.archived);

  const accountFor = (token: string, explicitAt: boolean): Account | null => {
    const t = token.toLowerCase();
    if (explicitAt) return active.find((a) => a.name.toLowerCase().startsWith(t)) ?? null;
    if (t.length < 3) return null;
    const hits = active.filter((a) => a.name.toLowerCase().split(/\s+/).includes(t));
    return hits.length === 1 ? hits[0] : null;
  };

  return function parse(text: string): ParsedEntry {
    const raw = text.trim().split(/\s+/).filter(Boolean);
    const consumed = new Set<number>();

    let date = ctx.today;
    let dateExplicit = false;
    const setDate = (d: string, ...idx: number[]) => {
      date = d;
      dateExplicit = true;
      idx.forEach((i) => consumed.add(i));
    };

    // Dates first, so "2 days ago" is not mistaken for an amount of 2.
    raw.forEach((tok, i) => {
      const t = tok.toLowerCase();
      if (consumed.has(i)) return;
      if (t === 'yesterday' || t === 'yday' || t === 'semalam') return setDate(addDays(ctx.today, -1), i);
      if (t === 'kelmarin') return setDate(addDays(ctx.today, -2), i);
      if (t === 'today') return setDate(ctx.today, i);
      const ago = /^(\d{1,3})d?$/.exec(t);
      const next = raw[i + 1]?.toLowerCase();
      if (ago && (next === 'ago' || ((next === 'day' || next === 'days') && raw[i + 2]?.toLowerCase() === 'ago'))) {
        return setDate(addDays(ctx.today, -Number(ago[1])), i, i + 1, ...(next === 'ago' ? [] : [i + 2]));
      }
      const wd = WEEKDAYS.findIndex((w) => w === t || (t.length === 3 && w.startsWith(t) && /^(last|on)$/.test(raw[i - 1]?.toLowerCase() ?? '')));
      if (wd >= 0) {
        const prev = raw[i - 1]?.toLowerCase();
        return setDate(lastWeekday(ctx.today, wd), i, ...(prev === 'last' || prev === 'on' ? [i - 1] : []));
      }
      const dm = /^(\d{1,2})[/-](\d{1,2})$/.exec(t);
      if (dm) {
        const [d, m] = [Number(dm[1]), Number(dm[2])];
        const year = Number(ctx.today.slice(0, 4));
        for (const y of [year, year - 1]) {
          if (isValidDate(y, m, d)) {
            const cand = toDateStr(new Date(y, m - 1, d));
            if (cand <= ctx.today) return setDate(cand, i);
          }
        }
      }
    });

    // Account: "@maybank", or a distinctive account word ("tng").
    let account: Account | null = null;
    raw.forEach((tok, i) => {
      if (consumed.has(i) || account) return;
      if (tok.startsWith('@') && tok.length > 1) {
        const a = accountFor(tok.slice(1), true);
        if (a) {
          account = a;
          consumed.add(i);
        }
      } else if (!AMOUNT_TOKEN.test(tok)) {
        const a = accountFor(tok, false);
        if (a) {
          account = a;
          consumed.add(i);
        }
      }
    });

    // Amount: an rm-prefixed / decimal / k / summed token wins; otherwise the first token if numeric, else the last.
    const numeric = raw.map((t, i) => ({ t, i })).filter(({ t, i }) => !consumed.has(i) && AMOUNT_TOKEN.test(t) && amountOf(t) !== null);
    const money = numeric.find(({ t }) => looksLikeMoney(t));
    const chosen = money ?? (numeric.find(({ i }) => i === 0) ?? numeric[numeric.length - 1]);
    let amount: number | null = null;
    let incomeMarker = false;
    if (chosen) {
      amount = amountOf(chosen.t);
      incomeMarker = chosen.t.startsWith('+');
      consumed.add(chosen.i);
      // "rm 12.5" / "12.5 ringgit": drop a currency word glued to the amount by a space.
      for (const j of [chosen.i - 1, chosen.i + 1]) {
        if (CURRENCY_WORDS.has(raw[j]?.toLowerCase() ?? '')) consumed.add(j);
      }
    }
    raw.forEach((t, i) => CURRENCY_WORDS.has(t.toLowerCase()) && amount !== null && consumed.add(i));

    const words = raw.filter((_, i) => !consumed.has(i));
    const lowerNote = words.join(' ').toLowerCase();
    const kind: 'expense' | 'income' = incomeMarker || words.some((w) => INCOME_WORDS.has(w.toLowerCase())) || INCOME_PHRASES.some((p) => lowerNote.includes(p)) ? 'income' : 'expense';
    const note = words.join(' ').replace(/^./, (c) => c.toUpperCase());

    let categoryId: string | null = null;
    let categorySource: ParsedEntry['categorySource'] = null;
    if (note) {
      categoryId = fromHistory(history, kind, note, ctx.categories);
      if (categoryId) categorySource = 'history';
      else {
        categoryId = suggestCategory(note, kind, ctx.categories);
        if (categoryId) categorySource = 'rule';
      }
    }

    const accountId = (account as Account | null)?.id ?? ctx.defaultAccountId;
    return { amount, kind, note, categoryId, categorySource, accountId, accountExplicit: !!account, date, dateExplicit };
  };
}
