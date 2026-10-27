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
  primary: string;
  primary2: string;
  income: string;
  expense: string;
  warn: string;
  onPrimary: string;
  scrim: string;
  tabBar: string;
}

const dark: Colors = {
  bg: '#080B14',
  card: '#121829',
  cardAlt: '#1A2238',
  border: 'rgba(255,255,255,0.08)',
  text: '#F3F5FB',
  textDim: '#A3ACC6',
  textFaint: '#6B7595',
  primary: '#8B6FFF',
  primary2: '#22D3EE',
  income: '#34D399',
  expense: '#FB7185',
  warn: '#FBBF24',
  onPrimary: '#FFFFFF',
  scrim: 'rgba(4,6,12,0.6)',
  tabBar: 'rgba(12,16,28,0.72)',
};

const light: Colors = {
  bg: '#F3F4FA',
  card: '#FFFFFF',
  cardAlt: '#ECEEF8',
  border: 'rgba(14,19,38,0.09)',
  text: '#0E1326',
  textDim: '#515B7C',
  textFaint: '#8089A8',
  primary: '#6240F0',
  primary2: '#0891B2',
  income: '#0E8F5F',
  expense: '#D93A52',
  warn: '#B45309',
  onPrimary: '#FFFFFF',
  scrim: 'rgba(14,19,38,0.4)',
  tabBar: 'rgba(255,255,255,0.78)',
};

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
  primary: ['#7C5CFF', '#22D3EE'] as const,
  income: ['#10B981', '#34D399'] as const,
  danger: ['#F43F5E', '#FB923C'] as const,
};

/** Tint a hex color with alpha, e.g. tint('#7C5CFF', 0.15). */
export function tint(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
