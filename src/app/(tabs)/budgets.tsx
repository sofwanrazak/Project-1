import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ProgressRing } from '../../components/charts';
import { GoalsView } from '../../components/goals';
import { Icon } from '../../components/Icon';
import { Money, useMoney } from '../../components/Money';
import { Text } from '../../components/Text';
import { Button, Card, CategoryBadge, EmptyState, IconButton, PressableScale, Screen, Segmented, useTabInset } from '../../components/ui';
import { addMonths, daysInMonth, monthEnd, monthKey, monthLabel, monthStart, todayStr } from '../../lib/dates.ts';
import { budgetUsage, inRange, totals } from '../../lib/stats.ts';
import { useStore } from '../../store/useStore';
import { radius, space, tint, useTheme } from '../../theme';

const anim = (i: number) => FadeInDown.delay(60 * i).springify().damping(18);

function statusColor(ratio: number, c: ReturnType<typeof useTheme>['colors']) {
  return ratio > 1 ? c.expense : ratio > 0.8 ? c.warn : c.income;
}

export default function Budgets() {
  const { colors } = useTheme();
  const fmt = useMoney();
  const inset = useTabInset();
  const { transactions, categories, budgets, goals } = useStore();
  const [view, setView] = useState<'budgets' | 'goals'>('budgets');
  const today = todayStr();
  const [month, setMonth] = useState(monthKey(today));
  const isCurrent = month === monthKey(today);

  const d = useMemo(() => {
    const txs = inRange(transactions, monthStart(month), monthEnd(month));
    const usage = budgetUsage(budgets, txs);
    const overall = usage.find((u) => u.budget.categoryId === null);
    const cats = usage.filter((u) => u.budget.categoryId !== null).sort((a, b) => b.ratio - a.ratio);
    const budgeted = new Set(cats.map((u) => u.budget.categoryId));
    const unbudgeted = txs.filter((t) => t.kind === 'expense' && !budgeted.has(t.categoryId)).reduce((s, t) => s + t.amount, 0);
    const daysLeft = isCurrent ? daysInMonth(month) - Number(today.slice(8)) + 1 : 0;
    return { overall, cats, unbudgeted, spent: totals(txs).expense, daysLeft };
  }, [transactions, budgets, month, isCurrent, today]);

  const sumOfCats = d.cats.reduce((s, u) => s + u.budget.amount, 0);
  const o = d.overall;

  return (
    <Screen bottomInset={inset} contentStyle={{ paddingTop: space.md }}>
      <Animated.View entering={anim(0)} style={{ gap: 14 }}>
        <Text variant="display">Plan</Text>
        <Segmented value={view} onChange={setView} options={[{ value: 'budgets', label: 'Budgets' }, { value: 'goals', label: 'Goals' }]} />
        {view === 'budgets' && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton icon="left" label="Previous month" size={36} onPress={() => setMonth(addMonths(month, -1))} />
          <Text variant="bodyStrong">{monthLabel(month)}</Text>
          <View style={{ opacity: isCurrent ? 0.35 : 1 }}>
            <IconButton icon="right" label="Next month" size={36} onPress={() => !isCurrent && setMonth(addMonths(month, 1))} />
          </View>
        </View>}
      </Animated.View>

      {view === 'goals' ? (
        <GoalsView goals={goals} />
      ) : (
        <>

      <Animated.View entering={anim(1)}>
        {o ? (
          <PressableScale onPress={() => router.push({ pathname: '/budget-edit', params: { overall: '1' } })} accessibilityRole="button" accessibilityLabel="Edit monthly budget">
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
              <ProgressRing ratio={o.ratio} size={104} stroke={11} color={statusColor(o.ratio, colors)}>
                <Text variant="h2" tabular>
                  {Math.round(o.ratio * 100)}%
                </Text>
              </ProgressRing>
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="overline" color="textFaint">
                  Monthly budget
                </Text>
                <Money minor={o.budget.amount} variant="title" />
                <Text variant="caption" color="textDim">
                  {fmt(o.spent)} spent
                </Text>
                <Text variant="bodyStrong" style={{ color: statusColor(o.ratio, colors) }}>
                  {o.budget.amount - o.spent >= 0 ? `${fmt(o.budget.amount - o.spent)} left` : `${fmt(o.spent - o.budget.amount)} over`}
                </Text>
                {d.daysLeft > 0 && o.budget.amount - o.spent > 0 && (
                  <Text variant="caption" color="textFaint">
                    ≈ {fmt(Math.floor((o.budget.amount - o.spent) / d.daysLeft))}/day for {d.daysLeft} days
                  </Text>
                )}
              </View>
            </Card>
          </PressableScale>
        ) : (
          <Card>
            <EmptyState
              icon="🎯"
              title="Set a monthly budget"
              body={`You've spent ${fmt(d.spent)} ${isCurrent ? 'so far this month' : 'this month'}. A budget turns that into a daily allowance.`}
              action={<Button title="Set monthly budget" icon="plus" onPress={() => router.push({ pathname: '/budget-edit', params: { overall: '1' } })} />}
            />
          </Card>
        )}
      </Animated.View>

      {o && sumOfCats > o.budget.amount && (
        <Animated.View entering={anim(2)} style={[styles.warn, { backgroundColor: tint(colors.warn, 0.14) }]}>
          <Icon name="alert" size={18} color={colors.warn} />
          <Text variant="caption" style={{ flex: 1, color: colors.text }}>
            Your category budgets add up to {fmt(sumOfCats)}, more than the {fmt(o.budget.amount)} monthly budget.
          </Text>
        </Animated.View>
      )}

      <Animated.View entering={anim(3)} style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="h2">By category</Text>
          <Button title="Add" icon="plus" size="sm" variant="secondary" onPress={() => router.push('/budget-edit')} />
        </View>
        {d.cats.length === 0 ? (
          <Card>
            <Text variant="body" color="textDim" style={{ textAlign: 'center' }}>
              Cap categories that leak money, like Food & Drink or Shopping, and get warned before you overspend.
            </Text>
          </Card>
        ) : (
          d.cats.map((u) => {
            const cat = categories.find((c) => c.id === u.budget.categoryId);
            const color = statusColor(u.ratio, colors);
            const diff = u.budget.amount - u.spent;
            return (
              <PressableScale key={u.budget.id} onPress={() => router.push({ pathname: '/budget-edit', params: { category: u.budget.categoryId ?? '' } })} accessibilityRole="button" accessibilityLabel={`${cat?.name} budget, ${Math.round(u.ratio * 100)} percent used`}>
                <Card style={{ gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <CategoryBadge icon={cat?.icon ?? '❓'} color={cat?.color ?? colors.textFaint} />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {cat?.name}
                      </Text>
                      <Text variant="caption" color="textDim">
                        {fmt(u.spent)} of {fmt(u.budget.amount)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text variant="bodyStrong" tabular style={{ color }}>
                        {Math.round(u.ratio * 100)}%
                      </Text>
                      <Text variant="caption" color="textFaint">
                        {diff >= 0 ? `${fmt(diff)} left` : `${fmt(-diff)} over`}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.track, { backgroundColor: colors.cardAlt }]}>
                    <View style={{ width: `${Math.min(u.ratio, 1) * 100}%`, height: 8, borderRadius: 4, backgroundColor: color }} />
                  </View>
                </Card>
              </PressableScale>
            );
          })
        )}
        {d.cats.length > 0 && d.unbudgeted > 0 && (
          <Text variant="caption" color="textFaint" style={{ textAlign: 'center' }}>
            {fmt(d.unbudgeted)} spent in categories without a budget
          </Text>
        )}
      </Animated.View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  warn: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
});
