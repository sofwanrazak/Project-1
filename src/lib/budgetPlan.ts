import type { MoneyGoal } from './types.ts';

/** Share of income to plan to spend, by what the person says they want. */
const SPEND_SHARE: Record<MoneyGoal, number> = { save: 0.7, track: 0.85, debt: 0.6, budget: 0.8 };

/** How a monthly budget splits across the default expense categories. Sums to 90%; the rest is slack. */
const SPLIT: [string, number][] = [
  ['Food & Drink', 0.22],
  ['Groceries', 0.14],
  ['Transport', 0.12],
  ['Bills & Utilities', 0.2],
  ['Shopping', 0.08],
  ['Entertainment', 0.06],
  ['Health', 0.04],
  ['Subscriptions', 0.04],
];

const roundTo = (minor: number, stepMinor: number) => Math.round(minor / stepMinor) * stepMinor;

export interface BudgetSuggestion {
  overall: number;
  categories: { name: string; amount: number }[];
}

/** Income is in minor units. Amounts round to the nearest RM10 so the numbers look chosen, not computed. */
export function suggestBudget(income: number, goal: MoneyGoal): BudgetSuggestion {
  const overall = Math.max(roundTo(income * SPEND_SHARE[goal], 1000), 0);
  return {
    overall,
    categories: SPLIT.map(([name, share]) => ({ name, amount: roundTo(overall * share, 500) })).filter((c) => c.amount > 0),
  };
}
