import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLogFeedback } from '../hooks/useLogFeedback';
import { useToday } from '../hooks/useToday';
import { addDays, dayLabel } from '../lib/dates.ts';
import { createParser } from '../lib/smartEntry.ts';
import { formatMoney } from '../lib/money.ts';
import { useStore } from '../store/useStore';
import { radius, space, tint, useTheme } from '../theme';
import { Icon } from './Icon';
import { Perforation, Slip, useSlipColors } from './Slip';
import { Text } from './Text';
import { useDismissToast, useToast } from './Toast';
import { Button, haptic, IconButton, NO_OUTLINE, Segmented } from './ui';

const EXAMPLES = ['18 grab', '12.50 nasi lemak', '+4500 salary', '50 groceries yesterday', '8.50+3 lunch @tng', 'rm35 petronas'];

interface Overrides {
  categoryId?: string;
  accountId?: string;
  date?: string;
  kind?: 'expense' | 'income';
}

/**
 * The fast way to log: write the spend the way you would say it. The slip below shows what was understood;
 * anything the parser could not decide is a tappable chip, never a silent guess.
 */
export function SmartEntryScreen() {
  const { colors } = useTheme();
  const slip = useSlipColors();
  const toast = useToast();
  const dismissToast = useDismissToast();
  const logFeedback = useLogFeedback();
  const today = useToday();
  const { accounts, categories, transactions, settings } = useStore();

  const [text, setText] = useState('');
  const [ov, setOv] = useState<Overrides>({});
  const [pickCategory, setPickCategory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [example, setExample] = useState(0);

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  const defaultAccountId = transactions.find((t) => activeAccounts.some((a) => a.id === t.accountId))?.accountId ?? activeAccounts[0]?.id ?? null;

  const parse = useMemo(() => createParser({ today, accounts, categories, transactions, defaultAccountId }), [today, accounts, categories, transactions, defaultAccountId]);
  const p = useMemo(() => parse(text), [parse, text]);

  const kind = ov.kind ?? p.kind;
  // Flipping income/expense by hand invalidates a category chosen for the other kind.
  const categoryId = ov.categoryId ?? (ov.kind && ov.kind !== p.kind ? null : p.categoryId);
  const accountId = ov.accountId ?? p.accountId;
  const date = ov.date ?? p.date;
  const category = categories.find((c) => c.id === categoryId);
  const account = accounts.find((c) => c.id === accountId);
  const ready = p.amount !== null && !!categoryId && !!accountId;

  // Categories you use most come first, so the one you want is usually in view.
  const ranked = useMemo(() => {
    const used = new Map<string, number>();
    for (const t of transactions) if (t.categoryId) used.set(t.categoryId, (used.get(t.categoryId) ?? 0) + 1);
    return categories.filter((c) => c.kind === kind && !c.archived).sort((a, b) => (used.get(b.id) ?? 0) - (used.get(a.id) ?? 0) || a.sort - b.sort);
  }, [categories, transactions, kind]);

  // A toast from the previous log would sit over the category chips.
  useEffect(() => {
    dismissToast();
  }, [dismissToast]);

  // Cycle the placeholder through examples so the format teaches itself.
  useEffect(() => {
    if (text) return;
    const t = setInterval(() => setExample((i) => (i + 1) % EXAMPLES.length), 2600);
    return () => clearInterval(t);
  }, [text]);

  const onChange = (v: string) => {
    setText(v);
    if (!v.trim()) {
      setOv({});
      setPickCategory(false);
    }
  };

  const cycleAccount = () => {
    if (activeAccounts.length < 2) return;
    haptic.select();
    const i = activeAccounts.findIndex((a) => a.id === accountId);
    setOv((o) => ({ ...o, accountId: activeAccounts[(i + 1) % activeAccounts.length].id }));
  };

  const cycleDate = () => {
    haptic.select();
    const options = [today, addDays(today, -1), addDays(today, -2)];
    const i = options.indexOf(date);
    setOv((o) => ({ ...o, date: options[(i + 1) % options.length] }));
  };

  const log = async () => {
    if (!ready || p.amount === null || !accountId || !categoryId || saving) return;
    setSaving(true);
    try {
      const saved = await useStore.getState().saveTransaction({ kind, amount: p.amount, accountId, toAccountId: null, categoryId, note: p.note, date });
      haptic.success();
      router.back();
      if (kind === 'expense') logFeedback(saved);
    } catch (e) {
      setSaving(false);
      toast({ message: e instanceof Error ? e.message : 'Could not save.', tone: 'error' });
    }
  };

  const showPicker = pickCategory || (p.amount !== null && !categoryId);
  const amountText = p.amount === null ? '0.00' : formatMoney(p.amount, settings.currency);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.top}>
          <IconButton icon="close" label="Close" onPress={() => router.back()} />
          <Text variant="h2">New transaction</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 16, gap: 18 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Segmented value="type" onChange={() => void useStore.getState().updateSettings({ entryMode: 'keypad' })} options={[{ value: 'type', label: 'Type it' }, { value: 'keypad', label: 'Keypad' }]} />

          <View style={[styles.inputWrap, { backgroundColor: colors.card, borderColor: text ? colors.primary : colors.border }]}>
            <TextInput
              value={text}
              onChangeText={onChange}
              autoFocus
              autoCorrect={false}
              spellCheck={false}
              placeholder={EXAMPLES[example]}
              placeholderTextColor={colors.textFaint}
              selectionColor={colors.primary}
              accessibilityLabel="Describe the spend"
              returnKeyType="done"
              maxLength={120}
              onSubmitEditing={() => void log()}
              style={[{ flex: 1, minWidth: 0, fontFamily: 'BricolageGrotesque_700Bold', fontSize: 24, color: colors.text, paddingVertical: 16 }, NO_OUTLINE]}
            />
            {text ? (
              <Pressable onPress={() => onChange('')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Clear">
                <Icon name="close" size={18} color={colors.textFaint} />
              </Pressable>
            ) : null}
          </View>
          <Text variant="caption" color="textFaint" style={{ marginTop: -8 }}>
            Amount, what it was, and optionally “yesterday” or “@tng”. Start with + for income.
          </Text>

          <Slip>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <Text variant="h2" numberOfLines={2} style={{ flex: 1, color: p.note ? slip.ink : slip.dim }}>
                {p.note || 'What was it?'}
              </Text>
              <Text variant="title" tabular style={{ color: p.amount === null ? slip.dim : kind === 'income' ? '#0E8F5F' : slip.ink }} accessibilityLabel={p.amount === null ? 'No amount yet' : `Amount ${amountText}`}>
                {kind === 'income' && p.amount !== null ? '+' : ''}
                {amountText}
              </Text>
            </View>
            <Perforation color={slip.rule} />
            <View style={styles.chips}>
              <SlipChip
                label={category ? `${category.icon} ${category.name}` : 'Pick a category'}
                needed={!categoryId}
                onPress={() => setPickCategory((v) => !v)}
                hint={category ? (p.categorySource === 'history' && !ov.categoryId ? 'from your history' : undefined) : undefined}
              />
              <SlipChip label={account?.name ?? 'No account'} needed={!account} onPress={cycleAccount} />
              <SlipChip label={dayLabel(date, today)} onPress={cycleDate} />
              <SlipChip
                label={kind === 'income' ? 'Income' : 'Expense'}
                onPress={() => {
                  haptic.select();
                  setOv((o) => ({ ...o, kind: kind === 'income' ? 'expense' : 'income', categoryId: undefined }));
                }}
              />
            </View>
          </Slip>

          {showPicker && (
            <View style={{ gap: 8 }}>
              <Text variant="caption" color="textDim">
                {categoryId ? 'Change category' : 'Which category?'}
              </Text>
              <View style={styles.pickGrid}>
                {ranked.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      haptic.select();
                      setOv((o) => ({ ...o, categoryId: c.id }));
                      setPickCategory(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={c.name}
                    style={({ pressed }) => [styles.pick, { backgroundColor: c.id === categoryId ? tint(c.color, 0.22) : colors.card, borderColor: c.id === categoryId ? c.color : colors.border, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <Text style={{ fontSize: 16 }}>{c.icon}</Text>
                    <Text variant="label" color={c.id === categoryId ? 'text' : 'textDim'}>
                      {c.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        <View style={{ paddingHorizontal: space.lg, paddingBottom: 8, paddingTop: 4 }}>
          <Button title={ready ? (kind === 'income' ? 'Log income' : 'Log it') : p.amount === null ? 'Add an amount' : 'Pick a category'} icon={ready ? 'check' : undefined} onPress={() => void log()} disabled={!ready} loading={saving} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SlipChip({ label, onPress, needed, hint }: { label: string; onPress: () => void; needed?: boolean; hint?: string }) {
  const slip = useSlipColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
      style={({ pressed }) => [styles.slipChip, { borderColor: needed ? '#B35A00' : slip.chip, borderStyle: needed ? 'dashed' : 'solid', opacity: pressed ? 0.6 : 1 }]}
    >
      <Text variant="label" style={{ color: needed ? '#B35A00' : slip.ink }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.sm, minHeight: 56 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, borderRadius: radius.lg, borderWidth: 1.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slipChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1.2, maxWidth: '100%' },
  pickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1 },
});
