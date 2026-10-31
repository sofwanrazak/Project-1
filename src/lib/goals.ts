import type { Goal } from './types.ts';

export const GOAL_STEPS = [25, 50, 75, 100] as const;

export const goalPct = (g: Pick<Goal, 'saved' | 'target'>) => (g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0);

/** The highest step newly crossed when `saved` moves from `before` to `after`, or null. */
export function crossedStep(before: number, after: number, target: number): number | null {
  if (target <= 0 || after <= before) return null;
  const pct = (v: number) => (v / target) * 100;
  const hits = GOAL_STEPS.filter((s) => pct(before) < s && pct(after) >= s);
  return hits.length ? hits[hits.length - 1] : null;
}
