import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, shadow, useTheme } from '../theme';
import { Text } from './Text';

interface ToastSpec {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'default' | 'error';
}

const Ctx = createContext<(t: ToastSpec) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastSpec & { id: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { colors, isDark } = useTheme();
  const { bottom } = useSafeAreaInsets();

  const show = useCallback((t: ToastSpec) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ ...t, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), t.onAction ? 5000 : 3000);
  }, []);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <Ctx.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View
          key={toast.id}
          entering={FadeInDown.springify().damping(18)}
          exiting={FadeOutDown.duration(180)}
          style={[styles.wrap, { bottom: bottom + 96 }]}
          pointerEvents="box-none"
          accessibilityLiveRegion="polite"
        >
          <View style={[styles.toast, shadow(isDark), { backgroundColor: toast.tone === 'error' ? colors.expense : colors.cardAlt, borderColor: colors.border }]}>
            <Text variant="bodyStrong" style={{ flex: 1, color: toast.tone === 'error' ? '#fff' : colors.text }}>
              {toast.message}
            </Text>
            {toast.actionLabel ? (
              <Pressable
                hitSlop={10}
                onPress={() => {
                  toast.onAction?.();
                  setToast(null);
                }}
                accessibilityRole="button"
              >
                <Text variant="bodyStrong" style={{ color: colors.primary2 }}>
                  {toast.actionLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 18, paddingVertical: 14, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, maxWidth: 520, width: '100%' },
});
