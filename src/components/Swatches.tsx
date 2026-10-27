import { Pressable, View } from 'react-native';

import { PALETTE } from '../lib/defaults.ts';
import { useTheme } from '../theme';
import { Icon } from './Icon';
import { haptic } from './ui';

export function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {PALETTE.map((c) => (
        <Pressable
          key={c}
          onPress={() => {
            haptic.select();
            onChange(c);
          }}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === c }}
          accessibilityLabel={`Color ${c}`}
          style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c, alignItems: 'center', justifyContent: 'center', borderWidth: value === c ? 3 : 0, borderColor: colors.text }}
        >
          {value === c ? <Icon name="check" size={16} color="#fff" strokeWidth={3} /> : null}
        </Pressable>
      ))}
    </View>
  );
}
