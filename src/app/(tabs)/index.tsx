import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AutoSparkline, ProgressRing } from '../../components/charts';
import { Icon } from '../../components/Icon';
import { Money, useMoney } from '../../components/Money';
import { Text } from '../../components/Text';
import { TxRow } from '../../components/TxRow';
import { Card, EmptyState, IconButton, PressableScale, Screen, SectionTitle, Button, useCountUp, useTabInset } from '../../components/ui';
import { accountIcon } from '../../lib/defaults.ts';
import { addDays, daysInMonth, greeting, monthEnd, monthKey, monthStart, todayStr } from '../../lib/dates.ts';
import { accountBalances, budgetUsage, dailyExpense, inRange, totals } from '../../lib/stats.ts';
import { useStore } from '../../store/useStore';
import { radius, space, tint, useTheme } from '../../theme';
import { useToast } from '../../components/Toast';

const anim = (i: number) => FadeInDown.delay(60 * i).springify().damping(18);

export default function Home() {
  const { colors } = useTheme();
  const fmt = useMoney();
  const toast = useToast();
  const inset = useTabInset();
  const { accounts, categories, transactions, budgets, settings } = useStore();
  const [now] = useState(todayStr);

  const data = useMemo(() => {
    const mk = monthKey(now);
    const month = inRange(transactions, monthStart(mk), monthEnd(mk));
    const t = totals(month);
    const overall = budgets.find((b) => b.categoryId === null);
    const daysLeft = daysInMonth(mk) - Number(now.slice(8)) + 1;
    const week = dailyExpense(inRange(transactions, addDays(now, -6), now), addDays(now, -6), now, (d) => addDays(d, 1));
    const usage = budgetUsage(budgets.filter((b) => b.categoryId !== null), month).sort((a, b) => b.ratio - a.ratio);
    const active = accounts.filter((a) => !a.archived);
    const bal = accountBalances(accounts, transactions);
    const net = active.reduce((s, a) => s + (bal.get(a.id) ?? 0), 0);
    return { t, overall, daysLeft, week, usage, active, bal, net };
  }, [transactions, budgets, accounts, now]);

  const left = data.overall ? data.overall.amount - data.t.expense : null;
  const heroValue = useCountUp(left ?? data.t.expense);
  const ratio = data.overall ? data.t.expense / data.overall.amount : 0;
  const perDay = left !== null && left > 0 ? Math.floor(left / data.daysLeft) : null;
  const weekTotal = data.week.reduce((s, d) => s + d.value, 0);
  const recent = transactions.slice(0, 6);

  return (
    <Screen bottomInset={inset} contentStyle={{ paddingTop: space.md }}>
      {/* header */}
      <Animated.View entering={anim(0)} style={styles.top}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
          <LinearGradient colors={['#7C5CFF', '#22D3EE']} style={styles.avatar}>
            <Text variant="h2" style={{ color: '#fff' }}>
              {(settings.name.trim()[0] ?? 'T').toUpperCase()}
            </Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="textDim">
              {greeting()}
            </Text>
            <Text variant="title" numberOfLines={1}>
              {settings.name.trim() || 'Welcome'}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <IconButton
            icon={settings.hideAmounts ? 'eyeOff' : 'eye'}
            label={settings.hideAmounts ? 'Show amounts' : 'Hide amounts'}
            onPress={() => void useStore.getState().updateSettings({ hideAmounts: !settings.hideAmounts })}
          />
          <IconButton icon="sliders" label="Settings" onPress={() => router.push('/settings')} />
        </View>
      </Animated.View>

      {/* hero */}
      <Animated.View entering={anim(1)}>
        <LinearGradient colors={['#6A47F5', '#2A5BD7', '#0E8FB8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroGlow} pointerEvents="none" />
          <Text variant="overline" style={{ color: 'rgba(255,255,255,0.75)' }}>
            {data.overall ? (left! >= 0 ? 'Left this month' : 'Over budget by') : 'Spent this month'}
          </Text>
          <Text variant="hero" tabular style={{ color: '#fff' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {fmt(data.overall ? Math.abs(heroValue) : heroValue)}
          </Text>
          {data.overall ? (
            <>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.min(ratio, 1) * 100}%`, backgroundColor: ratio > 1 ? '#FFB4C0' : ratio > 0.8 ? '#FFE08A' : '#fff' }]} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="caption" style={{ color: 'rgba(255,255,255,0.85)' }}>
                  {fmt(data.t.expense)} of {fmt(data.overall.amount)}
                </Text>
                <Text variant="caption" style={{ color: 'rgba(255,255,255,0.85)' }}>
                  {perDay !== null ? `${fmt(perDay)}/day · ${data.daysLeft}d left` : `${data.daysLeft}d left`}
                </Text>
              </View>
            </>
          ) : (
            <Pressable onPress={() => router.push({ pathname: '/budget-edit', params: { overall: '1' } })} accessibilityRole="button" style={styles.heroCta}>
              <Text variant="label" style={{ color: '#fff' }}>
                Set a monthly budget to see what’s left
              </Text>
              <Icon name="right" size={14} color="#fff" />
            </Pressable>
          )}
        </LinearGradient>
      </Animated.View>

      {/* stats */}
      <Animated.View entering={anim(2)} style={{ flexDirection: 'row', gap: 10 }}>
        <Stat label="Income" icon="arrowDown" color={colors.income} minor={data.t.income} />
        <Stat label="Spent" icon="arrowUp" color={colors.expense} minor={data.t.expense} />
        <Stat label="Net" icon="swap" color={data.t.net >= 0 ? colors.income : colors.expense} minor={data.t.net} sign />
      </Animated.View>

      {/* budgets */}
      {data.usage.length > 0 && (
        <Animated.View entering={anim(3)} style={{ gap: 12 }}>
          <SectionTitle title="Budgets" action="See all" onAction={() => router.push('/budgets')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} style={{ marginHorizontal: -space.lg }} contentInset={{ left: space.lg, right: space.lg }}>
            <View style={{ width: space.lg - 10 }} />
            {data.usage.slice(0, 6).map((u) => {
              const cat = categories.find((c) => c.id === u.budget.categoryId);
              const c = u.ratio > 1 ? colors.expense : u.ratio > 0.8 ? colors.warn : colors.income;
              return (
                <PressableScale key={u.budget.id} onPress={() => router.push({ pathname: '/budget-edit', params: { category: u.budget.categoryId ?? '' } })} style={[styles.budgetChip, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel={`${cat?.name} budget ${Math.round(u.ratio * 100)} percent used`}>
                  <ProgressRing ratio={u.ratio} size={56} stroke={6} color={c}>
                    <Text style={{ fontSize: 20 }}>{cat?.icon}</Text>
                  </ProgressRing>
                  <Text variant="label" numberOfLines={1} style={{ maxWidth: 84 }}>
                    {cat?.name}
                  </Text>
                  <Text variant="caption" tabular style={{ color: c }}>
                    {Math.round(u.ratio * 100)}%
                  </Text>
                </PressableScale>
              );
            })}
            <View style={{ width: space.lg - 10 }} />
          </ScrollView>
        </Animated.View>
      )}

      {/* last 7 days */}
      {transactions.length > 0 && (
        <Animated.View entering={anim(4)}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
              <View>
                <Text variant="overline" color="textFaint">
                  Last 7 days
                </Text>
                <Money minor={weekTotal} variant="title" />
              </View>
              <Text variant="caption" color="textDim">
                {fmt(Math.round(weekTotal / 7))}/day avg
              </Text>
            </View>
            <AutoSparkline values={data.week.map((d) => d.value)} height={64} color={colors.primary} />
          </Card>
        </Animated.View>
      )}

      {/* accounts */}
      <Animated.View entering={anim(5)} style={{ gap: 12 }}>
        <SectionTitle title="Accounts" action="Manage" onAction={() => router.push('/accounts')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} style={{ marginHorizontal: -space.lg }}>
          <View style={{ width: space.lg - 10 }} />
          <View style={[styles.account, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
            <Text variant="overline" color="textFaint">
              Net worth
            </Text>
            <Money minor={data.net} variant="h2" />
          </View>
          {data.active.map((a) => (
            <PressableScale key={a.id} onPress={() => router.push({ pathname: '/account-edit', params: { id: a.id } })} style={[styles.account, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel={`${a.name} account`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.accDot, { backgroundColor: tint(a.color, 0.2) }]}>
                  <Text style={{ fontSize: 13 }}>{accountIcon(a.type)}</Text>
                </View>
                <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>
                  {a.name}
                </Text>
              </View>
              <Money minor={data.bal.get(a.id) ?? 0} variant="h2" />
            </PressableScale>
          ))}
          <PressableScale onPress={() => router.push('/account-edit')} style={[styles.account, styles.addAccount, { borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel="Add account">
            <Icon name="plus" size={20} color={colors.textDim} />
            <Text variant="label" color="textDim">
              Add
            </Text>
          </PressableScale>
          <View style={{ width: space.lg - 10 }} />
        </ScrollView>
      </Animated.View>

      {/* recent */}
      <Animated.View entering={anim(6)} style={{ gap: 12 }}>
        <SectionTitle title="Recent" action={recent.length ? 'See all' : undefined} onAction={() => router.push('/activity')} />
        {recent.length === 0 ? (
          <Card>
            <EmptyState icon="🧾" title="No transactions yet" body="Add your first expense in under 5 seconds. Tap the + button, key in the amount, pick a category, done." action={<Button title="Add transaction" icon="plus" onPress={() => router.push('/add')} />} />
          </Card>
        ) : (
          <Card pad={false} style={{ overflow: 'hidden' }}>
            {recent.map((t, i) => (
              <View key={t.id} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : undefined}>
                <TxRow
                  tx={t}
                  accounts={accounts}
                  categories={categories}
                  onPress={() => router.push({ pathname: '/add', params: { id: t.id } })}
                  onDelete={async () => {
                    const removed = await useStore.getState().deleteTransaction(t.id);
                    if (removed) toast({ message: 'Transaction deleted', actionLabel: 'Undo', onAction: () => void useStore.getState().restoreTransaction(removed) });
                  }}
                />
              </View>
            ))}
          </Card>
        )}
      </Animated.View>
    </Screen>
  );
}

function Stat({ label, minor, color, icon, sign }: { label: string; minor: number; color: string; icon: 'arrowUp' | 'arrowDown' | 'swap'; sign?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.statIcon, { backgroundColor: tint(color, 0.16) }]}>
        <Icon name={icon} size={14} color={color} strokeWidth={2.6} />
      </View>
      <Text variant="caption" color="textDim">
        {label}
      </Text>
      <Money minor={minor} compact sign={sign} variant="bodyStrong" />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: radius.xl, padding: 22, gap: 6, overflow: 'hidden' },
  heroGlow: { position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -70, top: -90, backgroundColor: 'rgba(255,255,255,0.14)' },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden', marginTop: 10 },
  fill: { height: 8, borderRadius: 4 },
  heroCta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  stat: { flex: 1, borderRadius: radius.md, padding: 12, gap: 4, borderWidth: StyleSheet.hairlineWidth },
  statIcon: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  budgetChip: { alignItems: 'center', gap: 6, padding: 14, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, minWidth: 108 },
  account: { width: 156, borderRadius: radius.lg, padding: 14, gap: 10, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'space-between' },
  accDot: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addAccount: { width: 84, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
});
