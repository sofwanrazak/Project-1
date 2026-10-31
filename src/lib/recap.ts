import { addDays, daysBetween, weekStart, weekdayName } from './dates.ts';
import type { Category, Transaction } from './types.ts';

export interface Persona {
  icon: string;
  title: string;
  line: string;
}

export interface WeekRecap {
  from: string;
  to: string;
  /** True while the week is still running (fewer than 7 days elapsed). */
  partial: boolean;
  total: number;
  prevTotal: number;
  /** Percent change vs the week before; null when there was no spending then. */
  delta: number | null;
  count: number;
  noSpendDays: number;
  topCategory: { id: string | null; total: number; pct: number } | null;
  biggestDay: { date: string; total: number } | null;
  topSpot: { name: string; n: number; total: number } | null;
  persona: Persona;
}

const sum = (ts: Transaction[]) => ts.reduce((s, t) => s + t.amount, 0);

function persona(r: Omit<WeekRecap, 'persona'>, categories: Category[]): Persona {
  if (r.count === 0) return { icon: '👻', title: 'The Ghost', line: 'Nothing logged this week. Add a few spends and the story gets interesting.' };
  if (r.noSpendDays >= 3) return { icon: '🥷', title: 'Frugal Ninja', line: `${r.noSpendDays} days without spending. Silent and efficient.` };
  if (r.delta !== null && r.delta <= -20) return { icon: '🌱', title: 'Saver Mode', line: `Spending fell ${Math.abs(Math.round(r.delta))}% from last week.` };
  const name = categories.find((c) => c.id === r.topCategory?.id)?.name ?? '';
  if (r.topCategory && r.topCategory.pct >= 40) {
    if (/food|drink/i.test(name)) return { icon: '🍜', title: 'The Foodie', line: `${Math.round(r.topCategory.pct)}% of your week went on food and drink.` };
    if (/transport/i.test(name)) return { icon: '🚗', title: 'Always Moving', line: 'Most of your money went on getting around.' };
    if (/shopping/i.test(name)) return { icon: '🛍️', title: 'Treat Yourself', line: 'Shopping led the week. Worth it, hopefully.' };
    if (/bill|utilit|home/i.test(name)) return { icon: '🏠', title: 'Responsible Adult', line: 'Bills and home took the biggest bite.' };
    if (/entertain/i.test(name)) return { icon: '🎬', title: 'Weekend Warrior', line: 'Entertainment topped the list this week.' };
  }
  if (r.delta !== null && r.delta >= 30) return { icon: '🔥', title: 'Big Week', line: `Spending rose ${Math.round(r.delta)}% from last week.` };
  return { icon: '⚖️', title: 'Steady Spender', line: 'A balanced week with no big swings.' };
}

/** `start` must be a Monday (use weekStart()). `today` caps the week if it is still running. */
export function weekRecap(txs: Transaction[], categories: Category[], start: string, today: string): WeekRecap {
  const end = addDays(start, 6);
  const to = end > today ? today : end;
  const exp = txs.filter((t) => t.kind === 'expense' && t.date >= start && t.date <= to);
  const prev = txs.filter((t) => t.kind === 'expense' && t.date >= addDays(start, -7) && t.date <= addDays(start, -1));
  const total = sum(exp);
  const prevTotal = sum(prev);

  const byCat = new Map<string | null, number>();
  const byDay = new Map<string, number>();
  const spots = new Map<string, { name: string; n: number; total: number }>();
  for (const t of exp) {
    byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amount);
    byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.amount);
    const k = t.note.trim().toLowerCase();
    if (k) {
      const s = spots.get(k) ?? { name: t.note.trim(), n: 0, total: 0 };
      s.n++;
      s.total += t.amount;
      spots.set(k, s);
    }
  }
  const topCat = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
  const topDay = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
  const topSpot = [...spots.values()].sort((a, b) => b.total - a.total)[0];
  const days = daysBetween(start, to) + 1;
  const base = {
    from: start,
    to,
    partial: end > today,
    total,
    prevTotal,
    delta: prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null,
    count: exp.length,
    noSpendDays: Math.max(days - byDay.size, 0),
    topCategory: topCat ? { id: topCat[0], total: topCat[1], pct: total > 0 ? (topCat[1] / total) * 100 : 0 } : null,
    biggestDay: topDay ? { date: topDay[0], total: topDay[1] } : null,
    topSpot: topSpot && topSpot.n >= 2 ? topSpot : null,
  };
  return { ...base, persona: persona(base, categories) };
}

/** Monday of the most recent fully finished week. */
export const lastFullWeek = (today: string) => addDays(weekStart(today), -7);

export { weekdayName };
