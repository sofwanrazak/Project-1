import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type AccessibilityActionEvent, type GestureResponderEvent } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { avgMonthly, cashFlow, categoryTrends, heatmapMonth, lastMonths, paceSeries, weekdayProfile, whatIf } from '../lib/analytics.ts';
import { dayLabel, monthEnd, monthShort, monthStart } from '../lib/dates.ts';
import { useStore } from '../store/useStore';
import { radius, tint, useTheme } from '../theme';
import { BarChart, LineChart, type LineSeries } from './charts';
import { Money, useMoney } from './Money';
import { Text } from './Text';
import { useToast } from './Toast';
import { TxRow } from './TxRow';
import { Button, Card, CategoryBadge, Chip, EmptyState, haptic } from './ui';

interface ViewProps {
  /** Month the view is about, YYYY-MM. */
  anchor: string;
  today: string;
}

/* ------------------------------------------------------------------------------- calendar */

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function CalendarView({ anchor, today }: ViewProps) {
  const { colors } = useTheme();
  const fmt = useMoney();
  const { transactions, accounts, categories } = useStore();
  const [sel, setSel] = useState<string | null>(null);

  const heat = useMemo(() => heatmapMonth(transactions, anchor, today), [transactions, anchor, today]);
  const wd = useMemo(() => weekdayProfile(transactions, monthStart(anchor), monthEnd(anchor), today), [transactions, anchor, today]);
  const scale = [colors.cardAlt, tint(colors.brand, 0.3), tint(colors.brand, 0.55), tint(colors.brand, 0.8), colors.brand];
  const dayRows = sel ? transactions.filter((t) => t.date === sel) : [];
  const picked = sel ? heat.weeks.flat().find((d) => d?.date === sel) : null;
  const maxAvg = Math.max(...wd.bars.map((b) => b.avg), 1);

  return (
    <View style={{ gap: 14 }}>
      <Card style={{ gap: 12 }}>
        <View style={styles.grid}>
          {LETTERS.map((l, i) => (
            <Text key={i} variant="caption" color="textFaint" style={styles.letter}>
              {l}
            </Text>
          ))}
        </View>
        {heat.weeks.map((week, wi) => (
          <View key={wi} style={styles.grid}>
            {/* Pad the last week to seven cells so every day keeps the same width. */}
            {Array.from({ length: 7 }, (_, i) => week[i] ?? null).map((d, di) =>
              d === null ? (
                <View key={di} style={styles.cell} />
              ) : (
                <Pressable
                  key={d.date}
                  onPress={() => {
                    haptic.select();
                    setSel((cur) => (cur === d.date ? null : d.date));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${dayLabel(d.date, today)}, ${d.future ? 'upcoming' : d.expense > 0 ? `spent ${fmt(d.expense)}` : 'no spending'}`}
                  accessibilityState={{ selected: sel === d.date }}
                  style={[styles.cell, { backgroundColor: scale[d.level], borderColor: sel === d.date ? colors.primary : d.today ? colors.text : 'transparent', borderWidth: sel === d.date || d.today ? 2 : 0, opacity: d.future ? 0.4 : 1 }]}
                >
                  <Text variant="label" tabular style={{ color: d.level >= 3 ? '#fff' : colors.text }}>
                    {d.day}
                  </Text>
                  {d.income > 0 && <View style={[styles.dot, { top: 4, right: 5, backgroundColor: colors.income }]} />}
                  {d.noSpend && <View style={[styles.dot, { bottom: 4, alignSelf: 'center', backgroundColor: colors.income, opacity: 0.55 }]} />}
                </Pressable>
              ),
            )}
          </View>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="caption" color="textFaint">
            Lighter
          </Text>
          {scale.map((c, i) => (
            <View key={i} style={{ width: 16, height: 16, borderRadius: 5, backgroundColor: c }} />
          ))}
          <Text variant="caption" color="textFaint" style={{ flex: 1 }}>
            Heavier
          </Text>
          <View style={[styles.legendDot, { backgroundColor: colors.income }]} />
          <Text variant="caption" color="textFaint">
            income
          </Text>
        </View>
      </Card>

      {heat.total > 0 ? (
        <Card style={{ gap: 4 }}>
          <Text variant="h2">{fmt(heat.total)} spent</Text>
          <Text variant="caption" color="textDim">
            {fmt(Math.round(heat.avgSpendDay))} on a typical spending day, {heat.noSpendDays} no-spend {heat.noSpendDays === 1 ? 'day' : 'days'}
            {heat.heaviest ? `. Heaviest: ${dayLabel(heat.heaviest.date, today)} (${fmt(heat.heaviest.expense)}).` : '.'}
          </Text>
        </Card>
      ) : null}

      {sel && picked && (
        <Card style={{ gap: 10 }}>
          <View style={styles.rowBetween}>
            <Text variant="h2">{dayLabel(sel, today)}</Text>
            <Text variant="caption" color="textDim">
              {picked.expense > 0 ? `${fmt(picked.expense)} spent` : picked.future ? 'Upcoming' : 'Nothing spent'}
              {picked.income > 0 ? `, ${fmt(picked.income)} in` : ''}
            </Text>
          </View>
          {dayRows.length === 0 ? (
            <Text variant="body" color="textDim">
              {picked.future ? 'Nothing logged yet for this day.' : 'A no-spend day. Those add up.'}
            </Text>
          ) : (
            <View style={{ marginHorizontal: -16, overflow: 'hidden' }}>
              {dayRows.map((t, i) => (
                <View key={t.id} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : undefined}>
                  <TxRow tx={t} accounts={accounts} categories={categories} onPress={() => router.push({ pathname: '/add', params: { id: t.id } })} />
                </View>
              ))}
            </View>
          )}
        </Card>
      )}

      <Card style={{ gap: 12 }}>
        <View>
          <Text variant="h2">Your week, by day</Text>
          <Text variant="caption" color="textDim">
            {wd.top ? `${wd.top.label} is your priciest day: ${fmt(wd.top.avg)} on average.` : 'Average spending for each weekday this month.'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 110 }}>
          {wd.bars.map((b) => (
            <View key={b.index} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 6 }}>
              <View style={{ width: '100%', height: `${Math.max((b.avg / maxAvg) * 78, b.avg > 0 ? 4 : 0)}%`, borderRadius: 8, backgroundColor: b.index === wd.top?.index ? colors.brand : tint(colors.brand, 0.35) }} accessible accessibilityLabel={`${b.label}, average ${fmt(b.avg)}`} />
              <Text variant="caption" color={b.index === wd.top?.index ? 'text' : 'textFaint'} style={{ fontSize: 11, lineHeight: 14 }}>
                {b.label.slice(0, 2)}
              </Text>
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}

/* ----------------------------------------------------------------------------------- pace */

export function PaceView({ anchor, today }: ViewProps) {
  const { colors } = useTheme();
  const fmt = useMoney();
  const { transactions, budgets } = useStore();
  const overall = budgets.find((b) => b.categoryId === null)?.amount ?? null;
  const pace = useMemo(() => paceSeries(transactions, overall, anchor, today), [transactions, overall, anchor, today]);

  const series: LineSeries[] = useMemo(() => {
    const n = pace.days;
    const actual: (number | null)[] = Array.from({ length: n }, (_, i) => (i < pace.elapsed ? pace.actual[i] : null));
    const out: LineSeries[] = [{ key: 'actual', label: 'Spent', values: actual, color: colors.brand, fill: true }];
    if (pace.ideal) out.push({ key: 'ideal', label: 'Budget pace', values: pace.ideal, color: colors.textFaint, dashed: true });
    if (pace.elapsed > 0 && pace.elapsed < n) {
      const start = pace.actual[pace.elapsed - 1];
      const proj: (number | null)[] = Array.from({ length: n }, (_, i) => (i + 1 < pace.elapsed ? null : Math.round(start + ((pace.projectedEnd - start) * (i + 1 - pace.elapsed)) / Math.max(n - pace.elapsed, 1))));
      out.push({ key: 'proj', label: 'If this continues', values: proj, color: pace.status === 'over' ? colors.expense : colors.income, dashed: true });
    }
    return out;
  }, [pace, colors]);

  if (pace.elapsed === 0) return <Card><EmptyState icon="🗓️" title="This month has not started" body="Pick a month that has some spending." /></Card>;

  const spent = pace.actual[pace.elapsed - 1] ?? 0;
  const left = pace.days - pace.elapsed;
  const headline =
    pace.status === 'over'
      ? `On pace to spend ${fmt(pace.projectedEnd)}, ${fmt(pace.projectedEnd - (pace.budget ?? 0))} over budget`
      : pace.status === 'under'
        ? `On pace to finish ${fmt((pace.budget ?? 0) - pace.projectedEnd)} under budget`
        : pace.status === 'on-track'
          ? `On track for ${fmt(pace.projectedEnd)} against a ${fmt(pace.budget ?? 0)} budget`
          : pace.budget
            ? 'Too early in the month to call it'
            : `Heading for about ${fmt(pace.projectedEnd)} this month`;
  const tone = pace.status === 'over' ? colors.expense : pace.status === 'none' ? colors.text : colors.income;
  const needed = pace.budget && left > 0 ? Math.max(Math.floor((pace.budget - spent) / left), 0) : null;

  return (
    <View style={{ gap: 14 }}>
      <Card style={{ gap: 14 }}>
        <Text variant="h2" style={{ color: tone }}>
          {headline}
        </Text>
        <LineChart series={series} xLabels={Array.from({ length: pace.days }, (_, i) => String(i + 1))} axisEvery={5} format={(v) => fmt(v)} height={190} />
      </Card>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat label="Spent so far" minor={spent} />
        <Stat label="Daily average" minor={Math.round(spent / pace.elapsed)} />
      </View>
      {pace.budget ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Stat label="Projected end" minor={pace.projectedEnd} color={pace.status === 'over' ? colors.expense : undefined} />
          <Stat label={left > 0 ? 'Safe per day from here' : 'Budget'} minor={left > 0 ? (needed ?? 0) : pace.budget} />
        </View>
      ) : null}
    </View>
  );
}

function Stat({ label, minor, color }: { label: string; minor: number; color?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text variant="caption" color="textDim">
        {label}
      </Text>
      <Money minor={minor} variant="h2" color={color} />
    </View>
  );
}

/* ------------------------------------------------------------------------------ cash flow */

export function FlowView({ anchor }: ViewProps) {
  const { colors } = useTheme();
  const fmt = useMoney();
  const { transactions } = useStore();
  const months = useMemo(() => lastMonths(anchor, 6), [anchor]);
  const rows = useMemo(() => cashFlow(transactions, months), [transactions, months]);
  const withIncome = rows.filter((r) => r.rate !== null);
  const avgRate = withIncome.length ? Math.round(withIncome.reduce((s, r) => s + (r.rate ?? 0), 0) / withIncome.length) : null;
  const kept = rows.reduce((s, r) => s + r.net, 0);

  return (
    <View style={{ gap: 14 }}>
      <Card style={{ gap: 12 }}>
        <View style={[styles.rowBetween, { alignItems: 'flex-start', gap: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text variant="h2">Money in and out</Text>
            <Text variant="caption" color="textDim">
              Last 6 months. The faint bar is income.
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
            <Money minor={kept} variant="h2" sign color={kept >= 0 ? colors.income : colors.expense} />
            <Text variant="caption" color="textDim">
              {avgRate !== null ? `${avgRate}% kept on average` : 'net over 6 months'}
            </Text>
          </View>
        </View>
        <BarChart bars={rows.map((r) => ({ key: r.key, label: monthShort(r.key), value: r.expense, ghost: r.income }))} color={colors.brand} format={(v) => fmt(v)} height={150} />
      </Card>

      <Card pad={false} style={{ overflow: 'hidden' }}>
        {rows
          .slice()
          .reverse()
          .map((r, i) => (
            <View key={r.key} style={[styles.flowRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <Text variant="bodyStrong" style={{ width: 44 }}>
                {monthShort(r.key)}
              </Text>
              <View style={{ flex: 1 }}>
                <Text variant="caption" color="textDim" tabular>
                  in {fmt(r.income, { compact: true })} · out {fmt(r.expense, { compact: true })}
                </Text>
              </View>
              <Money minor={r.net} sign compact color={r.net >= 0 ? colors.income : colors.expense} />
              <View style={[styles.ratePill, { backgroundColor: tint(r.rate === null ? colors.textFaint : r.rate >= 0 ? colors.income : colors.expense, 0.14) }]}>
                <Text variant="label" style={{ color: r.rate === null ? colors.textFaint : r.rate >= 0 ? colors.income : colors.expense }}>
                  {r.rate === null ? 'no income' : `${r.rate}%`}
                </Text>
              </View>
            </View>
          ))}
      </Card>
    </View>
  );
}

/* ---------------------------------------------------------------------------- categories */

function MiniBars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  const w = 6;
  const gap = 3;
  return (
    <Svg width={values.length * (w + gap)} height={28}>
      {values.map((v, i) => {
        const h = Math.max((v / max) * 26, v > 0 ? 3 : 1);
        return <Rect key={i} x={i * (w + gap)} y={28 - h} width={w} height={h} rx={2} fill={color} opacity={i === values.length - 1 ? 1 : 0.4} />;
      })}
    </Svg>
  );
}

export function CategoriesView({ anchor }: ViewProps) {
  const { colors } = useTheme();
  const fmt = useMoney();
  const { transactions, categories } = useStore();
  const months = useMemo(() => lastMonths(anchor, 6), [anchor]);
  const rows = useMemo(() => categoryTrends(transactions, categories, months), [transactions, categories, months]);

  if (rows.length === 0) return <Card><EmptyState icon="🗂️" title="No spending to compare" body="Category trends appear once you have spending in the last six months." /></Card>;
  return (
    <Card pad={false} style={{ overflow: 'hidden' }}>
      {rows.map((r, i) => {
        const pct = r.change === null ? null : Math.round(Math.abs(r.change));
        const flat = pct === 0;
        const up = r.change !== null && r.change > 0;
        const tone = r.change === null || flat ? colors.textFaint : up ? colors.expense : colors.income;
        return (
          <Pressable
            key={r.categoryId ?? 'none'}
            onPress={() => r.categoryId && router.push({ pathname: '/activity', params: { category: r.categoryId } })}
            accessibilityRole="button"
            accessibilityLabel={`${r.name}, ${fmt(r.current)} this month${pct === null ? '' : flat ? ', unchanged' : `, ${up ? 'up' : 'down'} ${pct} percent`}`}
            style={({ pressed }) => [styles.trend, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, { opacity: pressed ? 0.6 : 1 }]}
          >
            <CategoryBadge icon={r.icon} color={r.color} size={40} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {r.name}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Money minor={r.current} variant="caption" color={colors.textDim} />
                {pct !== null && (
                  <Text variant="label" style={{ color: tone }}>
                    {flat ? 'same as usual' : `${up ? '↑' : '↓'} ${pct}%`}
                  </Text>
                )}
              </View>
            </View>
            <MiniBars values={r.series} color={r.color} />
          </Pressable>
        );
      })}
    </Card>
  );
}

/* ------------------------------------------------------------------------------- what if */

/** A plain slider: drag or use the accessibility actions. Steps of `step` from 0 to `max`. */
export function Slider({ value, onChange, max = 60, step = 5, label }: { value: number; onChange: (v: number) => void; max?: number; step?: number; label: string }) {
  const { colors } = useTheme();
  const [w, setW] = useState(0);
  const set = (e: GestureResponderEvent) => {
    if (w === 0) return;
    const raw = (e.nativeEvent.locationX / w) * max;
    const v = Math.min(max, Math.max(0, Math.round(raw / step) * step));
    if (v !== value) {
      haptic.select();
      onChange(v);
    }
  };
  const act = (e: AccessibilityActionEvent) => onChange(Math.min(max, Math.max(0, value + (e.nativeEvent.actionName === 'increment' ? step : -step))));
  const pct = (value / max) * 100;
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={set}
      onResponderMove={set}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: value, text: `${value} percent` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={act}
      style={{ height: 40, justifyContent: 'center' }}
    >
      <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.cardAlt }}>
        <View style={{ width: `${pct}%`, height: 8, borderRadius: 4, backgroundColor: colors.brand }} />
      </View>
      <View style={{ position: 'absolute', left: `${pct}%`, marginLeft: -13, width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff', borderWidth: 3, borderColor: colors.brand }} />
    </View>
  );
}

export function WhatIfView({ anchor }: ViewProps) {
  const { colors } = useTheme();
  const fmt = useMoney();
  const toast = useToast();
  const { transactions, categories, goals, budgets } = useStore();
  const months = useMemo(() => lastMonths(anchor, 3), [anchor]);
  const ranked = useMemo(
    () =>
      categoryTrends(transactions, categories, months)
        .filter((r) => r.categoryId)
        .slice(0, 6),
    [transactions, categories, months],
  );
  const [picked, setPicked] = useState<string | null>(null);
  const [cut, setCut] = useState(20);

  const current = ranked.find((r) => r.categoryId === picked) ?? ranked[0];
  if (!current) return <Card><EmptyState icon="🧪" title="Nothing to simulate yet" body="Log some spending and you can test what cutting a category would save." /></Card>;

  const base = avgMonthly(transactions, current.categoryId, months);
  const goal = goals.find((g) => g.saved < g.target);
  const r = whatIf({ monthly: base, cutPct: cut, goalRemaining: goal ? goal.target - goal.saved : undefined });
  const target = base - r.perMonth;
  const existing = budgets.find((b) => b.categoryId === current.categoryId);

  return (
    <View style={{ gap: 14 }}>
      <Card style={{ gap: 14 }}>
        <View>
          <Text variant="h2">What if I spent less?</Text>
          <Text variant="caption" color="textDim">
            Pick a category and drag. Based on your last 3 months.
          </Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ranked.map((c) => (
            <Chip key={c.categoryId} label={c.name} icon={c.icon} color={c.color} selected={current.categoryId === c.categoryId} onPress={() => setPicked(c.categoryId)} />
          ))}
        </View>
        <View style={styles.rowBetween}>
          <Text variant="body" color="textDim">
            You spend about
          </Text>
          <Money minor={base} variant="title" />
        </View>
        <View>
          <View style={styles.rowBetween}>
            <Text variant="bodyStrong">Cut it by</Text>
            <Text variant="title" tabular style={{ color: colors.primary }}>
              {cut}%
            </Text>
          </View>
          <Slider value={cut} onChange={setCut} label={`Cut ${current.name} by`} />
        </View>
      </Card>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat label="Saved each month" minor={r.perMonth} color={colors.income} />
        <Stat label="Saved in a year" minor={r.perYear} color={colors.income} />
      </View>

      {goal && r.monthsToGoal !== null ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 28 }}>{goal.icon}</Text>
          <Text variant="body" style={{ flex: 1 }}>
            That alone would fill your <Text variant="bodyStrong">{goal.name}</Text> jar in about {r.monthsToGoal} {r.monthsToGoal === 1 ? 'month' : 'months'}.
          </Text>
        </Card>
      ) : null}

      {r.perMonth > 0 && current.categoryId ? (
        <Button
          title={existing ? `Change ${current.name} budget to ${fmt(target)}` : `Set a ${current.name} budget of ${fmt(target)}`}
          icon="check"
          onPress={async () => {
            await useStore.getState().setBudget(current.categoryId, target);
            toast({ message: `${current.name} budget set to ${fmt(target)} a month` });
          }}
        />
      ) : null}
      <Text variant="caption" color="textFaint" style={{ textAlign: 'center' }}>
        An estimate from past spending, not a promise.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 6 },
  letter: { flex: 1, textAlign: 'center' },
  cell: { flex: 1, aspectRatio: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', width: 6, height: 6, borderRadius: 3 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stat: { flex: 1, padding: 14, gap: 4, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  flowRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16 },
  ratePill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, minWidth: 58, alignItems: 'center' },
  trend: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
});
