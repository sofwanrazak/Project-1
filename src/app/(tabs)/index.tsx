import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { authenticate, deviceCanAuthenticate } from '../../components/AppLock';
import { AllowanceHero, BillsCard, ChecklistCard, InsightsRail, NudgeCard, QuickLog, RecapCard, StreakCard } from '../../components/home';
import { Icon } from '../../components/Icon';
import { Money } from '../../components/Money';
import { ProgressRing } from '../../components/charts';
import { Text } from '../../components/Text';
import { useToast } from '../../components/Toast';
import { TxRow } from '../../components/TxRow';
import { Button, Card, EmptyState, haptic, IconButton, PressableScale, Screen, SectionTitle, useTabInset } from '../../components/ui';
import { useLogFeedback } from '../../hooks/useLogFeedback';
import { useToday } from '../../hooks/useToday';
import { dailyAllowance } from '../../lib/allowance.ts';
import { setupChecklist } from '../../lib/checklist.ts';
import { greeting, monthEnd, monthKey, monthStart } from '../../lib/dates.ts';
import { formatMoney, MASK } from '../../lib/money.ts';
import { shareTextFile } from '../../lib/files.ts';
import { buildBackup } from '../../lib/backup.ts';
import { frequentSpends, type FrequentSpend } from '../../lib/frequent.ts';
import { buildInsights } from '../../lib/insights.ts';
import { lastFullWeek, weekRecap } from '../../lib/recap.ts';
import { detectRecurring, reservedForMonth, upcomingBills } from '../../lib/recurring.ts';
import { isSample } from '../../lib/sample.ts';
import { streakInfo } from '../../lib/streak.ts';
import { budgetUsage, inRange } from '../../lib/stats.ts';
import { remindersSupported, requestReminderPermission } from '../../reminders';
import { useStore } from '../../store/useStore';
import { radius, space, tint, useTheme } from '../../theme';

/** Wall clock behind a module function so render stays pure; handlers and the backup nudge read it live. */
const nowMs = () => Date.now();


