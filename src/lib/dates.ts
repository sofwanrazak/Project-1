const pad = (n: number) => String(n).padStart(2, '0');

/** Local-time YYYY-MM-DD. Never use toISOString() for this: it shifts to UTC. */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayStr = () => toDateStr(new Date());

export function addDays(s: string, days: number): string {
  const d = fromDateStr(s);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export const monthKey = (s: string) => s.slice(0, 7); // YYYY-MM

export function monthStart(key: string) {
  return `${key}-01`;
}

export function monthEnd(key: string) {
  const [y, m] = key.split('-').map(Number);
  return toDateStr(new Date(y, m, 0));
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function daysInMonth(key: string) {
  return Number(monthEnd(key).slice(8));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const monthShort = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1];

export function monthLabel(key: string, withYear = true) {
  const name = MONTHS_LONG[Number(key.slice(5, 7)) - 1];
  return withYear ? `${name} ${key.slice(0, 4)}` : name;
}

export function dayLabel(s: string, today = todayStr()): string {
  if (s === today) return 'Today';
  if (s === addDays(today, -1)) return 'Yesterday';
  const d = fromDateStr(s);
  const yearPart = s.slice(0, 4) === today.slice(0, 4) ? '' : ` ${d.getFullYear()}`;
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}${yearPart}`;
}

export function shortDate(s: string) {
  const d = fromDateStr(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Validate a real calendar date (rejects 2025-02-31). */
export function isValidDate(y: number, m: number, d: number) {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
