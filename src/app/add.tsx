import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { Text } from '../components/Text';
import { useToast } from '../components/Toast';
import { Button, CategoryBadge, Chip, haptic, IconButton, PressableScale, Segmented } from '../components/ui';
import { addDays, dayLabel, fromDateStr, toDateStr, todayStr } from '../lib/dates.ts';
import { currencySymbol, parseMinor, pressKey } from '../lib/money.ts';
import type { TxKind } from '../lib/types.ts';
import { useStore } from '../store/useStore';
import { radius, space, tint, useTheme } from '../theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'] as const;

export default function AddScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { accounts, categories, transactions, settings } = useStore();
  const editing = useMemo(() => (id ? transactions.find((t) => t.id === id) : undefined), [id, transactions]);
  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived || a.id === editing?.accountId || a.id === editing?.toAccountId), [accounts, editing]);

  const [kind, setKind] = useState<TxKind>(editing?.kind ?? 'expense');
  const [amount, setAmount] = useState(editing ? (editing.amount / 100).toFixed(2).replace(/\.00$/, '') : '');
  const [categoryId, setCategoryId] = useState<string | null>(editing?.categoryId ?? null);
  const [pickedAccountId, setAccountId] = useState<string | null>(editing?.accountId ?? transactions[0]?.accountId ?? null);
  // Falls back to the first account if the remembered one was archived or none was remembered.
  const accountId = pickedAccountId && activeAccounts.some((a) => a.id === pickedAccountId) ? pickedAccountId : (activeAccounts[0]?.id ?? null);
  const [toAccountId, setToAccountId] = useState<string | null>(editing?.toAccountId ?? null);
  const [note, setNote] = useState(editing?.note ?? '');
  const [date, setDate] = useState(editing?.date ?? todayStr());
  const [noteFocused, setNoteFocused] = useState(false);
  const [iosPicker, setIosPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const accountFixed = useRef(!!editing);

  const cats = useMemo(() => categories.filter((c) => c.kind === (kind === 'income' ? 'income' : 'expense') && (!c.archived || c.id === categoryId)), [categories, kind, categoryId]);

  // Frequent notes for this kind -> one-tap fill of note + category + account.
  const frequent = useMemo(() => {
    if (kind === 'transfer') return [];
    const m = new Map<string, { note: string; n: number; categoryId: string | null; accountId: string }>();
    for (const t of transactions) {
      const key = t.note.trim().toLowerCase();
      if (t.kind !== kind || !key) continue;
      const row = m.get(key);
      if (row) row.n += 1;
      else m.set(key, { note: t.note.trim(), n: 1, categoryId: t.categoryId, accountId: t.accountId });
    }
    const q = note.trim().toLowerCase();
    return [...m.entries()]
      .filter(([k]) => (q ? k.includes(q) && k !== q : true))
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 6)
      .map(([, v]) => v);
  }, [transactions, kind, note]);

  const parsed = parseMinor(amount || '');
  const valid = parsed !== null && parsed > 0 && (kind === 'transfer' ? !!accountId && !!toAccountId && accountId !== toAccountId : !!categoryId && !!accountId);
  const tone = kind === 'income' ? colors.income : kind === 'transfer' ? colors.primary2 : colors.text;

  const onKind = (k: TxKind) => {
    setKind(k);
    setCategoryId(null);
    if (k === 'transfer' && !toAccountId) setToAccountId(activeAccounts.find((a) => a.id !== accountId)?.id ?? null);
  };

  const nudge = () => {
    haptic.warn();
    shake.set(withSequence(withTiming(-10, { duration: 50 }), withTiming(10, { duration: 80 }), withTiming(-6, { duration: 60 }), withTiming(0, { duration: 50 })));
  };

  const save = async () => {
    if (!valid || parsed === null || !accountId) {
      nudge();
      const why =
        parsed === null || parsed <= 0
          ? 'Enter an amount first.'
          : kind === 'transfer'
            ? 'Pick two different accounts.'
            : !categoryId
              ? 'Pick a category.'
              : 'Pick an account.';
      return toast({ message: why, tone: 'error' });
    }
    setSaving(true);
    try {
      await useStore.getState().saveTransaction({
        id: editing?.id,
        kind,
        amount: parsed,
        accountId,
        toAccountId: kind === 'transfer' ? toAccountId : null,
        categoryId: kind === 'transfer' ? null : categoryId,
        note,
        date,
      });
      haptic.success();
      router.back();
    } catch (e) {
      setSaving(false);
      toast({ message: e instanceof Error ? e.message : 'Could not save.', tone: 'error' });
    }
  };

  const remove = async () => {
    if (!editing) return;
    const go = async () => {
      const removed = await useStore.getState().deleteTransaction(editing.id);
      router.back();
      if (removed) toast({ message: 'Transaction deleted', actionLabel: 'Undo', onAction: () => void useStore.getState().restoreTransaction(removed) });
    };
    if (Platform.OS === 'web') return void go();
    Alert.alert('Delete this transaction?', undefined, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void go() }]);
  };

  const openPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: fromDateStr(date),
        mode: 'date',
        maximumDate: fromDateStr(addDays(todayStr(), 365)),
        onChange: (e, d) => {
          if (e.type === 'set' && d) setDate(toDateStr(d));
        },
      });
    } else setIosPicker((v) => !v);
  };

  const sym = currencySymbol(settings.currency);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.top}>
          <IconButton icon="close" label="Close" onPress={() => router.back()} />
          <Text variant="h2">{editing ? 'Edit transaction' : 'New transaction'}</Text>
          {editing ? <IconButton icon="trash" label="Delete transaction" color={colors.expense} onPress={remove} /> : <View style={{ width: 40 }} />}
        </View>

        <View style={{ paddingHorizontal: space.lg, gap: 14 }}>
          <Segmented<TxKind>
            value={kind}
            onChange={onKind}
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
              { value: 'transfer', label: 'Transfer' },
            ]}
          />
          <Animated.View style={[styles.amountRow, shakeStyle]} accessible accessibilityLabel={`Amount ${amount || '0'}`}>
            <Text variant="title" color="textDim" style={{ marginTop: 6 }}>
              {sym}
            </Text>
            <Text variant="hero" tabular style={{ color: amount ? tone : colors.textFaint }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
              {amount || '0'}
            </Text>
          </Animated.View>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 12, gap: 16 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {kind !== 'transfer' && (
            <View style={{ gap: 8 }}>
              <Text variant="overline" color="textFaint">
                Category
              </Text>
              <View style={styles.grid}>
                {cats.map((c) => {
                  const on = c.id === categoryId;
                  return (
                    <PressableScale
                      key={c.id}
                      onPress={() => setCategoryId(c.id)}
                      feedback="select"
                      scaleTo={0.92}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={c.name}
                      style={[styles.cat, { backgroundColor: on ? tint(c.color, 0.16) : 'transparent', borderColor: on ? c.color : 'transparent' }]}
                    >
                      <CategoryBadge icon={c.icon} color={c.color} size={42} />
                      <Text variant="caption" numberOfLines={1} style={{ fontSize: 11, lineHeight: 14, color: on ? colors.text : colors.textDim }}>
                        {c.name}
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>
            </View>
          )}

          <View style={{ gap: 8 }}>
            <Text variant="overline" color="textFaint">
              {kind === 'transfer' ? 'From' : 'Account'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {activeAccounts.map((a) => (
                <Chip key={a.id} label={a.name} selected={accountId === a.id} onPress={() => setAccountId(a.id)} color={a.color} />
              ))}
            </ScrollView>
            {kind === 'transfer' && (
              <>
                <Text variant="overline" color="textFaint" style={{ marginTop: 6 }}>
                  To
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {activeAccounts.filter((a) => a.id !== accountId).map((a) => (
                    <Chip key={a.id} label={a.name} selected={toAccountId === a.id} onPress={() => setToAccountId(a.id)} color={a.color} />
                  ))}
                </ScrollView>
                {activeAccounts.length < 2 && (
                  <Text variant="caption" color="warn">
                    Add a second account to record a transfer.
                  </Text>
                )}
              </>
            )}
          </View>

          <View style={{ gap: 8 }}>
            <Text variant="overline" color="textFaint">
              Note
            </Text>
            <View style={[styles.noteBox, { backgroundColor: colors.card, borderColor: noteFocused ? colors.primary : colors.border }]}>
              <TextInput
                value={note}
                onChangeText={setNote}
                onFocus={() => setNoteFocused(true)}
                onBlur={() => setNoteFocused(false)}
                placeholder="Where / what for? (optional)"
                placeholderTextColor={colors.textFaint}
                selectionColor={colors.primary}
                maxLength={120}
                accessibilityLabel="Note"
                returnKeyType="done"
                style={{ flex: 1, fontFamily: 'Inter_500Medium', fontSize: 16, color: colors.text, paddingVertical: 12 }}
              />
            </View>
            {frequent.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
                {frequent.map((f) => (
                  <Chip
                    key={f.note}
                    label={f.note}
                    onPress={() => {
                      setNote(f.note);
                      if (f.categoryId && categories.some((c) => c.id === f.categoryId && !c.archived)) setCategoryId(f.categoryId);
                      if (!accountFixed.current && activeAccounts.some((a) => a.id === f.accountId)) setAccountId(f.accountId);
                    }}
                  />
                ))}
              </ScrollView>
            )}
          </View>

          <View style={{ gap: 8 }}>
            <Text variant="overline" color="textFaint">
              Date
            </Text>
            <View style={[styles.dateRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <IconButton icon="left" label="Previous day" size={36} filled={false} onPress={() => setDate(addDays(date, -1))} />
              <Pressable onPress={openPicker} style={{ flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }} accessibilityRole="button" accessibilityLabel={`Date ${dayLabel(date)}. Tap to pick`}>
                <Icon name="calendar" size={16} color={colors.textDim} />
                <Text variant="bodyStrong">{dayLabel(date)}</Text>
              </Pressable>
              <IconButton icon="right" label="Next day" size={36} filled={false} onPress={() => setDate(addDays(date, 1))} />
            </View>
            {iosPicker && Platform.OS === 'ios' && (
              <DateTimePicker
                value={fromDateStr(date)}
                mode="date"
                display="inline"
                maximumDate={fromDateStr(addDays(todayStr(), 365))}
                themeVariant={colors.bg === '#080B14' ? 'dark' : 'light'}
                onChange={(_, d) => d && setDate(toDateStr(d))}
              />
            )}
          </View>
        </ScrollView>

        {!noteFocused && (
          <View style={[styles.bottom, { borderTopColor: colors.border }]}>
            <View style={styles.keypad}>
              {KEYS.map((k) => (
                <Pressable
                  key={k}
                  onPress={() => {
                    haptic.tap();
                    setAmount((cur) => pressKey(cur, k));
                  }}
                  onLongPress={() => k === '⌫' && setAmount('')}
                  accessibilityRole="button"
                  accessibilityLabel={k === '⌫' ? 'Delete' : k === '.' ? 'Decimal point' : k}
                  style={({ pressed }) => [styles.key, { backgroundColor: pressed ? colors.cardAlt : 'transparent' }]}
                >
                  {k === '⌫' ? <Icon name="backspace" size={24} color={colors.textDim} /> : <Text variant="title" tabular>{k}</Text>}
                </Pressable>
              ))}
            </View>
            <Button title={editing ? 'Save changes' : kind === 'transfer' ? 'Save transfer' : kind === 'income' ? 'Add income' : 'Add expense'} onPress={save} loading={saving} icon="check" />
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.sm, minHeight: 56 },
  amountRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 6, paddingVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  cat: { width: '25%', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 2, borderRadius: radius.md, borderWidth: 1.5 },
  noteBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1.5 },
  dateRow: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 4 },
  bottom: { paddingHorizontal: space.lg, paddingTop: 6, paddingBottom: 8, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  keypad: { flexDirection: 'row', flexWrap: 'wrap' },
  key: { width: '33.333%', height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
});
