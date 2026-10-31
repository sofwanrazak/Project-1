import { router } from 'expo-router';
import { useState } from 'react';

import { Text } from '../components/Text';
import { Card, CategoryBadge, Header, IconButton, PressableScale, Screen, Segmented } from '../components/ui';
import { useStore } from '../store/useStore';
import { useTheme } from '../theme';
import { View } from 'react-native';

export default function Categories() {
  const { colors } = useTheme();
  const categories = useStore((s) => s.categories);
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const list = categories.filter((c) => c.kind === kind);

  return (
    <Screen header={<Header title="Categories" left={<IconButton icon="left" label="Back" onPress={() => router.back()} />} right={<IconButton icon="plus" label="Add category" onPress={() => router.push({ pathname: '/category-edit', params: { kind } })} />} />}>
      <Segmented value={kind} onChange={setKind} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} />
      <Card pad={false} style={{ overflow: 'hidden' }}>
        {list.map((c, i) => (
          <PressableScale key={c.id} scaleTo={0.99} onPress={() => router.push({ pathname: '/category-edit', params: { id: c.id } })} accessibilityRole="button" accessibilityLabel={c.name}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderTopWidth: i ? 0.5 : 0, borderTopColor: colors.border, opacity: c.archived ? 0.5 : 1 }}>
              <CategoryBadge icon={c.icon} color={c.color} size={40} />
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {c.name}
              </Text>
              {c.archived ? <Text variant="caption" color="textFaint">archived</Text> : null}
            </View>
          </PressableScale>
        ))}
      </Card>
    </Screen>
  );
}
