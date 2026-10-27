import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

import { Swatches } from '../components/Swatches';
import { Text } from '../components/Text';
import { useToast } from '../components/Toast';
import { Button, CategoryBadge, Field, Header, IconButton, Screen } from '../components/ui';
import { PALETTE } from '../lib/defaults.ts';
import { useStore } from '../store/useStore';
import { space, tint, useTheme } from '../theme';

const EMOJI = ['🍜', '☕', '🍔', '🛒', '🚗', '⛽', '🚌', '💡', '📱', '🛍️', '👕', '💊', '🏥', '🎬', '🎮', '✈️', '🏨', '📚', '🎓', '🏠', '🔧', '👶', '🐶', '🎁', '💇', '🏋️', '💼', '💻', '📈', '💰', '🧾', '📦'];

export default function CategoryEdit() {
  const { colors } = useTheme();
  const toast = useToast();
  const { id, kind: kindParam } = useLocalSearchParams<{ id?: string; kind?: string }>();
  const existing = useStore((s) => s.categories.find((c) => c.id === id));
  const categoryCount = useStore((s) => s.categories.length);
  const kind = existing?.kind ?? (kindParam === 'income' ? 'income' : 'expense');
  const [name, setName] = useState(existing?.name ?? '');
  const [icon, setIcon] = useState(existing?.icon ?? '📦');
  const [color, setColor] = useState(existing?.color ?? PALETTE[categoryCount % 8]);
  const [error, setError] = useState<string>();

  const save = async () => {
    if (!name.trim()) return setError('Give the category a name.');
    try {
      await useStore.getState().saveCategory({ id: existing?.id, name, icon, color, kind });
      router.back();
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Could not save.', tone: 'error' });
    }
  };

  const remove = () => {
    if (!existing) return;
    const go = async () => {
      const r = await useStore.getState().removeCategory(existing.id);
      router.back();
      toast({ message: r === 'deleted' ? 'Category deleted' : 'Category archived (it has transactions)' });
    };
    if (Platform.OS === 'web') return void go();
    Alert.alert(`Remove “${existing.name}”?`, 'Categories with transactions are archived instead so your history keeps its labels. Its budget is removed.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void go() }]);
  };

  return (
    <Screen scroll={false} edges={['top', 'bottom']} header={<Header title={existing ? 'Edit category' : `New ${kind} category`} left={<IconButton icon="close" label="Close" onPress={() => router.back()} />} />}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center' }}>
            <CategoryBadge icon={icon} color={color} size={72} />
          </View>
          <Field label="Name" value={name} onChangeText={(v) => { setName(v); setError(undefined); }} placeholder="e.g. Coffee" maxLength={30} autoFocus={!existing} error={error} />
          <View style={{ gap: 10 }}>
            <Text variant="overline" color="textFaint">Icon</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {EMOJI.map((e) => (
                <Pressable key={e} onPress={() => setIcon(e)} accessibilityRole="radio" accessibilityState={{ selected: icon === e }} accessibilityLabel={`Icon ${e}`} style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: icon === e ? tint(color, 0.25) : colors.card, borderWidth: icon === e ? 1.5 : 0, borderColor: color }}>
                  <Text style={{ fontSize: 22 }} allowFontScaling={false}>{e}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={{ gap: 10 }}>
            <Text variant="overline" color="textFaint">Color</Text>
            <Swatches value={color} onChange={setColor} />
          </View>
        </ScrollView>
        <View style={{ padding: space.lg, gap: 10 }}>
          <Button title="Save category" icon="check" onPress={save} />
          {existing?.archived ? (
            <Button title="Restore category" variant="secondary" onPress={async () => { await useStore.getState().setArchived('categories', existing.id, false); router.back(); }} />
          ) : existing ? (
            <Button title="Remove category" variant="danger" icon="trash" onPress={remove} />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
