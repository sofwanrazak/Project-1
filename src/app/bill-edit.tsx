import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CADENCE_LABEL } from '../components/bills';
import { Icon } from '../components/Icon';
import { Text } from '../components/Text';
import { useToast } from '../components/Toast';
import { Button, Chip, Field, Header, IconButton, Screen, Segmented, Toggle } from '../components/ui';
import { addDays, dayLabel, fromDateStr, toDateStr, todayStr } from '../lib/dates.ts';
import { currencySymbol, parseMinor } from '../lib/money.ts';
import type { Cadence } from '../lib/types.ts';
import { useStore } from '../store/useStore';
import { radius, space, useTheme } from '../theme';

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default function BillEdit() {
  const { colors, isDark } = useTheme();
  const toast = useToast();
  const params = useLocalSearchParams<{ id?: string; name?: string; amount?: string; category?: string; date?: string }>();
  const { accounts, categories, transactions, settings } = useStore();
  const existing = useStore((s) => s.bills.find((b) => b.id === params.id));

  const expenseCats = categories.filter((c) => c.kind === 'expense' && !c.archived);
  const activeAccounts = accounts.filter((a) => !a.archived);
  const prefillAmount = Number(params.amount);

  const [name, setName] = useState(existing?.name ?? params.name ?? '');
  const [amount, setAmount] = useState(existing ? String(existing.amount / 100) : Number.isSafeInteger(prefillAmount) && prefillAmount > 0 ? String(prefillAmount / 100) : '');
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? (expenseCats.some((c) => c.id === params.category) ? (params.category as string) : null));
  const [accountId, setAccountId] = useState<string | null>(existing?.accountId ?? transactions.find((t) => activeAccounts.some((a) => a.id === t.accountId))?.accountId ?? activeAccounts[0]?.id ?? null);
  const [cadence, setCadence] = useState<Cadence>(existing?.cadence ?? 'monthly');
  const [start, setStart] = useState(existing?.startDate ?? (isDate(params.date) ? (params.date as string) : todayStr()));
  const [autoPost, setAutoPost] = useState(existing ? !!existing.autoPost : false);
  const [iosPicker, setIosPicker] = useState(false);
  const [error, setError] = useState<{ name?: string; amount?: string; category?: string }>({});

  const save = async () => {
    const minor = parseMinor(amount);
    const e: typeof error = {};
    if (!name.trim()) e.name = 'Name the bill, e.g. Unifi.';
    if (minor === null || minor <= 0) e.amount = 'Enter the amount due.';
    if (!categoryId) e.category = 'Pick a category.';
    setError(e);
    if (e.name || e.amount || e.category || minor === null || !categoryId || !accountId) return;
    try {
      await useStore.getState().saveBill({ id: existing?.id, name, amount: minor, categoryId, accountId, cadence, startDate: start, autoPost });
      router.back();
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not save.', tone: 'error' });
    }
  };

  const remove = () => {
    if (!existing) return;
    const go = async () => {
      const gone = await useStore.getState().removeBill(existing.id);
      router.back();
      if (gone) {
        toast({
          message: `${gone.name} removed`,
          actionLabel: 'Undo',
          onAction: () => void useStore.getState().saveBill({ id: gone.id, name: gone.name, amount: gone.amount, categoryId: gone.categoryId, accountId: gone.accountId, cadence: gone.cadence, startDate: gone.startDate, autoPost: !!gone.autoPost }),
        });
      }
    };
    if (Platform.OS === 'web') return void go();
    Alert.alert(`Remove “${existing.name}”?`, 'Payments you already logged stay in your history.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void go() }]);
  };

  const openPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: fromDateStr(start),
        mode: 'date',
        onChange: (ev, d) => {
          if (ev.type === 'set' && d) setStart(toDateStr(d));
        },
      });
    } else setIosPicker((v) => !v);
  };

  const when = cadence === 'weekly' ? 'every week' : cadence === 'monthly' ? 'every month' : 'every year';

  return (
    <Screen scroll={false} edges={['top', 'bottom']} header={<Header title={existing ? 'Edit bill' : 'New bill'} left={<IconButton icon="close" label="Close" onPress={() => router.back()} />} />}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl }} keyboardShouldPersistTaps="handled">
          <Field label="Name" value={name} onChangeText={(v) => { setName(v); setError((x) => ({ ...x, name: undefined })); }} placeholder="e.g. Unifi, Rent, Netflix" maxLength={40} autoFocus={!existing && !params.name} error={error.name} />
          <Field label={`Amount (${currencySymbol(settings.currency)})`} value={amount} onChangeText={(v) => { setAmount(v); setError((x) => ({ ...x, amount: undefined })); }} keyboardType="decimal-pad" placeholder="0.00" error={error.amount} />

          <View style={{ gap: 8 }}>
            <Text variant="overline" color="textFaint">
              Repeats
            </Text>
            <Segmented<Cadence> value={cadence} onChange={setCadence} options={(['weekly', 'monthly', 'yearly'] as Cadence[]).map((c) => ({ value: c, label: CADENCE_LABEL[c] }))} />
          </View>

          <View style={{ gap: 8 }}>
            <Text variant="overline" color="textFaint">
              {existing ? 'Due date' : 'First due date'}
            </Text>
            <View style={[styles.dateRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <IconButton icon="left" label="Previous day" size={36} filled={false} onPress={() => setStart(addDays(start, -1))} />
              <Pressable onPress={openPicker} style={{ flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }} accessibilityRole="button" accessibilityLabel={`Date ${dayLabel(start)}. Tap to pick`}>
                <Icon name="calendar" size={16} color={colors.textDim} />
                <Text variant="bodyStrong">{dayLabel(start)}</Text>
              </Pressable>
              <IconButton icon="right" label="Next day" size={36} filled={false} onPress={() => setStart(addDays(start, 1))} />
            </View>
            {iosPicker && Platform.OS === 'ios' && <DateTimePicker value={fromDateStr(start)} mode="date" display="inline" themeVariant={isDark ? 'dark' : 'light'} onChange={(_, d) => d && setStart(toDateStr(d))} />}
            <Text variant="caption" color="textDim">
              Due {when} from this date{start > todayStr() ? '' : ', catching up on any you have not logged'}.
            </Text>
          </View>

          <View style={{ gap: 8 }}>
            <Text variant="overline" color="textFaint">
              Category
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {expenseCats.map((c) => (
                <Chip key={c.id} label={c.name} icon={c.icon} color={c.color} selected={categoryId === c.id} onPress={() => { setCategoryId(c.id); setError((x) => ({ ...x, category: undefined })); }} />
              ))}
            </View>
            {error.category ? (
              <Text variant="caption" color="expense">
                {error.category}
              </Text>
            ) : null}
          </View>

          <View style={{ gap: 8 }}>
            <Text variant="overline" color="textFaint">
              Paid from
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {activeAccounts.map((a) => (
                <Chip key={a.id} label={a.name} color={a.color} selected={accountId === a.id} onPress={() => setAccountId(a.id)} />
              ))}
            </View>
          </View>

          <View style={[styles.autoRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">Log it automatically</Text>
              <Text variant="caption" color="textDim">
                On the due date, Tally adds the payment for you. Leave off if the amount changes or you want to confirm each one.
              </Text>
            </View>
            <Toggle label="Log it automatically" value={autoPost} onChange={setAutoPost} />
          </View>
        </ScrollView>
        <View style={{ padding: space.lg, gap: 10 }}>
          <Button title={existing ? 'Save bill' : 'Add bill'} icon="check" onPress={save} />
          {existing && <Button title="Remove bill" variant="danger" icon="trash" onPress={remove} />}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dateRow: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 4 },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
});
