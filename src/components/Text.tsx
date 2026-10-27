import { StyleSheet, Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { useTheme, type Colors } from '../theme';

export type Variant = 'hero' | 'display' | 'title' | 'h2' | 'body' | 'bodyStrong' | 'caption' | 'label' | 'overline';

const FONT = {
  400: 'Inter_400Regular',
  500: 'Inter_500Medium',
  600: 'Inter_600SemiBold',
  700: 'Inter_700Bold',
  800: 'Inter_800ExtraBold',
} as const;

const variants: Record<Variant, TextStyle & { w: keyof typeof FONT }> = {
  hero: { w: 800, fontSize: 44, lineHeight: 50, letterSpacing: -1.5 },
  display: { w: 800, fontSize: 32, lineHeight: 38, letterSpacing: -1 },
  title: { w: 700, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  h2: { w: 700, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { w: 500, fontSize: 15, lineHeight: 21 },
  bodyStrong: { w: 600, fontSize: 15, lineHeight: 21 },
  caption: { w: 500, fontSize: 13, lineHeight: 18 },
  label: { w: 600, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
  overline: { w: 700, fontSize: 11, lineHeight: 14, letterSpacing: 1, textTransform: 'uppercase' },
};

export interface Props extends TextProps {
  variant?: Variant;
  color?: keyof Colors | (string & {});
  /** Tabular figures keep columns of money from jittering. */
  tabular?: boolean;
}

export function Text({ variant = 'body', color = 'text', tabular, style, ...rest }: Props) {
  const { colors } = useTheme();
  const { w, ...v } = variants[variant];
  const resolved = color in colors ? colors[color as keyof Colors] : color;
  // A bare fontSize override (emoji, big glyphs) would otherwise keep the variant's smaller lineHeight and get clipped.
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const autoLine = flat?.fontSize && flat.lineHeight === undefined ? { lineHeight: Math.round(flat.fontSize * 1.25) } : null;
  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={1.3}
      {...rest}
      style={[{ fontFamily: FONT[w], color: resolved }, v, tabular && { fontVariant: ['tabular-nums'] }, style, autoLine]}
    />
  );
}
