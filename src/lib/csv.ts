import { isValidDate } from './dates.ts';

/** RFC 4180-ish parser: quotes, escaped quotes, CRLF, embedded newlines. Delimiter auto-detected. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t'].reduce((best, d) => (count(firstLine, d) > count(firstLine, best) ? d : best), ',');

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

function count(s: string, ch: string) {
  return s.split(ch).length - 1;
}

/** Quote a cell and neutralise spreadsheet formula injection (=, +, -, @ prefixes). */
export function csvCell(value: string | number): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Undo the injection guard so our own exports re-import cleanly. */
export function unguardCell(s: string) {
  return /^'[=+\-@]/.test(s) ? s.slice(1) : s;
}

export type DateFormat = 'DMY' | 'MDY' | 'YMD';

/** Guess the date order from sample values; DMY is the Malaysian default when ambiguous. */
export function detectDateFormat(samples: string[]): DateFormat {
  let dmy = 0;
  let mdy = 0;
  for (const s of samples) {
    const m = s.trim().match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})/);
    if (!m) continue;
    if (m[1].length === 4) return 'YMD';
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12) dmy++;
    else if (b > 12) mdy++;
  }
  return mdy > dmy ? 'MDY' : 'DMY';
}

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Returns YYYY-MM-DD or null. Handles 12/03/2025, 2025-03-12, 12 Mar 2025, 12-Mar-25. */
export function parseDate(raw: string, fmt: DateFormat): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let match = s.match(/^(\d{1,2})[\s\-/]([A-Za-z]{3})[A-Za-z]*[\s\-/,]+(\d{2,4})/);
  if (match) {
    d = Number(match[1]);
    m = MONTH_NAMES.indexOf(match[2].toLowerCase()) + 1;
    y = fullYear(match[3]);
  } else {
    match = s.match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})/);
    if (!match) return null;
    const [a, b, c] = [match[1], match[2], match[3]];
    if (a.length === 4 || fmt === 'YMD') {
      y = Number(a);
      m = Number(b);
      d = Number(c);
    } else if (fmt === 'MDY') {
      m = Number(a);
      d = Number(b);
      y = fullYear(c);
    } else {
      d = Number(a);
      m = Number(b);
      y = fullYear(c);
    }
  }
  if (!m || !isValidDate(y, m, d)) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function fullYear(s: string) {
  const n = Number(s);
  return s.length <= 2 ? 2000 + n : n;
}

/**
 * Parse a bank-style amount into signed minor units.
 * "RM 1,234.50" -> 123450, "(12.00)" -> -1200, "12.00 DR" -> -1200, "12.00 CR" -> 1200.
 */
export function parseAmount(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/\bDR\b/i.test(s)) negative = true;
  s = s.replace(/\b(DR|CR)\b/gi, '').replace(/[^\d.,-]/g, '');
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  }
  s = s.replace(/-/g, '').replace(/,/g, '');
  if (!/^\d*\.?\d{0,2}$/.test(s) || s === '' || s === '.') return null;
  const [w, f = ''] = s.split('.');
  const minor = Number(w || '0') * 100 + Number(f.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor)) return null;
  return negative ? -minor : minor;
}

export interface ColumnGuess {
  date: number;
  description: number;
  amount: number; // single signed column, or -1
  debit: number; // separate columns, or -1
  credit: number;
}

export function guessColumns(header: string[]): ColumnGuess {
  const find = (re: RegExp) => header.findIndex((h) => re.test(h.trim()));
  const debit = find(/^(debit|withdrawal|money out|paid out|dr)\b/i);
  const credit = find(/^(credit|deposit|money in|paid in|cr)\b/i);
  let amount = find(/^(amount|amt|transaction amount|value)\b/i);
  if (debit >= 0 && credit >= 0) amount = -1;
  return {
    date: find(/date/i),
    description: find(/(description|details|narrative|merchant|payee|particulars|reference|memo|note)/i),
    amount,
    debit: amount >= 0 ? -1 : debit,
    credit: amount >= 0 ? -1 : credit,
  };
}

/** Stable, non-cryptographic fingerprint used only to skip duplicate imports. */
export function rowFingerprint(accountId: string, date: string, signedAmount: number, description: string) {
  const s = `${accountId}|${date}|${signedAmount}|${description.trim().toLowerCase().replace(/\s+/g, ' ')}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x1b873593;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}${s.length.toString(36)}`;
}
