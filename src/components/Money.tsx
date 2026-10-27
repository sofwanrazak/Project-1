import type { StyleProp, TextStyle } from 'react-native';

import { formatMoney, MASK } from '../lib/money.ts';
import { useStore } from '../store/useStore';
import { Text, type Variant } from './Text';

/** Single place every amount is rendered, so "hide amounts" and the currency setting always apply. */
export function useMoney() {
  const currency = useStore((s) => s.settings.currency);
  const hide = useStore((s) => s.settings.hideAmounts);
  return (minor: number, opts?: { compact?: boolean; sign?: boolean }) => (hide ? MASK : formatMoney(minor, currency, opts));
}

export function Money({
  minor,
  variant = 'bodyStrong',
  color,
  compact,
  sign,
  style,
}: {
  minor: number;
  variant?: Variant;
  color?: string;
  compact?: boolean;
  sign?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const fmt = useMoney();
  return (
    <Text variant={variant} tabular color={color} style={style} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
      {fmt(minor, { compact, sign })}
    </Text>
  );
}
