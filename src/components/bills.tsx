import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useToday } from '../hooks/useToday';
import { billFromDetected, monthlyEquivalent, nextDue, unmanaged } from '../lib/bills.ts';
import { daysBetween, shortDate, weekdayName } from '../lib/dates.ts';
import { detectRecurring } from '../lib/recurring.ts';
import type { Bill, Cadence } from '../lib/types.ts';
import { newId, useStore } from '../store/useStore';
import { radius, useTheme } from '../theme';
import { Money, useMoney } from './Money';
import { Text } from './Text';
import { useToast } from './Toast';
import { Button, Card, CategoryBadge, EmptyState, haptic, PressableScale } from './ui';

/** Wall clock behind a module function so render stays pure. */
const nowMs = () => Date.now();

export const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

/** "3d overdue", "Today", "Tomorrow", "Friday", "12 Nov". */
export function dueLabel(today: string, due: string): string {
  const n = daysBetween(today, due);
  return n < 0 ? `${-n}d overdue` : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n < 7 ? weekdayName(due) : shortDate(due);
}

/** Pay or skip a bill's next due date, with an Undo toast that puts everything back. */
export function useBillActions() {
  const toast = useToast();
  const fmt = useMoney();
  return useMemo(
    () => ({
      async pay(bill: Bill) {
        const prev = bill.paidThrough;
        try {
          const t = await useStore.getState().payBill(bill.id);
          haptic.success();
          toast({
            message: `${bill.name} paid, ${fmt(bill.amount)}`,
            actionLabel: 'Undo',
            onAction: () => {
              void (async () => {
                await useStore.getState().deleteTransactions([t.id]);
                await useStore.getState().setBillPaidThrough(bill.id, prev);
              })();
            },
          });
        } catch (e) {
          toast({
            message: e instanceof Error ? e.message : 'Could not pay that bill.',
            tone: 'error',
          });
        }
      },
      async skip(bill: Bill) {
        const prev = bill.paidThrough;
        try {
          await useStore.getState().skipBill(bill.id);
          haptic.select();
          toast({
            message: `Skipped ${bill.name} this time`,
            actionLabel: 'Undo',
            onAction: () => void useStore.getState().setBillPaidThrough(bill.id, prev),
          });
        } catch (e) {
          toast({
            message: e instanceof Error ? e.message : 'Could not skip that bill.',
            tone: 'error',
          });
        }
      },
    }),
    [toast, fmt],
  );
}

/** Pay / Skip pills for a due bill. */
export function BillButtons({ bill }: { bill: Bill }) {
  const { colors } = useTheme();
  const act = useBillActions();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <PressableScale
        onPress={() => void act.pay(bill)}
        feedback="select"
        accessibilityRole="button"
        accessibilityLabel={`Mark ${bill.name} paid`}
        style={[styles.pill, { backgroundColor: colors.primary }]}
      >
        <Text variant="label" style={{ color: '#fff' }}>
          Mark paid
        </Text>
      </PressableScale>
      <PressableScale
        onPress={() => void act.skip(bill)}
        feedback="select"
        accessibilityRole="button"
        accessibilityLabel={`Skip ${bill.name} this time`}
        style={[styles.pill, { backgroundColor: colors.cardAlt }]}
      >
        <Text variant="label" color="textDim">
          Skip
        </Text>
      </PressableScale>
    </View>
  );
}

