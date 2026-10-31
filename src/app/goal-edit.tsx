import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

import { Jar } from '../components/goals';
import { Swatches } from '../components/Swatches';
import { Text } from '../components/Text';
import { useToast } from '../components/Toast';
import { Button, Field, Header, IconButton, Screen } from '../components/ui';
import { PALETTE } from '../lib/defaults.ts';
import { goalPct } from '../lib/goals.ts';
import { currencySymbol, parseMinor } from '../lib/money.ts';
import { useStore } from '../store/useStore';
import { space, tint, useTheme } from '../theme';

const EMOJI = ['🛟', '✈️', '📱', '🕋', '💍', '🏠', '🚗', '🎓', '💻', '👶', '🎁', '🏝️', '📷', '🎮', '🏍️', '💰'];

export default function GoalEdit() {
  const { colors } = useTheme();
  const toast = useToast();
  const params = useLocalSearchParams<{ id?: string; name?: string; icon?: string }>();
  const existing = useStore((s) => s.goals.find((g) => g.id === params.id));
  const count = useStore((s) => s.goals.length);
  const currency = useStore((s) => s.settings.currency);
  const [name, setName] = useState(existing?.name ?? params.name ?? '');
  const [icon, setIcon] = useState(existing?.icon ?? params.icon ?? '🎯');
  const [color, setColor] = useState(existing?.color ?? PALETTE[(count + 2) % 8]);
  const [target, setTarget] = useState(existing ? String(existing.target / 100) : '');
  const [error, setError] = useState<{ name?: string; target?: string }>({});

  const save = async () => {
    const minor = parseMinor(target);
    const e: typeof error = {};
    if (!name.trim()) e.name = 'Name your goal.';
    if (minor === null || minor <= 0) e.target = 'Enter how much you need.';
    setError(e);
    if (e.name || e.target || minor === null) return;
    try {
      await useStore.getState().saveGoal({ id: existing?.id, name, icon, color, target: minor });
      router.back();
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not save.', tone: 'error' });
    }
  };

  const remove = () => {
    if (!existing) return;
    const go = async () => {
      const gone = await useStore.getState().removeGoal(existing.id);
      router.back();
      if (gone) toast({ message: 'Goal deleted' });
    };
    if (Platform.OS === 'web') return void go();
    Alert.alert(`Delete “${existing.name}”?`, 'The money you tracked toward it is not touched in your accounts.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void go() }]);
  };

  return (
    <Screen scroll={false} edges={['top', 'bottom']} header={<Header title={existing ? 'Edit goal' : 'New goal'} left={<IconButton icon="close" label="Close" onPress={() => router.back()} />} />}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center' }}>
            <Jar pct={existing ? goalPct(existing) : 0} color={color} emoji={icon} />
          </View>
          <Field label="Goal" value={name} onChangeText={(v) => { setName(v); setError((x) => ({ ...x, name: undefined })); }} placeholder="e.g. Langkawi trip" maxLength={40} autoFocus={!existing && !params.name} error={error.name} />
          <Field label={`How much do you need (${currencySymbol(currency)})`} value={target} onChangeText={(v) => { setTarget(v); setError((x) => ({ ...x, target: undefined })); }} keyboardType="decimal-pad" placeholder="0.00" error={error.target} />
          <View style={{ gap: 10 }}>
            <Text variant="overline" color="textFaint">
              Icon
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {EMOJI.map((e) => (
                <Pressable key={e} onPress={() => setIcon(e)} accessibilityRole="radio" accessibilityState={{ selected: icon === e }} accessibilityLabel={`Icon ${e}`} style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: icon === e ? tint(color, 0.25) : colors.card, borderWidth: icon === e ? 1.5 : 0, borderColor: color }}>
                  <Text style={{ fontSize: 22 }} allowFontScaling={false}>
                    {e}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={{ gap: 10 }}>
            <Text variant="overline" color="textFaint">
              Colour
            </Text>
            <Swatches value={color} onChange={setColor} />
          </View>
        </ScrollView>
        <View style={{ padding: space.lg, gap: 10 }}>
          <Button title={existing ? 'Save goal' : 'Create goal'} icon="check" onPress={save} />
          {existing && <Button title="Delete goal" variant="danger" icon="trash" onPress={remove} />}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
