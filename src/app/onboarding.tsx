import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCelebrate } from '../components/celebrate';
import { Icon } from '../components/Icon';
import { Text } from '../components/Text';
import { TallyGroup, TickMeter } from '../components/Tally';
import { useToast } from '../components/Toast';
import { Banknote } from '../components/Banknote';
import { Button, Chip, Field, haptic, IconButton, NO_OUTLINE, PressableScale, Toggle } from '../components/ui';
import { suggestBudget } from '../lib/budgetPlan.ts';
import { CURRENCIES } from '../lib/defaults.ts';
import { currencySymbol, formatMoney, parseMinor } from '../lib/money.ts';
import type { MoneyGoal } from '../lib/types.ts';
import { useStore } from '../store/useStore';
import { NOTE, radius, space, tint, useTheme } from '../theme';

const GOALS: { id: MoneyGoal; icon: string; title: string; sub: string }[] = [
  { id: 'budget', icon: '🎯', title: 'Stick to a budget', sub: 'Know what I can spend each day' },
  { id: 'save', icon: '🌱', title: 'Save more', sub: 'Keep a bigger share of what I earn' },
  { id: 'track', icon: '🔍', title: 'See where it goes', sub: 'Understand my spending first' },
  { id: 'debt', icon: '🧗', title: 'Pay down debt', sub: 'Free up cash to clear what I owe' },
];

/** One-tap first logs. Real categories, so the first transaction is already useful data. */
const FIRST: { icon: string; label: string; note: string; category: string; amount: number }[] = [
  { icon: '☕', label: 'Coffee', note: 'Coffee', category: 'Food & Drink', amount: 600 },
  { icon: '🍜', label: 'Lunch', note: 'Lunch', category: 'Food & Drink', amount: 1200 },
  { icon: '🚗', label: 'Grab ride', note: 'Grab', category: 'Transport', amount: 1500 },
  { icon: '🛒', label: 'Groceries', note: 'Groceries', category: 'Groceries', amount: 5000 },
];

const INCOME_CHIPS = [200000, 300000, 450000, 600000, 800000];
const STEPS = 5;