export function BillsView() {
  const { colors } = useTheme();
  const fmt = useMoney();
  const toast = useToast();
  const today = useToday();
  const { bills, categories, accounts, transactions } = useStore();

  const rows = useMemo(
    () =>
      bills
        .filter((b) => !b.archived)
        .map((bill) => {
          const due = nextDue(bill);
          return { bill, due, inDays: daysBetween(today, due) };
        })
        .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.bill.name.localeCompare(b.bill.name))),
    [bills, today],
  );
  const monthly = rows.reduce((s, r) => s + monthlyEquivalent(r.bill), 0);
  const soon = rows.filter((r) => r.inDays <= 7);
  const soonTotal = soon.reduce((s, r) => s + r.bill.amount, 0);
  const suggestions = useMemo(() => unmanaged(detectRecurring(transactions, today), bills), [transactions, today, bills]);
  const activeAccounts = accounts.filter((a) => !a.archived);

  const accountFor = (categoryId: string | null) => {
    const hit = transactions.find((t) => t.categoryId === categoryId && activeAccounts.some((a) => a.id === t.accountId));
    return hit?.accountId ?? activeAccounts[0]?.id ?? null;
  };

  const addDetected = async (key: string) => {
    const d = suggestions.find((s) => s.key === key);
    const accountId = d ? accountFor(d.categoryId) : null;
    const bill = d && accountId ? billFromDetected(d, accountId, newId, nowMs()) : null;
    if (!d || !bill) {
      if (d)
        router.push({
          pathname: '/bill-edit',
          params: {
            name: d.name,
            amount: String(d.amount),
            category: d.categoryId ?? '',
            date: d.nextDate,
          },
        });
      return;
    }
    try {
      const saved = await useStore.getState().saveBill({
        name: bill.name,
        amount: bill.amount,
        categoryId: bill.categoryId,
        accountId: bill.accountId,
        cadence: bill.cadence,
        startDate: bill.startDate,
        autoPost: false,
      });
      haptic.success();
      toast({
        message: `Tracking ${saved.name} as a monthly bill`,
        actionLabel: 'Undo',
        onAction: () => void useStore.getState().removeBill(saved.id),
      });
    } catch (e) {
      toast({
        message: e instanceof Error ? e.message : 'Could not add that bill.',
        tone: 'error',
      });
    }
  };

  const suggestionBlock =
    suggestions.length > 0 ? (
      <View style={{ gap: 10, marginTop: 4 }}>
        <View>
          <Text variant="h2">Looks like a bill</Text>
          <Text variant="caption" color="textDim">
            Found in your history. One tap to track them.
          </Text>
        </View>
        {suggestions.map((d) => {
          const cat = categories.find((c) => c.id === d.categoryId);
          return (
            <Card key={d.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <CategoryBadge icon={cat?.icon ?? '🧾'} color={cat?.color ?? colors.textFaint} size={40} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {d.name}
                </Text>
                <Text variant="caption" color="textDim">
                  {fmt(d.amount)} · next {shortDate(d.nextDate)}
                </Text>
              </View>
              <Button title="Track" size="sm" variant="secondary" onPress={() => void addDetected(d.key)} />
            </Card>
          );
        })}
      </View>
    ) : null;

  return (
    <View style={{ gap: 14 }}>
      {rows.length === 0 && suggestionBlock}
      {rows.length > 0 && (
        <Card style={{ gap: 4 }}>
          <Text variant="overline" color="textFaint">
            Fixed costs
          </Text>
          <Money minor={monthly} variant="display" />
          <Text variant="caption" color="textDim">
            a month across {rows.length} {rows.length === 1 ? 'bill' : 'bills'}
            {soon.length > 0 ? `. ${fmt(soonTotal)} due within a week.` : '.'}
          </Text>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="🧾"
            title="Track what you owe"
            body="Rent, phone, Netflix, insurance. Add them once and Tally reminds you, subtracts them from your daily allowance and can log them for you."
            action={<Button title="Add a bill" icon="plus" onPress={() => router.push('/bill-edit')} />}
          />
        </Card>
      ) : (
        rows.map(({ bill, due, inDays }) => {
          const cat = categories.find((c) => c.id === bill.categoryId);
          const acct = accounts.find((a) => a.id === bill.accountId);
          const hot = inDays <= 7;
          return (
            <Card key={bill.id} style={{ gap: hot ? 12 : 0 }}>
              <PressableScale
                onPress={() =>
                  router.push({
                    pathname: '/bill-edit',
                    params: { id: bill.id },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`${bill.name}, ${fmt(bill.amount)}, due ${dueLabel(today, due)}. Tap to edit`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
              >
                <CategoryBadge icon={cat?.icon ?? '🧾'} color={cat?.color ?? colors.textFaint} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {bill.name}
                  </Text>
                  <Text
                    variant="caption"
                    style={{
                      color: inDays < 0 ? colors.expense : inDays <= 1 ? colors.warn : colors.textDim,
                    }}
                    numberOfLines={1}
                  >
                    {dueLabel(today, due)} · {CADENCE_LABEL[bill.cadence]}
                    {acct ? ` · ${acct.name}` : ''}
                    {bill.autoPost ? ' · auto' : ''}
                  </Text>
                </View>
                <Money minor={bill.amount} variant="amount" />
              </PressableScale>
              {hot && <BillButtons bill={bill} />}
            </Card>
          );
        })
      )}

      {rows.length > 0 && <Button title="Add a bill" icon="plus" variant="secondary" onPress={() => router.push('/bill-edit')} />}

      {rows.length > 0 && suggestionBlock}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
