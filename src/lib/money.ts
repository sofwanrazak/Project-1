/** Parse user input like "12", "12.5", "1,234.50" into integer minor units. Returns null if invalid. */
export function parseMinor(input: string): number | null {
  const s = input.trim().replace(/,/g, '');
  if (!/^\d*\.?\d{0,2}$/.test(s) || s === '' || s === '.') return null;
  const [whole, frac = ''] = s.split('.');
  const minor = Number(whole || '0') * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? minor : null;
}

const numCache = new Map<number, Intl.NumberFormat>();
const symCache = new Map<string, string>();

function numberFormat(digits: number) {
  let f = numCache.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('en', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    numCache.set(digits, f);
  }
  return f;
}

export function currencySymbol(currency: string) {
  let sym = symCache.get(currency);
  if (sym === undefined) {
    try {
      const parts = new Intl.NumberFormat('en-MY', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0);
      sym = parts.find((p) => p.type === 'currency')?.value ?? currency;
    } catch {
      sym = currency;
    }
    symCache.set(currency, sym);
  }
  return sym;
}

interface FormatOptions {
  /** 12,345 -> 12.3k (from RM1,000 up) and drop ".00" on whole amounts. For tight spaces (chips, chart labels). */
  compact?: boolean;
  /** Prefix "+" on positive values. */
  sign?: boolean;
}

/**
 * Assembled by hand instead of Intl's currency style so the output ("RM1,234.50") is identical on
 * Hermes, V8 and every OS, regardless of how each engine spaces the symbol.
 */
export function formatMoney(minor: number, currency: string, opts: FormatOptions = {}) {
  const sym = currencySymbol(currency);
  const neg = minor < 0;
  const abs = Math.abs(minor);
  let body: string;
  if (opts.compact && abs >= 100_000) {
    const k = abs / 100_000;
    body = `${(k >= 100 ? Math.round(k) : Math.round(k * 10) / 10).toString()}k`;
  } else {
    body = numberFormat(opts.compact && abs % 100 === 0 ? 0 : 2).format(abs / 100);
  }
  return `${neg ? '-' : opts.sign && minor > 0 ? '+' : ''}${sym}${body}`;
}

/** Apply one keypad press to an amount string. Keeps at most 2 decimals and 9 integer digits. */
export function pressKey(cur: string, key: string): string {
  if (key === '⌫') return cur.slice(0, -1);
  if (key === '.') return cur.includes('.') ? cur : cur === '' ? '0.' : `${cur}.`;
  const [whole, frac] = cur.split('.');
  if (frac !== undefined) return frac.length >= 2 ? cur : cur + key;
  if (whole === '0') return key === '0' ? cur : key;
  return whole.length >= 9 ? cur : cur + key;
}

export const MASK = '••••';
