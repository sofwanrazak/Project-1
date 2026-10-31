import { addDays } from './dates.ts';
import type { Transaction } from './types.ts';

export const MILESTONES = [3, 7, 14, 30, 60, 100, 200, 365] as const;

export type DayState = 'logged' | 'nospend' | 'today' | 'missed';

export interface StreakInfo {
  current: number;
  best: number;
  todayDone: boolean;
  /** Last 7 days, oldest first, ending today. */
  week: { date: string; state: DayState }[];
}

/**
 * Days that count: at least one hand-entered transaction, or a confirmed no-spend day.
 * Imported statements and demo data are excluded, otherwise one CSV would hand out a 60-day streak.
 */
export function activeDays(txs: Transaction[], noSpend: string[]) {
  const logged = new Set<string>();
  for (const t of txs) if (!t.importHash) logged.add(t.date);
  return { logged, nospend: new Set(noSpend) };
}

export function streakInfo(txs: Transaction[], noSpend: string[], today: string): StreakInfo {
  const { logged, nospend } = activeDays(txs, noSpend);
  const has = (d: string) => logged.has(d) || nospend.has(d);
  const todayDone = has(today);

  // Today not being done yet must not break a streak: it is still possible to log it.
  let current = 0;
  for (let d = todayDone ? today : addDays(today, -1); has(d); d = addDays(d, -1)) current++;

  const all = [...new Set([...logged, ...nospend])].sort();
  let best = 0;
  let run = 0;
  let prev = '';
  for (const d of all) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }

  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    const state: DayState = logged.has(date) ? 'logged' : nospend.has(date) ? 'nospend' : date === today ? 'today' : 'missed';
    return { date, state };
  });
  return { current, best: Math.max(best, current), todayDone, week };
}

/** The highest milestone reached by `current` that has not been celebrated yet, or null. */
export function newMilestone(current: number, seen: number[]): number | null {
  const hit = [...MILESTONES].filter((m) => current >= m && !seen.includes(m));
  return hit.length ? Math.max(...hit) : null;
}

export function nextMilestone(current: number): number {
  return MILESTONES.find((m) => m > current) ?? current + 100;
}

/** Split a streak into tally groups: four strokes and a slash make five. */
export function tallyGroups(n: number): { strokes: number; slashed: boolean }[] {
  const groups: { strokes: number; slashed: boolean }[] = [];
  for (let left = n; left > 0; left -= 5) {
    groups.push(left >= 5 ? { strokes: 4, slashed: true } : { strokes: left, slashed: false });
  }
  return groups;
}