export default function Home() {
  const { colors } = useTheme();
  const toast = useToast();
  const inset = useTabInset();
  const logFeedback = useLogFeedback();
  const today = useToday();
  const { accounts, categories, transactions, budgets, goals, settings } = useStore();

  const currency = settings.currency;
  const hide = settings.hideAmounts;
  const fmt = useMemo(() => (m: number) => (hide ? MASK : formatMoney(m, currency)), [hide, currency]);

  const d = useMemo(() => {
    const bills = detectRecurring(transactions, today);
    const upcoming = upcomingBills(bills, today, 30);
    const reserved = reservedForMonth(bills, today);
    const allowance = dailyAllowance({ budgets, transactions, today, reserved });
    const streak = streakInfo(transactions, settings.noSpendDays, today);
    const insights = buildInsights({ transactions, categories, budgets, bills, today, fmt }).slice(0, 5);
    const frequent = frequentSpends(transactions, 6);
    const checklist = setupChecklist({ transactions, budgets, accounts, goals, settings });
    const week = lastFullWeek(today);
    const recap = weekRecap(transactions, categories, week, today);
    const month = inRange(transactions, monthStart(monthKey(today)), monthEnd(monthKey(today)));
    const usage = budgetUsage(budgets.filter((b) => b.categoryId !== null), month).sort((a, b) => b.ratio - a.ratio);
    const real = transactions.filter((t) => !isSample(t)).length;
    return { bills, upcoming, allowance, streak, insights, frequent, checklist, week, recap, usage, real };
  }, [transactions, budgets, categories, accounts, goals, settings, today, fmt]);

  const recent = transactions.slice(0, 5);
  const showRecap = d.recap.count > 0 && settings.lastRecapWeek !== d.week;

  // One nudge at a time, each asked once and only after the app has earned it.
  const nudge = (() => {
    const set = (p: Partial<typeof settings>) => void useStore.getState().updateSettings(p);
    if (remindersSupported && !settings.askedReminders && d.real >= 3) {
      return {
        icon: '🔔',
        title: 'Want a nudge to keep your streak?',
        body: 'One reminder in the evening, only if you have not logged yet. No amounts, ever.',
        primary: 'Remind me',
        onPrimary: async () => {
          const ok = await requestReminderPermission();
          set({ askedReminders: true, remindDaily: ok, remindWeekly: ok, remindBills: ok });
          toast({ message: ok ? 'Reminders on. Change them in Settings.' : 'Notifications are off for Tally. Allow them in system settings.' });
        },
        onDismiss: () => set({ askedReminders: true }),
      };
    }
    if (Platform.OS !== 'web' && !settings.lockEnabled && !settings.lockNudgeDismissed && d.real >= 5) {
      return {
        icon: '🔒',
        title: 'Keep your money private',
        body: 'Lock Tally with Face ID, fingerprint or your phone passcode.',
        primary: 'Turn on lock',
        onPrimary: async () => {
          if (!(await deviceCanAuthenticate())) return toast({ message: 'Set up a screen lock on your phone first.', tone: 'error' });
          if (await authenticate('Confirm to turn on app lock')) {
            useStore.getState().setUnlocked(true);
            set({ lockEnabled: true, lockNudgeDismissed: true });
          }
        },
        onDismiss: () => set({ lockNudgeDismissed: true }),
      };
    }
    if (d.real >= 25 && nowMs() - settings.lastBackupAt > 14 * 86_400_000) {
      return {
        icon: '💾',
        title: 'Back up your data',
        body: 'Your data lives only on this phone. Save a backup file somewhere safe.',
        primary: 'Back up now',
        onPrimary: async () => {
          try {
            await shareTextFile('backup.json', buildBackup(useStore.getState().snapshot()), 'application/json');
            set({ lastBackupAt: nowMs() });
          } catch (e) {
            toast({ message: e instanceof Error ? e.message : 'Backup failed.', tone: 'error' });
          }
        },
        onDismiss: () => set({ lastBackupAt: nowMs() }),
      };
    }
    return null;
  })();

  const logAgain = async (f: FrequentSpend) => {
    const s = useStore.getState();
    const accountId = s.accounts.some((a) => a.id === f.accountId && !a.archived) ? f.accountId : s.accounts.find((a) => !a.archived)?.id;
    if (!accountId) return;
    try {
      const t = await s.saveTransaction({ kind: 'expense', amount: f.amount, accountId, toAccountId: null, categoryId: f.categoryId, note: f.note, date: today });
      logFeedback(t);
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Could not log that.', tone: 'error' });
    }
  };

  const noSpend = async () => {
    haptic.success();
    await useStore.getState().markNoSpend(today);
    toast({ message: 'No spend today, logged on the tally' });
  };

  const startFresh = () => {
    const go = async () => {
      const n = await useStore.getState().clearSampleData();
      toast({ message: `Removed ${n} sample transactions. Your tally starts now.` });
    };
    if (Platform.OS === 'web') return void go();
    Alert.alert('Remove the sample data?', 'Your own entries, accounts and budgets stay.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove sample data', style: 'destructive', onPress: () => void go() }]);
  };

  return (
    <Screen bottomInset={inset} contentStyle={{ paddingTop: space.md }}>
      <Animated.View style={styles.top}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
          <View style={[styles.avatar, { backgroundColor: colors.brand }]}>
            <Text variant="title" style={{ color: '#fff' }}>
              {(settings.name.trim()[0] ?? 'T').toUpperCase()}
            </Text>
          </View>
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
          <IconButton icon={hide ? 'eyeOff' : 'eye'} label={hide ? 'Show amounts' : 'Hide amounts'} onPress={() => void useStore.getState().updateSettings({ hideAmounts: !hide })} />
          <IconButton icon="sliders" label="Settings" onPress={() => router.push('/settings')} />
        </View>
      </Animated.View>

      {settings.sampleData && (
        <Animated.View style={[styles.sample, { backgroundColor: tint(colors.warn, 0.14), borderColor: tint(colors.warn, 0.4) }]}>
          <Text style={{ fontSize: 20 }}>🧪</Text>
          <Text variant="caption" style={{ flex: 1, color: colors.text }}>
            You are exploring with sample data.
          </Text>
          <Button title="Start fresh" size="sm" variant="secondary" onPress={startFresh} />
        </Animated.View>
      )}

      <Animated.View>
        <AllowanceHero a={d.allowance} />
      </Animated.View>

      <Animated.View>
        <StreakCard info={d.streak} onNoSpend={noSpend} />
      </Animated.View>

      {nudge && (
        <Animated.View>
          <NudgeCard {...nudge} />
        </Animated.View>
      )}

      {!settings.checklistHidden && !settings.sampleData && (
        <Animated.View>
          <ChecklistCard items={d.checklist} onHide={() => void useStore.getState().updateSettings({ checklistHidden: true })} />
        </Animated.View>
      )}

      {showRecap && (
        <Animated.View>
          <RecapCard recap={d.recap} week={d.week} />
        </Animated.View>
      )}

      <Animated.View>
        <QuickLog items={d.frequent} categories={categories} onLog={logAgain} />
      </Animated.View>

      <Animated.View>
        <InsightsRail items={d.insights} />
      </Animated.View>

      <Animated.View>
        <BillsCard bills={d.upcoming} today={today} total={d.upcoming.reduce((s, b) => s + b.amount, 0)} />
      </Animated.View>

      {d.usage.length > 0 && (
        <Animated.View style={{ gap: 12 }}>
          <SectionTitle title="Budgets" action="See all" onAction={() => router.push('/budgets')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: space.lg }} style={{ marginHorizontal: -space.lg }}>
            {d.usage.slice(0, 6).map((u) => {
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
          </ScrollView>
        </Animated.View>
      )}

      <Animated.View style={{ gap: 12 }}>
        <SectionTitle title="Recent" action={recent.length ? 'See all' : undefined} onAction={() => router.push('/activity')} />
        {recent.length === 0 ? (
          <Card>
            <EmptyState icon="🧾" title="Nothing logged yet" body="Tap the + button, key in the amount, pick a category. That is your first mark on the tally." action={<Button title="Log a spend" icon="plus" onPress={() => router.push('/add')} />} />
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

      <Animated.View style={{ gap: 12 }}>
        <SectionTitle title="Accounts" action="Manage" onAction={() => router.push('/accounts')} />
        <AccountsRow />
      </Animated.View>
    </Screen>
  );
}

function AccountsRow() {
  const { colors } = useTheme();
  const { accounts, transactions } = useStore();
  const active = accounts.filter((a) => !a.archived);
  const bal = useMemo(() => {
    const m = new Map<string, number>(active.map((a) => [a.id, a.openingBalance]));
    for (const t of transactions) {
      if (t.kind === 'income') m.set(t.accountId, (m.get(t.accountId) ?? 0) + t.amount);
      else if (t.kind === 'expense') m.set(t.accountId, (m.get(t.accountId) ?? 0) - t.amount);
      else {
        m.set(t.accountId, (m.get(t.accountId) ?? 0) - t.amount);
        if (t.toAccountId) m.set(t.toAccountId, (m.get(t.toAccountId) ?? 0) + t.amount);
      }
    }
    return m;
  }, [active, transactions]);
  const net = active.reduce((s, a) => s + (bal.get(a.id) ?? 0), 0);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: space.lg }} style={{ marginHorizontal: -space.lg }}>
      <View style={[styles.account, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
        <Text variant="label" color="textDim">
          Net worth
        </Text>
        <Money minor={net} variant="h2" />
      </View>
      {active.map((a) => (
        <PressableScale key={a.id} onPress={() => router.push({ pathname: '/account-edit', params: { id: a.id } })} style={[styles.account, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel={`${a.name} account`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[styles.accDot, { backgroundColor: a.color }]} />
            <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>
              {a.name}
            </Text>
          </View>
          <Money minor={bal.get(a.id) ?? 0} variant="h2" />
        </PressableScale>
      ))}
      <PressableScale onPress={() => router.push('/account-edit')} style={[styles.account, styles.addAccount, { borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel="Add account">
        <Icon name="plus" size={20} color={colors.textDim} />
        <Text variant="label" color="textDim">
          Add
        </Text>
      </PressableScale>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  sample: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1 },
  budgetChip: { alignItems: 'center', gap: 6, padding: 14, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, minWidth: 108 },
  account: { width: 156, borderRadius: radius.lg, padding: 14, gap: 10, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'space-between' },
  accDot: { width: 12, height: 12, borderRadius: 6 },
  addAccount: { width: 84, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
});
