import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { BarChart, Donut } from '../../components/charts';
import { CalendarView, CategoriesView, FlowView, PaceView, WhatIfView } from '../../components/explore';
import { Icon } from '../../components/Icon';
import { Money, useMoney } from '../../components/Money';
import { Text } from '../../components/Text';
import { Button, Card, CategoryBadge, Chip, EmptyState, IconButton, Screen, Segmented, useTabInset } from '../../components/ui';
import { addDays, monthKey, monthLabel, monthShort, todayStr, addMonths } from '../../lib/dates.ts';
import { elapsedDays, periodFor, type PeriodKind } from '../../lib/periods.ts';
import { buildInsights } from '../../lib/insights.ts';
import { detectRecurring } from '../../lib/recurring.ts';
import { dailyExpense, expenseByCategory, inRange, monthlyTotals, pctChange, topMerchants, totals } from '../../lib/stats.ts';
import { useStore } from '../../store/useStore';
import { radius, space, tint, useTheme } from '../../theme';


type View_ = 'overview' | 'calendar' | 'pace' | 'flow' | 'categories' | 'whatif';
const VIEWS: { value: View_; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'pace', label: 'Pace' },
  { value: 'flow', label: 'Cash flow' },
  { value: 'categories', label: 'Categories' },
  { value: 'whatif', label: 'What if' },
];

