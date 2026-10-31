import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { useCelebrate } from '../components/celebrate';
import { Jar } from '../components/goals';
import { useMoney } from '../components/Money';
import { Text } from '../components/Text';
import { useToast } from '../components/Toast';
import { Button, Chip, Field, haptic, Header, IconButton, Screen, Segmented } from '../components/ui';
import { goalPct } from '../lib/goals.ts';
import { currencySymbol, parseMinor } from '../lib/money.ts';
import { useStore } from '../store/useStore';
import { space } from '../theme';

const QUICK = [1000, 5000, 10000, 50000];
const STEP_WORDS: Record<number, string> = { 25: 'A quarter of the way there', 50: 'Halfway there', 75: 'Three quarters done' };

export default function GoalAdd() {
  const toast = useToast();
  const fmt = useMoney();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const goal = useStore((s) => s.goals.find((g) => g.id === id));
  const currency = useStore((s) => s.settings.currency);
  const [mode, setMode] = useState<'add' | 'take'>('add');
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();

  if (!goal) return null;
  const minor = parseMinor(text) ?? 0;
  const after = Math.max(0, goal.saved + (mode === 'add' ? minor : -minor));

  const save = async () => {
    if (minor <= 0) return setError('Enter an amount.');
    if (mode === 'take' && minor > goal.saved) return setError(`Only ${fmt(goal.saved)} is saved so far.`);
    try {
      const { step } = await useStore.getState().addToGoal(goal.id, mode === 'add' ? minor : -minor);
      router.back();
      if (step === 100) useCelebrate.getState().show({ emoji: goal.icon, title: `${goal.name} reached`, body: `You saved ${fmt(goal.target)}. That took real discipline.`, cta: 'Amazing' });
      else if (step) {
        haptic.success();
        toast({ message: `${STEP_WORDS[step]} for ${goal.name}` });
      } else toast({ message: mode === 'add' ? `Added ${fmt(minor)} to ${goal.name}` : `Took ${fmt(minor)} out of ${goal.name}` });
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Could not update the goal.', tone: 'error' });
    }
  };

  return (
    <Screen scroll={false} edges={['top', 'bottom']} header={<Header title={goal.name} left={<IconButton icon="close" label="Close" onPress={() => router.back()} />} />}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Jar pct={goalPct({ saved: after, target: goal.target })} color={goal.color} emoji={goal.icon} />
            <Text variant="title" tabular>
              {fmt(after)}
            </Text>
            <Text variant="caption" color="textDim">
              of {fmt(goal.target)}
            </Text>
          </View>
          <Segmented value={mode} onChange={setMode} options={[{ value: 'add', label: 'Add money' }, { value: 'take', label: 'Take out' }]} />
          <Field label={`Amount (${currencySymbol(currency)})`} value={text} onChangeText={(v) => { setText(v); setError(undefined); }} keyboardType="decimal-pad" placeholder="0.00" autoFocus error={error} returnKeyType="done" onSubmitEditing={save} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {QUICK.map((q) => (
              <Chip key={q} label={`+${fmt(q)}`} onPress={() => { setText(String((minor + q) / 100)); setError(undefined); }} />
            ))}
          </View>
        </ScrollView>
        <View style={{ padding: space.lg }}>
          <Button title={mode === 'add' ? 'Add to goal' : 'Take out'} icon="check" onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
