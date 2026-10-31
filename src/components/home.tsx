import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { Allowance } from '../lib/allowance.ts';
import type { ChecklistItem } from '../lib/checklist.ts';
import { daysBetween, shortDate, weekdayName } from '../lib/dates.ts';
import type { FrequentSpend } from '../lib/frequent.ts';
import type { Insight } from '../lib/insights.ts';
import type { WeekRecap } from '../lib/recap.ts';
import type { RecurringBill } from '../lib/recurring.ts';
import { nextMilestone, type StreakInfo } from '../lib/streak.ts';
import type { Category } from '../lib/types.ts';
import { NOTE, radius, space, tint, useTheme } from '../theme';
import { Banknote } from './Banknote';
import { Icon } from './Icon';
import { useMoney } from './Money';
import { Text } from './Text';
import { TallyStreak, TickMeter, WeekStrip } from './Tally';
import { Button, Card, CategoryBadge, PressableScale, useCountUp } from './ui';

/* ------------------------------ allowance hero ------------------------------ */

export function AllowanceHero({ a }: { a: Allowance }) {
  const fmt = useMoney();
  const none = a.status === 'none';
  const over = a.status === 'over';
  // Counting from the allowance (not zero) makes the number feel earned after each log, not reset.
  const shown = useCountUp(none ? a.spentToday : Math.abs(a.left));
  const label = none ? 'Spent today' : over ? (a.allowance === 0 ? 'Past budget for the month' : 'Over today’s allowance by') : 'Safe to spend today';

  return (
    <Banknote color={NOTE[a.status]} style={styles.hero}>
      <View style={{ padding: 22, gap: 10 }}>
        <Text variant="bodyStrong" style={{ color: '#fff', opacity: 0.92 }}>
          {label}
        </Text>
        <Text variant="hero" tabular style={{ color: '#fff' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} accessibilityLiveRegion="polite">
          {fmt(shown)}
        </Text>
        {none ? (
          <Pressable onPress={() => router.push({ pathname: '/budget-edit', params: { overall: '1' } })} accessibilityRole="button" style={styles.heroCta}>
            <Text variant="bodyStrong" style={{ color: '#fff' }}>
              Set a budget for a daily number
            </Text>
            <Icon name="right" size={16} color="#fff" />
          </Pressable>
        ) : (
          <>
            <View style={{ marginTop: 6 }}>
              <TickMeter ratio={a.ratio} on="#FFFFFF" off="rgba(255,255,255,0.28)" />
            </View>
            <View style={styles.rowBetween}>
              <Text variant="caption" style={{ color: '#fff', opacity: 0.92 }}>
                {fmt(a.spentToday)} of {fmt(a.allowance)} today
              </Text>
              <Text variant="caption" style={{ color: '#fff', opacity: 0.92 }}>
                {a.daysLeft} {a.daysLeft === 1 ? 'day' : 'days'} left
              </Text>
            </View>
            <View style={[styles.hairline, { backgroundColor: 'rgba(255,255,255,0.28)' }]} />
            <Text variant="caption" style={{ color: '#fff', opacity: 0.92 }}>
              {a.monthLeft >= 0 ? `${fmt(a.monthLeft)} left this month` : `${fmt(-a.monthLeft)} over this month`}
              {a.reserved > 0 ? `, with ${fmt(a.reserved)} set aside for bills` : ''}
            </Text>
          </>
        )}
      </View>
    </Banknote>
  );
}

/* --------------------------------- streak ---------------------------------- */

export function StreakCard({ info, onNoSpend }: { info: StreakInfo; onNoSpend: () => void }) {
  const { colors } = useTheme();
  const target = nextMilestone(info.current);
  const toGo = target - info.current;
  return (
    <Card style={{ gap: 14 }}>
      <View style={styles.rowBetween}>
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text variant="display" tabular>
              {info.current}
            </Text>
            <Text variant="bodyStrong" color="textDim">
              day streak
            </Text>
          </View>
          <Text variant="caption" color="textDim">
            {info.current === 0 ? 'Log today to start one' : `${toGo} more ${toGo === 1 ? 'day' : 'days'} to ${target}. Best: ${info.best}`}
          </Text>
        </View>
        {info.current > 0 && <TallyStreak count={info.current} color={colors.primary} height={36} />}
      </View>
      <WeekStrip week={info.week} color={colors.primary} />
      {!info.todayDone && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Log a spend" icon="plus" size="sm" onPress={() => router.push('/add')} style={{ flex: 1 }} />
          <Button title="Spent nothing" size="sm" variant="secondary" onPress={onNoSpend} style={{ flex: 1 }} />
        </View>
      )}
      {info.todayDone && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="check" size={16} color={colors.income} strokeWidth={3} />
          <Text variant="caption" color="textDim">
            Today is on the tally
          </Text>
        </View>
      )}
    </Card>
  );
}

