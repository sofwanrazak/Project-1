import { useCallback } from 'react';

import { useMoney } from '../components/Money';
import { useToast } from '../components/Toast';
import { allowanceLine, dailyAllowance } from '../lib/allowance.ts';
import { todayStr } from '../lib/dates.ts';
import { detectRecurring, reservedForMonth } from '../lib/recurring.ts';
import { streakInfo } from '../lib/streak.ts';
import type { Transaction } from '../lib/types.ts';
import { useStore } from '../store/useStore';

/**
 * The reward right after logging: what is left today, plus the streak when a new day was just added.
 * Specific and immediate beats a generic "Saved". Undo stays one tap away.
 */
export function useLogFeedback() {
  const toast = useToast();
  const fmt = useMoney();
  return useCallback(
    (t: Transaction) => {
      const s = useStore.getState();
      const today = todayStr();
      const a = dailyAllowance({ budgets: s.budgets, transactions: s.transactions, today, reserved: reservedForMonth(detectRecurring(s.transactions, today), today) });
      const streak = streakInfo(s.transactions, s.settings.noSpendDays, today).current;
      const extra = t.date === today && streak >= 2 ? ` · day ${streak} on the tally` : '';
      toast({ message: allowanceLine(a, fmt) + extra, actionLabel: 'Undo', onAction: () => void useStore.getState().deleteTransaction(t.id) });
    },
    [toast, fmt],
  );
}
