import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { Text } from '../components/Text';
import { useToast } from '../components/Toast';
import { Button, Chip, Field, Header, IconButton, Screen } from '../components/ui';
import { currencySymbol, parseMinor } from '../lib/money.ts';
import { useStore } from '../store/useStore';
import { space, useTheme } from '../theme';

export default function BudgetEdit() {
  const { colors } = useTheme();
  const toast = useToast();
  const { overall, category } = useLocalSearchParams<{ overall?: string; category?: string }>();
  const { categories, budgets, settings } = useStore();

  const isOverall = overall === '1';
  const [categoryId, setCategoryId] = useState<string | null>(isOverall ? null : category || null);
  const existing = budgets.find((b) => b.categoryId === (isOverall ? null : categoryId));
  const [amount, setAmount] = useState(existing ? (existing.amount / 100).toFixed(2).replace(/\.00$/, '') : '');
  const [error, setError] = useState<string>();

  const cats = useMemo(() => categories.filter((c) => c.kind === 'expense' && !c.archived), [categories]);
  const title = isOverall ? 'Monthly budget' : categoryId ? `${categories.find((c) => c.id === categoryId)?.name ?? ''} budget` : 'Category budget';

  const save = async () => {
    const minor = parseMinor(amount);
    if (!isOverall && !categoryId) return setError('Pick a category.');
    if (minor === null || minor <= 0) return setError('Enter an amount greater than zero.');
    try {
      await useStore.getState().setBudget(isOverall ? null : categoryId, minor);
      router.back();
    } catch {
      toast({ message: 'Could not save the budget.', tone: 'error' });
    }
  };

  const remove = () => {
    const go = async () => {
      await useStore.getState().setBudget(isOverall ? null : categoryId, 0);
      router.back();
    };
    if (Platform.OS === 'web') return void go();
    Alert.alert('Remove this budget?', 'Your transactions are not affected.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void go() }]);
  };

  return (
    <Screen
      scroll={false}
      edges={['top', 'bottom']}
      header={<Header title={title} left={<IconButton icon="close" label="Close" onPress={() => router.back()} />} />}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
          {!isOverall && !existing && (
            <View style={{ gap: 8 }}>
              <Text variant="overline" color="textFaint">
                Category
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {cats.map((c) => (
                  <Chip key={c.id} label={c.name} icon={c.icon} color={c.color} selected={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
                ))}
              </View>
            </View>
          )}
          <Field
            label={`Amount per month (${currencySymbol(settings.currency)})`}
            value={amount}
            onChangeText={(v) => {
              setAmount(v);
              setError(undefined);
            }}
            keyboardType="decimal-pad"
            placeholder="0.00"
            autoFocus
            error={error}
            returnKeyType="done"
            onSubmitEditing={save}
          />
          <Text variant="caption" color="textDim">
            Repeats every month. {isOverall ? 'Home shows what is left of this and a safe daily amount.' : 'You will see it turn amber at 80% and red when exceeded.'}
          </Text>
        </ScrollView>
        <View style={{ padding: space.lg, gap: 10, borderTopColor: colors.border }}>
          <Button title="Save budget" icon="check" onPress={save} />
          {existing && <Button title="Remove budget" variant="danger" icon="trash" onPress={remove} />}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