export default function Insights() {
  const { colors } = useTheme();
  const fmt = useMoney();
  const inset = useTabInset();
  const { transactions, categories } = useStore();
  const today = todayStr();
  const [kind, setKind] = useState<PeriodKind>('month');
  const [anchor, setAnchor] = useState(monthKey(today));
  const [view, setView] = useState<View_>('overview');
  const explore = view !== 'overview';

  const d = useMemo(() => {
    const p = periodFor(kind, anchor);
    const cur = inRange(transactions, p.from, p.to);
    const prev = inRange(transactions, p.prev.from, p.prev.to);
    const t = totals(cur);
    const pt = totals(prev);
    const cats = expenseByCategory(cur);
    const days = Math.max(elapsedDays(p, today), 1);
    const biggest = cur.filter((x) => x.kind === 'expense').sort((a, b) => b.amount - a.amount)[0];
    const bars =
      kind === 'month'
        ? dailyExpense(cur, p.from, p.to, (s) => addDays(s, 1)).map((x) => ({ key: x.date, label: `${Number(x.date.slice(8))} ${monthShort(x.date.slice(0, 7))}`, axis: String(Number(x.date.slice(8))), value: x.value }))
        : monthlyTotals(cur, p.months).map((m) => ({ key: m.key, label: monthShort(m.key), value: m.expense, ghost: m.income }));
    const spendDays = new Set(cur.filter((x) => x.kind === 'expense').map((x) => x.date)).size;
    return { p, t, pt, cats, days, biggest, bars, merchants: topMerchants(cur, 5), noSpend: Math.max(days - spendDays, 0), count: cur.length };
  }, [transactions, kind, anchor, today]);

  const { budgets } = useStore();
  const bills = useMemo(() => detectRecurring(transactions, today), [transactions, today]);
  const feed = buildInsights({ transactions, categories, budgets, bills, today, fmt });
  const billsMonthly = bills.reduce((t, b) => t + b.amount, 0);

  const delta = pctChange(d.t.expense, d.pt.expense);
  const savingsRate = d.t.income > 0 ? Math.round(((d.t.income - d.t.expense) / d.t.income) * 100) : null;
  const catRows = d.cats.map((c) => ({ ...c, cat: categories.find((x) => x.id === c.categoryId) }));
  const slices = catRows.map((c) => ({ key: c.categoryId ?? 'none', value: c.total, color: c.cat?.color ?? colors.textFaint }));
  const canNext = addMonths(anchor, 1) <= monthKey(today);
  const title = kind === 'month' ? monthLabel(anchor) : `${monthShort(d.p.months[0])} ${d.p.months[0].slice(0, 4)} – ${monthShort(anchor)} ${anchor.slice(0, 4)}`;
  const step = explore || kind === 'month' ? 1 : Number(kind.replace('m', ''));
  const navTitle = explore ? monthLabel(anchor) : title;

  return (
    <Screen bottomInset={inset} contentStyle={{ paddingTop: space.md }}>
      <Animated.View style={{ gap: 14 }}>
        <Text variant="display">Insights</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 16 }} style={{ marginHorizontal: -space.lg, paddingHorizontal: space.lg, flexGrow: 0 }}>
          {VIEWS.map((v) => (
            <Chip key={v.value} label={v.label} selected={view === v.value} onPress={() => setView(v.value)} />
          ))}
        </ScrollView>
        {!explore && (
          <Segmented<PeriodKind>
            value={kind}
            onChange={(k) => {
              setKind(k);
              setAnchor(monthKey(today));
            }}
            options={[
              { value: 'month', label: 'Month' },
              { value: '3m', label: '3 mo' },
              { value: '6m', label: '6 mo' },
              { value: '12m', label: 'Year' },
            ]}
          />
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton icon="left" label="Earlier" size={36} onPress={() => setAnchor(addMonths(anchor, -step))} />
          <Text variant="bodyStrong">{navTitle}</Text>
          <View style={{ opacity: canNext ? 1 : 0.35 }}>
            <IconButton icon="right" label="Later" size={36} onPress={() => canNext && setAnchor(addMonths(anchor, step) > monthKey(today) ? monthKey(today) : addMonths(anchor, step))} />
          </View>
        </View>
      </Animated.View>

      {explore ? (
        <>
          {view === 'calendar' && <CalendarView anchor={anchor} today={today} />}
          {view === 'pace' && <PaceView anchor={anchor} today={today} />}
          {view === 'flow' && <FlowView anchor={anchor} today={today} />}
          {view === 'categories' && <CategoriesView anchor={anchor} today={today} />}
          {view === 'whatif' && <WhatIfView anchor={anchor} today={today} />}
        </>
      ) : d.count === 0 ? (
        <Card>
          <EmptyState icon="📊" title="No data for this period" body="Add some transactions and your spending story shows up here." />
        </Card>
      ) : (
        <>
          <Animated.View>
            <Card style={{ gap: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text variant="overline" color="textFaint">
                    Total spent
                  </Text>
                  <Money minor={d.t.expense} variant="display" />
                </View>
                {delta !== null && (
                  <View style={[styles.pill, { backgroundColor: tint(delta > 0 ? colors.expense : colors.income, 0.14) }]} accessibilityLabel={`${Math.abs(Math.round(delta))} percent ${delta > 0 ? 'more' : 'less'} than the previous period`}>
                    <Icon name={delta > 0 ? 'arrowUp' : 'arrowDown'} size={13} color={delta > 0 ? colors.expense : colors.income} strokeWidth={2.8} />
                    <Text variant="label" style={{ color: delta > 0 ? colors.expense : colors.income }}>
                      {Math.abs(Math.round(delta))}%
                    </Text>
                  </View>
                )}
              </View>
              <BarChart bars={d.bars} color={colors.primary} format={(v) => fmt(v)} labelEvery={kind === 'month' ? 5 : kind === '12m' ? 2 : 1} height={140} />
            </Card>
          </Animated.View>

          <Animated.View style={{ flexDirection: 'row', gap: 10 }}>
            <Mini label="Income" minor={d.t.income} color={colors.income} />
            <Mini label="Daily avg" minor={Math.round(d.t.expense / d.days)} color={colors.text} />
            <View style={[styles.mini, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text variant="caption" color="textDim">
                Saved
              </Text>
              <Text variant="bodyStrong" tabular style={{ color: savingsRate === null ? colors.textFaint : savingsRate >= 0 ? colors.income : colors.expense }}>
                {savingsRate === null ? '–' : `${savingsRate}%`}
              </Text>
            </View>
          </Animated.View>

          {catRows.length > 0 && (
            <Animated.View>
              <Card style={{ gap: 16 }}>
                <Text variant="h2">Where it went</Text>
                <View style={{ alignItems: 'center' }}>
                  <Donut
                    slices={slices}
                    size={190}
                    stroke={24}
                    center={
                      <View style={{ alignItems: 'center', maxWidth: 120 }}>
                        <Text variant="caption" color="textDim">
                          {catRows.length} {catRows.length === 1 ? 'category' : 'categories'}
                        </Text>
                        <Money minor={d.t.expense} variant="h2" compact />
                      </View>
                    }
                  />
                </View>
                <View style={{ gap: 4 }}>
                  {catRows.map((c) => {
                    const pct = d.t.expense > 0 ? (c.total / d.t.expense) * 100 : 0;
                    return (
                      <Pressable
                        key={c.categoryId ?? 'none'}
                        onPress={() => c.categoryId && router.push({ pathname: '/activity', params: { category: c.categoryId } })}
                        accessibilityRole="button"
                        accessibilityLabel={`${c.cat?.name ?? 'Uncategorised'}, ${Math.round(pct)} percent`}
                        style={({ pressed }) => [styles.legend, { opacity: pressed ? 0.6 : 1 }]}
                      >
                        <CategoryBadge icon={c.cat?.icon ?? '❓'} color={c.cat?.color ?? colors.textFaint} size={38} />
                        <View style={{ flex: 1, gap: 5 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                              {c.cat?.name ?? 'Uncategorised'}
                            </Text>
                            <Money minor={c.total} />
                          </View>
                          <View style={[styles.legendTrack, { backgroundColor: colors.cardAlt }]}>
                            <View style={{ width: `${Math.max(pct, 2)}%`, height: 5, borderRadius: 3, backgroundColor: c.cat?.color ?? colors.textFaint }} />
                          </View>
                          <Text variant="caption" color="textFaint">
                            {Math.round(pct)}% · {c.count} {c.count === 1 ? 'transaction' : 'transactions'}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </Card>
            </Animated.View>
          )}

          <Animated.View>
            <Card style={{ gap: 12 }}>
              <Text variant="h2">Highlights</Text>
              {d.biggest && (
                <Highlight icon="🏆" title="Biggest expense" value={<Money minor={d.biggest.amount} />} sub={d.biggest.note || categories.find((c) => c.id === d.biggest!.categoryId)?.name || ''} />
              )}
              <Highlight icon="🧘" title="No-spend days" value={<Text variant="bodyStrong" tabular>{d.noSpend}</Text>} sub={`of ${d.days} days so far`} />
              {d.merchants.length > 0 && (
                <View style={{ gap: 8, marginTop: 4 }}>
                  <Text variant="overline" color="textFaint">
                    Top spots
                  </Text>
                  {d.merchants.map((m, i) => (
                    <View key={m.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text variant="caption" color="textFaint" style={{ width: 16 }}>
                        {i + 1}
                      </Text>
                      <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                        {m.name}
                      </Text>
                      <Text variant="caption" color="textFaint">
                        ×{m.count}
                      </Text>
                      <Money minor={m.total} />
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </Animated.View>

          {feed.length > 0 && (
            <Animated.View>
              <Card style={{ gap: 14 }}>
                <Text variant="h2">Tally noticed</Text>
                {feed.slice(0, 6).map((i) => (
                  <View key={i.id} style={{ flexDirection: 'row', gap: 12 }}>
                    <Text style={{ fontSize: 22 }}>{i.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong">{i.title}</Text>
                      <Text variant="caption" color="textDim">
                        {i.body}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            </Animated.View>
          )}

          {bills.length > 0 && (
            <Animated.View>
              <Card style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Text variant="h2">Repeating payments</Text>
                  <Text variant="caption" color="textDim">
                    about {fmt(billsMonthly)} a month
                  </Text>
                </View>
                {bills.map((b) => (
                  <View key={b.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                      {b.name}
                    </Text>
                    <Text variant="caption" color="textFaint">
                      next {b.nextDate.slice(8)}/{b.nextDate.slice(5, 7)}
                    </Text>
                    <Money minor={b.amount} />
                  </View>
                ))}
                <Text variant="caption" color="textFaint">
                  Found from payments that repeat every month at about the same price.
                </Text>
              </Card>
            </Animated.View>
          )}
        </>
      )}
      {!explore && <Button title="Open your weekly recap" icon="chart" variant="secondary" onPress={() => router.push('/recap')} />}
    </Screen>
  );
}

function Mini({ label, minor, color }: { label: string; minor: number; color: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.mini, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text variant="caption" color="textDim">
        {label}
      </Text>
      <Money minor={minor} compact color={color} />
    </View>
  );
}

function Highlight({ icon, title, value, sub }: { icon: string; title: string; value: React.ReactNode; sub: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text style={{ fontSize: 24 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" color="textDim" numberOfLines={1}>
          {sub}
        </Text>
      </View>
      {value}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  mini: { flex: 1, padding: 12, gap: 3, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  legendTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
});