/* -------------------------------- quick log ---------------------------------- */

export function QuickLog({ items, categories, onLog }: { items: FrequentSpend[]; categories: Category[]; onLog: (f: FrequentSpend) => void }) {
  const fmt = useMoney();
  const { colors } = useTheme();
  if (items.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <Text variant="h2">Log again, one tap</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: space.lg }} style={{ marginHorizontal: -space.lg }}>
        {items.map((f) => {
          const cat = categories.find((c) => c.id === f.categoryId);
          return (
            <PressableScale
              key={`${f.note}|${f.categoryId}|${f.amount}`}
              onPress={() => onLog(f)}
              feedback="tap"
              scaleTo={0.94}
              accessibilityRole="button"
              accessibilityLabel={`Log ${f.note} ${fmt(f.amount)} again`}
              style={[styles.quick, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <CategoryBadge icon={cat?.icon ?? '❓'} color={cat?.color ?? colors.textFaint} size={34} />
              <View>
                <Text variant="bodyStrong" numberOfLines={1} style={{ maxWidth: 120 }}>
                  {f.note}
                </Text>
                <Text variant="caption" color="textDim">
                  {fmt(f.amount)}
                </Text>
              </View>
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* --------------------------------- insights ---------------------------------- */

export function InsightsRail({ items }: { items: Insight[] }) {
  const { colors } = useTheme();
  if (items.length === 0) return null;
  const tone = { good: colors.income, warn: colors.warn, bad: colors.expense, info: colors.primary } as const;
  return (
    <View style={{ gap: 10 }}>
      <Text variant="h2">Tally noticed</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={292} decelerationRate="fast" contentContainerStyle={{ gap: 12, paddingHorizontal: space.lg }} style={{ marginHorizontal: -space.lg }}>
        {items.map((i) => (
          <View key={i.id} style={[styles.insight, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={[styles.insightIcon, { backgroundColor: tint(tone[i.tone], 0.16) }]}>
                <Text style={{ fontSize: 20 }}>{i.icon}</Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="h2" numberOfLines={3}>
                  {i.title}
                </Text>
                <Text variant="caption" color="textDim" numberOfLines={3}>
                  {i.body}
                </Text>
              </View>
            </View>
            {i.action && (
              <Pressable onPress={() => router.push({ pathname: i.action!.route as '/', params: i.action!.params })} accessibilityRole="button" hitSlop={8}>
                <Text variant="label" style={{ color: tone[i.tone] === colors.warn ? colors.text : tone[i.tone] }}>
                  {i.action.label}
                </Text>
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/* ----------------------------------- bills ------------------------------------ */

export function BillsCard({ bills, today, total }: { bills: RecurringBill[]; today: string; total: number }) {
  const fmt = useMoney();
  const { colors } = useTheme();
  if (bills.length === 0) return null;
  const when = (d: string) => {
    const n = daysBetween(today, d);
    return n < 0 ? `${-n}d overdue` : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n < 7 ? weekdayName(d) : shortDate(d);
  };
  return (
    <Card style={{ gap: 4 }}>
      <View style={styles.rowBetween}>
        <Text variant="h2">Coming up</Text>
        <Text variant="caption" color="textDim">
          {fmt(total)} in 30 days
        </Text>
      </View>
      {bills.slice(0, 3).map((b, i) => (
        <View key={b.key} style={[styles.billRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {b.name}
            </Text>
            <Text variant="caption" style={{ color: daysBetween(today, b.nextDate) <= 1 ? colors.warn : colors.textDim }}>
              {when(b.nextDate)}
              {b.confidence === 'likely' ? ' · likely' : ''}
            </Text>
          </View>
          <Text variant="amount" tabular>
            {fmt(b.amount)}
          </Text>
        </View>
      ))}
      <Text variant="caption" color="textFaint" style={{ marginTop: 6 }}>
        Found from payments that repeat every month.
      </Text>
    </Card>
  );
}

/* --------------------------------- checklist --------------------------------- */

export function ChecklistCard({ items, onHide }: { items: ChecklistItem[]; onHide: () => void }) {
  const { colors } = useTheme();
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return null;
  return (
    <Card style={{ gap: 12 }}>
      <View style={styles.rowBetween}>
        <View>
          <Text variant="h2">Get set up</Text>
          <Text variant="caption" color="textDim">
            {done} of {items.length} done
          </Text>
        </View>
        <Pressable onPress={onHide} hitSlop={10} accessibilityRole="button" accessibilityLabel="Hide setup checklist">
          <Icon name="close" size={18} color={colors.textFaint} />
        </Pressable>
      </View>
      <TickMeter ratio={done / items.length} on={colors.income} off={colors.cardAlt} ticks={items.length * 4} height={8} />
      {items.map((i) => (
        <Pressable
          key={i.id}
          disabled={i.done}
          onPress={() => router.push(i.route === '/budget-edit' ? { pathname: '/budget-edit', params: { overall: '1' } } : i.route)}
          accessibilityRole="button"
          accessibilityState={{ disabled: i.done }}
          accessibilityLabel={`${i.title}${i.done ? ', done' : ''}`}
          style={({ pressed }) => [styles.checkRow, { opacity: pressed ? 0.6 : 1 }]}
        >
          <View style={[styles.check, { borderColor: i.done ? colors.income : colors.textFaint, backgroundColor: i.done ? colors.income : 'transparent' }]}>
            {i.done && <Icon name="check" size={13} color="#fff" strokeWidth={3.4} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong" style={i.done ? { textDecorationLine: 'line-through', color: colors.textFaint } : undefined}>
              {i.title}
            </Text>
            {!i.done && (
              <Text variant="caption" color="textDim">
                {i.hint}
              </Text>
            )}
          </View>
          {!i.done && <Icon name="right" size={16} color={colors.textFaint} />}
        </Pressable>
      ))}
    </Card>
  );
}

/* ----------------------------------- recap ------------------------------------ */

/** The RM100 note is purple: the weekly recap is the app's rarest, most special card. */
const RECAP_NOTE = '#5B3FD0';

export function RecapCard({ recap, week }: { recap: WeekRecap; week: string }) {
  const fmt = useMoney();
  return (
    <PressableScale onPress={() => router.push({ pathname: '/recap', params: { week } })} accessibilityRole="button" accessibilityLabel="Open your weekly recap" scaleTo={0.98}>
      <Banknote color={RECAP_NOTE} radius={22}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 }}>
          <Text style={{ fontSize: 40 }} allowFontScaling={false}>
            {recap.persona.icon}
          </Text>
          <View style={{ flex: 1 }}>
            <Text variant="h2" style={{ color: '#fff' }}>
              Your week is ready
            </Text>
            <Text variant="caption" style={{ color: '#fff', opacity: 0.9 }}>
              {recap.persona.title} · {fmt(recap.total)} spent
            </Text>
          </View>
          <Icon name="right" size={20} color="#fff" />
        </View>
      </Banknote>
    </PressableScale>
  );
}

/* ----------------------------------- nudges ----------------------------------- */

export function NudgeCard({ icon, title, body, primary, onPrimary, onDismiss }: { icon: string; title: string; body: string; primary: string; onPrimary: () => void; onDismiss: () => void }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  return (
    <Card style={{ gap: 12, borderColor: tint(colors.primary, 0.4) }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Text style={{ fontSize: 26 }}>{icon}</Text>
        <View style={{ flex: 1, gap: 3 }}>
          <Text variant="h2">{title}</Text>
          <Text variant="caption" color="textDim">
            {body}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          title={primary}
          size="sm"
          loading={busy}
          onPress={() => {
            setBusy(true);
            onPrimary();
          }}
          style={{ flex: 1 }}
        />
        <Button title="Not now" size="sm" variant="secondary" onPress={onDismiss} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: {},
  heroCta: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, marginTop: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hairline: { height: StyleSheet.hairlineWidth, marginTop: 4 },
  quick: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingLeft: 9, paddingRight: 16, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  insight: { width: 280, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 12, justifyContent: 'space-between' },
  insightIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  billRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
