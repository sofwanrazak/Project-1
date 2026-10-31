import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { useStore } from '../store/useStore';

export interface Colors {
  bg: string;
  card: string;
  cardAlt: string;
  border: string;
  text: string;
  textDim: string;
  textFaint: string;
  /** Accent for links, selected states and icons. */
  primary: string;
  /** Solid brand fill (buttons, FAB): constant across themes so white text always passes contrast. */
  brand: string;
  primary2: string;
  income: string;
  expense: string;
  warn: string;
  /** Savings goals. */
  goal: string;
  onPrimary: string;
  scrim: string;
  tabBar: string;
}

/**
 * Palette taken from the ringgit notes: RM1 blue, RM5 green, RM10 red, RM20 orange, RM50 teal, RM100 purple.
 * Each colour carries one meaning everywhere in the app.
 */
const dark: Colors = {
  bg: '#090D18',
  card: '#121828',
  cardAlt: '#1B2338',
  border: 'rgba(255,255,255,0.08)',
  text: '#F3F5FB',
  textDim: '#A5AEC6',
  textFaint: '#7480A0',
  primary: '#6C93FF',
  brand: '#2F5FEA',
  primary2: '#2CC4BE',
  income: '#3DD598',
  expense: '#FF6F66',
  warn: '#FFAA45',
  goal: '#A98BFF',
  onPrimary: '#FFFFFF',
  scrim: 'rgba(4,6,12,0.6)',
  tabBar: 'rgba(12,16,28,0.72)',
};

const light: Colors = {
  bg: '#F3F5FA',
  card: '#FFFFFF',
  cardAlt: '#ECEFF7',
  border: 'rgba(14,19,38,0.09)',
  text: '#0E1326',
  textDim: '#4F5978',
  textFaint: '#7A84A3',
  primary: '#2552D8',
  brand: '#2F5FEA',
  primary2: '#0B8F8A',
  income: '#0E8F5F',
  expense: '#D0372D',
  warn: '#B35A00',
  goal: '#6D3FD6',
  onPrimary: '#FFFFFF',
  scrim: 'rgba(14,19,38,0.4)',
  tabBar: 'rgba(255,255,255,0.78)',
};

/** The four states a ringgit-note hero card can take. Whites pass 4:1 on each. */
export const NOTE = {
  safe: '#16875A',
  tight: '#C96A08',
  over: '#D0372D',
  none: '#2B57D6',
} as const;

export interface Theme {
  colors: Colors;
  isDark: boolean;
}

const ThemeContext = createContext<Theme>({ colors: dark, isDark: true });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const pref = useStore((s) => s.settings.theme);
  const system = useColorScheme();
  const isDark = pref === 'system' ? system !== 'light' : pref === 'dark';
  const value = useMemo<Theme>(() => ({ colors: isDark ? dark : light, isDark }), [isDark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

export const radius = { sm: 10, md: 16, lg: 22, xl: 30, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Soft elevation that reads on both themes. */
export const shadow = (isDark: boolean) =>
  isDark
    ? ({ shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 } as const)
    : ({ shadowColor: '#2A3366', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 } as const);

export const gradients = {
  primary: ['#2F5FEA', '#2F5FEA'] as const,
};

/** Tint a hex color with alpha, e.g. tint('#7C5CFF', 0.15). */
export function tint(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