export default function Onboarding() {
  const { colors } = useTheme();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<MoneyGoal>('budget');
  const [incomeText, setIncomeText] = useState('');
  const [override, setOverride] = useState<number | null>(null);
  const [split, setSplit] = useState(true);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('MYR');
  const [cash, setCash] = useState('');
  const [busy, setBusy] = useState(false);

  const sym = currencySymbol(currency);
  const money = (m: number) => formatMoney(m, currency, { compact: true });
  const income = parseMinor(incomeText.replace(/[^0-9.]/g, '')) ?? 0;
  const suggestion = useMemo(() => suggestBudget(income, goal), [income, goal]);
  // The plan follows the income and goal until the user nudges it, then their number wins.
  const budget = Math.min(override ?? suggestion.overall, income);
  const next = () => {
    haptic.tap();
    setStep((s) => Math.min(s + 1, STEPS - 1));
  };

  const finish = async (opts: { first?: (typeof FIRST)[number]; sample?: boolean }) => {
    const trimmed = cash.trim();
    const neg = trimmed.startsWith('-');
    const opening = trimmed === '' ? 0 : parseMinor(neg ? trimmed.slice(1) : trimmed);
    if (opening === null) {
      setStep(3);
      return toast({ message: 'Check the starting cash amount.', tone: 'error' });
    }
    setBusy(true);
    try {
      await useStore.getState().completeOnboarding({
        name,
        currency,
        openingBalance: neg ? -opening : opening,
        goal,
        income,
        overallBudget: budget,
        categoryBudgets: split,
        sample: !!opts.sample,
        firstExpense: opts.first ? { amount: opts.first.amount, note: opts.first.note, categoryName: opts.first.category } : undefined,
      });
      if (opts.first) useCelebrate.getState().show({ emoji: '🎉', title: 'First mark on the tally', body: 'Come back tomorrow and log again to start a streak.', cta: 'Show me' });
      else if (opts.sample) useCelebrate.getState().show({ emoji: '🧪', title: 'Sample data loaded', body: 'Have a look around. Tap “Start fresh” on Home whenever you are ready.', cta: 'Explore' });
    } catch {
      setBusy(false);
      toast({ message: 'Could not set things up. Please try again.', tone: 'error' });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.top}>
        <View style={{ width: 44 }}>{step > 0 && <IconButton icon="left" label="Back" size={40} onPress={() => setStep((s) => s - 1)} />}</View>
        <View style={{ flex: 1, alignItems: 'center' }} accessible accessibilityLabel={`Step ${step + 1} of ${STEPS}`}>
          {/* The whole group is always visible, faint; each step inks one more stroke. */}
          <View style={{ width: 51, height: 26 }}>
            <View style={StyleSheet.absoluteFill}>
              <TallyGroup strokes={4} slashed height={26} color={colors.border} width={3} animate={false} />
            </View>
            <View style={StyleSheet.absoluteFill}>
              <TallyGroup key={step} strokes={Math.min(step + 1, 4)} slashed={step >= 4} height={26} color={colors.text} width={3} />
            </View>
          </View>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View key={step} entering={FadeInRight.duration(260)} style={{ gap: 22 }}>
            {step === 0 && (
              <>
                <View style={[styles.logo, { backgroundColor: colors.brand }]}>
                  <TallyGroup strokes={4} slashed height={48} color="#fff" width={4.4} />
                </View>
                <View style={{ gap: 10 }}>
                  <Text variant="display">Spend with a plan, not a guess.</Text>
                  <Text variant="body" color="textDim">
                    Tally tells you what is safe to spend today. Set up takes about a minute. No account, no ads, and your data stays on this phone.
                  </Text>
                </View>
                {/* A look at the payoff before asking for anything: this is what the home screen says every day. */}
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: 8 }}>
                  <Banknote color={NOTE.safe} radius={24}>
                    <View style={{ padding: 20, gap: 8 }}>
                      <Text variant="bodyStrong" style={{ color: '#fff', opacity: 0.92 }}>
                        Safe to spend today
                      </Text>
                      <Text variant="hero" tabular style={{ color: '#fff', fontSize: 46, lineHeight: 50 }}>
                        {formatMoney(8640, currency)}
                      </Text>
                      <TickMeter ratio={0.38} on="#FFFFFF" off="rgba(255,255,255,0.28)" ticks={24} height={16} />
                      <Text variant="caption" style={{ color: '#fff', opacity: 0.92 }}>
                        {formatMoney(5360, currency)} of {formatMoney(14000, currency)} today
                      </Text>
                    </View>
                  </Banknote>
                  <Text variant="caption" color="textFaint" style={{ textAlign: 'center' }}>
                    Your home screen, from day one.
                  </Text>
                </View>
              </>
            )}

            {step === 1 && (
              <>
                <Text variant="display">What matters most right now?</Text>
                <View style={{ gap: 10 }}>
                  {GOALS.map((g) => (
                    <PressableScale
                      key={g.id}
                      feedback="select"
                      scaleTo={0.98}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: goal === g.id }}
                      onPress={() => {
                        setGoal(g.id);
                        setOverride(null);
                        setTimeout(next, 220);
                      }}
                      style={[styles.option, { backgroundColor: goal === g.id ? tint(colors.primary, 0.14) : colors.card, borderColor: goal === g.id ? colors.primary : colors.border }]}
                    >
                      <Text style={{ fontSize: 30 }} allowFontScaling={false}>
                        {g.icon}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text variant="h2">{g.title}</Text>
                        <Text variant="caption" color="textDim">
                          {g.sub}
                        </Text>
                      </View>
                      {goal === g.id && <Icon name="check" size={20} color={colors.primary} strokeWidth={3} />}
                    </PressableScale>
                  ))}
                </View>
              </>
            )}

            {step === 2 && (
              <>
                <View style={{ gap: 6 }}>
                  <Text variant="display">What comes in each month?</Text>
                  <Text variant="body" color="textDim">
                    Salary, allowance, side income. We use it to suggest a budget you can change.
                  </Text>
                </View>
                <View style={[styles.income, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text variant="title" color="textDim">
                    {sym}
                  </Text>
                  <TextInput
                    value={incomeText}
                    onChangeText={(v) => {
                      setIncomeText(v);
                      setOverride(null);
                    }}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textFaint}
                    selectionColor={colors.primary}
                    accessibilityLabel="Monthly income"
                    maxLength={9}
                    style={[{ flex: 1, minWidth: 0, fontFamily: 'BricolageGrotesque_800ExtraBold', fontSize: 40, color: colors.text, padding: 0 }, NO_OUTLINE]}
                  />
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {INCOME_CHIPS.map((c) => (
                    <Chip
                      key={c}
                      label={money(c)}
                      selected={income === c}
                      onPress={() => {
                        setIncomeText(String(c / 100));
                        setOverride(null);
                      }}
                    />
                  ))}
                </View>

                {income > 0 && (
                  <Animated.View entering={FadeInRight.duration(220)} style={[styles.plan, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text variant="h2">Your plan</Text>
                    <View style={styles.splitBar} accessible accessibilityLabel={`Spend ${money(budget)}, keep ${money(income - budget)}`}>
                      <View style={{ flex: Math.max(budget, 1), backgroundColor: colors.brand, borderRadius: 6 }} />
                      <View style={{ flex: Math.max(income - budget, 1), backgroundColor: colors.income, borderRadius: 6 }} />
                    </View>
                    <View style={styles.planRow}>
                      <View>
                        <Text variant="caption" color="textDim">
                          Spend
                        </Text>
                        <Text variant="title" tabular>
                          {money(budget)}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text variant="caption" color="textDim">
                          Keep
                        </Text>
                        <Text variant="title" tabular style={{ color: colors.income }}>
                          {money(income - budget)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.stepper}>
                      <Button title="−RM100" size="sm" variant="secondary" onPress={() => setOverride(Math.max(0, budget - 10000))} style={{ flex: 1 }} />
                      <Button title="+RM100" size="sm" variant="secondary" onPress={() => setOverride(Math.min(income, budget + 10000))} style={{ flex: 1 }} />
                    </View>
                    <Text variant="caption" color="textDim">
                      About {money(Math.round(budget / 30))} a day to spend.
                    </Text>
                    <View style={styles.planRow}>
                      <Text variant="bodyStrong" style={{ flex: 1 }}>
                        Split by category
                      </Text>
                      <Toggle label="Split by category" value={split} onChange={setSplit} />
                    </View>
                  </Animated.View>
                )}
              </>
            )}

            {step === 3 && (
              <>
                <Text variant="display">A few details</Text>
                <Field label="What should we call you? (optional)" value={name} onChangeText={setName} maxLength={60} placeholder="Your name" returnKeyType="next" />
                <View style={{ gap: 8 }}>
                  <Text variant="overline" color="textFaint">
                    Currency
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {CURRENCIES.map((c) => (
                      <Chip key={c.code} label={c.code} selected={currency === c.code} onPress={() => setCurrency(c.code)} />
                    ))}
                  </View>
                </View>
                <Field label="Cash in your wallet right now (optional)" value={cash} onChangeText={setCash} keyboardType="numbers-and-punctuation" placeholder="0.00" returnKeyType="done" />
              </>
            )}

            {step === 4 && (
              <>
                <View style={{ gap: 6 }}>
                  <Text variant="display">Log your first spend</Text>
                  <Text variant="body" color="textDim">
                    Pick something you bought recently. You can edit or delete it any time.
                  </Text>
                </View>
                <View style={styles.firstGrid}>
                  {FIRST.map((f) => (
                    <PressableScale key={f.label} disabled={busy} feedback="tap" accessibilityRole="button" accessibilityLabel={`Log ${f.label} ${money(f.amount)}`} onPress={() => void finish({ first: f })} style={[styles.first, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Text style={{ fontSize: 34 }} allowFontScaling={false}>
                        {f.icon}
                      </Text>
                      <Text variant="h2">{f.label}</Text>
                      <Text variant="caption" color="textDim" tabular>
                        {formatMoney(f.amount, currency)}
                      </Text>
                    </PressableScale>
                  ))}
                </View>
                <Pressable onPress={() => void finish({ sample: true })} disabled={busy} accessibilityRole="button" style={[styles.sampleCard, { borderColor: colors.border }]}>
                  <Text style={{ fontSize: 24 }}>🧪</Text>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">Explore with sample data first</Text>
                    <Text variant="caption" color="textDim">
                      See a full month of spending. Remove it in one tap.
                    </Text>
                  </View>
                  <Icon name="right" size={18} color={colors.textFaint} />
                </Pressable>
              </>
            )}
          </Animated.View>
        </ScrollView>

        <View style={styles.footer}>
          {step === 0 && <Button title="Get started" onPress={next} />}
          {step === 2 && (
            <>
              <Button title={income > 0 ? 'Use this plan' : 'Continue'} onPress={next} disabled={incomeText.length > 0 && income === 0} />
              {income === 0 && <Button title="Skip, I’ll set a budget later" variant="ghost" onPress={next} />}
            </>
          )}
          {step === 3 && <Button title="Continue" onPress={next} />}
          {step === 4 && <Button title="I’ll log my own later" variant="ghost" onPress={() => void finish({})} loading={busy} />}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.sm, minHeight: 52 },
  body: { padding: space.lg, paddingTop: space.xl, paddingBottom: 24 },
  footer: { padding: space.lg, paddingTop: 8, gap: 6 },
  logo: { width: 96, height: 96, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.lg, borderWidth: 1.5 },
  income: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 14, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  plan: { gap: 12, padding: 18, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  splitBar: { flexDirection: 'row', gap: 4, height: 12 },
  planRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepper: { flexDirection: 'row', gap: 10 },
  firstGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  first: { width: '47.5%', alignItems: 'center', gap: 4, paddingVertical: 20, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  sampleCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed' },
});
