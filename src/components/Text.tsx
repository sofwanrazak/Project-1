import { StyleSheet, Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { useTheme, type Colors } from '../theme';

export type Variant = 'hero' | 'display' | 'title' | 'h2' | 'amount' | 'body' | 'bodyStrong' | 'caption' | 'label' | 'overline';

const FONT = {
  400: 'Inter_400Regular',
  500: 'Inter_500Medium',
  600: 'Inter_600SemiBold',
  700: 'Inter_700Bold',
  800: 'Inter_800ExtraBold',
} as const;

// Bricolage Grotesque carries headlines and every number; Inter keeps body copy quiet.
const DISPLAY = {
  600: 'BricolageGrotesque_600SemiBold',
  700: 'BricolageGrotesque_700Bold',
  800: 'BricolageGrotesque_800ExtraBold',
} as const;

const variants: Record<Variant, TextStyle & { w: keyof typeof FONT; disp?: boolean }> = {
  hero: { w: 800, disp: true, fontSize: 52, lineHeight: 56, letterSpacing: -2 },
  display: { w: 800, disp: true, fontSize: 32, lineHeight: 38, letterSpacing: -1 },
  title: { w: 700, disp: true, fontSize: 22, lineHeight: 28, letterSpacing: -0.5 },
  h2: { w: 700, disp: true, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  amount: { w: 600, disp: true, fontSize: 16, lineHeight: 21 },
  body: { w: 500, fontSize: 15, lineHeight: 21 },
  bodyStrong: { w: 600, fontSize: 15, lineHeight: 21 },
  caption: { w: 500, fontSize: 13, lineHeight: 18 },
  label: { w: 600, fontSize: 12, lineHeight: 16, letterSpacing: 0.1 },
  overline: { w: 600, fontSize: 12, lineHeight: 16 },
};

export interface Props extends TextProps {
  variant?: Variant;
  color?: keyof Colors | (string & {});
  /** Tabular figures keep columns of money from jittering. */
  tabular?: boolean;
}

export function Text({ variant = 'body', color = 'text', tabular, style, ...rest }: Props) {
  const { colors } = useTheme();
  const { w, disp, ...v } = variants[variant];
  const family = disp ? DISPLAY[w as keyof typeof DISPLAY] : FONT[w];
  const resolved = color in colors ? colors[color as keyof Colors] : color;
  // A bare fontSize override (emoji, big glyphs) would otherwise keep the variant's smaller lineHeight and get clipped.
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const autoLine = flat?.fontSize && flat.lineHeight === undefined ? { lineHeight: Math.round(flat.fontSize * 1.25) } : null;
  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={1.3}
      {...rest}
      style={[{ fontFamily: family, color: resolved }, v, tabular && { fontVariant: ['tabular-nums'] }, style, autoLine]}
    />
  );
}
