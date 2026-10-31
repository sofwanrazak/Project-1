import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, shadow, space, tint, useTheme } from '../theme';
import { PRESS, SETTLE } from '../theme/motion';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/* ---------------------------------- haptics --------------------------------- */

const native = Platform.OS !== 'web';
export const haptic = {
  tap: () => native && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  select: () => native && Haptics.selectionAsync().catch(() => {}),
  success: () => native && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warn: () => native && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
};

/** Browsers draw a focus ring around inputs that already show their own focus border. */
export const NO_OUTLINE = { outlineWidth: 0 } as const;

/* ------------------------------- press feedback ------------------------------ */

interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  feedback?: 'tap' | 'select' | 'none';
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressableScale({ style, scaleTo = 0.97, feedback = 'none', onPress, onPressIn, onPressOut, ...rest }: PressableScaleProps) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      style={[style, anim]}
      onPressIn={(e) => {
        s.set(withSpring(scaleTo, PRESS));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.set(withSpring(1, PRESS));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (feedback !== 'none') haptic[feedback]();
        onPress?.(e);
      }}
    />
  );
}

/* ----------------------------------- layout ---------------------------------- */

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  /** Extra bottom padding, e.g. to clear the floating tab bar. */
  bottomInset?: number;
  edges?: ('top' | 'bottom')[];
  contentStyle?: StyleProp<ViewStyle>;
  header?: ReactNode;
}

export function Screen({ children, scroll = true, bottomInset = 0, edges = ['top'], contentStyle, header }: ScreenProps) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={edges}>
      {header}
      {scroll ? (
        <ScrollView
          contentContainerStyle={[{ paddingHorizontal: space.lg, paddingBottom: bottomInset + space.xl, paddingTop: space.sm, gap: space.lg }, contentStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="never"
          bounces={false}
          overScrollMode="never"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Header({ title, left, right, subtitle }: { title: string; subtitle?: string; left?: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>{left}</View>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text variant="h2" numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textDim" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

export function IconButton({ icon, onPress, label, size = 40, filled = true, color }: { icon: IconName; onPress: () => void; label: string; size?: number; filled?: boolean; color?: string }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      feedback="tap"
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: filled ? colors.card : 'transparent', borderWidth: filled ? StyleSheet.hairlineWidth : 0, borderColor: colors.border }}
    >
      <Icon name={icon} size={20} color={color ?? colors.text} />
    </PressableScale>
  );
}

export function Card({ children, style, pad = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; pad?: boolean }) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={[
        { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        shadow(isDark),
        pad && { padding: space.lg },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text variant="h2" accessibilityRole="header">
        {title}
      </Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <Text variant="label" style={{ color: colors.primary }}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ---------------------------------- controls --------------------------------- */

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  size = 'md',
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const pad = size === 'sm' ? { paddingVertical: 9, paddingHorizontal: 16 } : null;
  const off = disabled || loading;
  const fg = variant === 'primary' ? colors.onPrimary : variant === 'danger' ? colors.expense : colors.text;
  const body = (
    <View style={styles.btnInner}>
      {icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text variant="bodyStrong" style={{ color: fg }}>
        {loading ? 'Please wait…' : title}
      </Text>
    </View>
  );
  return (
    <PressableScale
      onPress={onPress}
      disabled={off}
      feedback="tap"
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
      style={[{ opacity: off ? 0.5 : 1, borderRadius: radius.pill, overflow: 'hidden' }, style]}
    >
      {variant === 'primary' ? (
        <View style={[styles.btn, pad, { backgroundColor: colors.brand }]}>{body}</View>
      ) : (
        <View
          style={[
            styles.btn,
            pad,
            variant === 'ghost' ? null : { backgroundColor: variant === 'danger' ? tint(colors.expense, 0.12) : colors.cardAlt },
          ]}
        >
          {body}
        </View>
      )}
    </PressableScale>
  );
}

export function Chip({ label, selected, onPress, icon, color }: { label: string; selected?: boolean; onPress?: () => void; icon?: string; color?: string }) {
  const { colors } = useTheme();
  const accent = color ?? colors.primary;
  return (
    <PressableScale
      onPress={onPress}
      feedback="select"
      scaleTo={0.94}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: radius.pill,
        backgroundColor: selected ? tint(accent, 0.18) : colors.card,
        borderWidth: 1,
        borderColor: selected ? accent : colors.border,
      }}
    >
      {icon ? <Text style={{ fontSize: 15 }}>{icon}</Text> : null}
      <Text variant="label" style={{ color: selected ? colors.text : colors.textDim }}>
        {label}
      </Text>
    </PressableScale>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { colors } = useTheme();
  const [w, setW] = useState(0);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const x = useSharedValue(0);
  const segW = w > 0 ? (w - 8) / options.length : 0;
  useEffect(() => {
    x.set(withSpring(idx * segW, SETTLE));
  }, [idx, segW, x]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.pill, padding: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}
      accessibilityRole="tablist"
    >
      {segW > 0 && <Animated.View style={[{ position: 'absolute', top: 4, left: 4, width: segW, bottom: 4, borderRadius: radius.pill, backgroundColor: colors.cardAlt }, pill]} />}
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => {
            haptic.select();
            onChange(o.value);
          }}
          accessibilityRole="tab"
          accessibilityState={{ selected: o.value === value }}
          style={{ flex: 1, alignItems: 'center', paddingVertical: 9 }}
        >
          <Text variant="label" style={{ color: o.value === value ? colors.text : colors.textDim }}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Field({ label, error, ...input }: TextInputProps & { label: string; error?: string }) {
  const { colors } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text variant="overline" color="textFaint">
        {label}
      </Text>
      <TextInput
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.primary}
        accessibilityLabel={label}
        {...input}
        onFocus={(e) => {
          setFocus(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          input.onBlur?.(e);
        }}
        style={[
          {
            fontFamily: 'Inter_500Medium',
            fontSize: 16,
            color: colors.text,
            backgroundColor: colors.card,
            borderRadius: radius.md,
            borderWidth: 1.5,
            borderColor: error ? colors.expense : focus ? colors.primary : colors.border,
            paddingHorizontal: 14,
            paddingVertical: 13,
          },
          NO_OUTLINE,
          input.style,
        ]}
      />
      {error ? (
        <Text variant="caption" color="expense">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function Row({ icon, title, subtitle, right, onPress, danger, last }: { icon?: IconName; title: string; subtitle?: string; right?: ReactNode; onPress?: () => void; danger?: boolean; last?: boolean }) {
  const { colors } = useTheme();
  const content = (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: danger ? tint(colors.expense, 0.14) : colors.cardAlt }]}>
          <Icon name={icon} size={18} color={danger ? colors.expense : colors.textDim} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" style={danger ? { color: colors.expense } : undefined}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textDim">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name="right" size={18} color={colors.textFaint} /> : null)}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const { colors } = useTheme();
  const x = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    x.set(withSpring(value ? 1 : 0, SETTLE));
  }, [value, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * 20 }] }));
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onChange(!value);
      }}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      hitSlop={8}
    >
      <Animated.View style={{ width: 48, height: 28, borderRadius: 14, justifyContent: 'center', paddingHorizontal: 2, backgroundColor: value ? colors.primary : tint(colors.textFaint, 0.4) }}>
        <Animated.View style={[{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' }, knob]} />
      </Animated.View>
    </Pressable>
  );
}

export function CategoryBadge({ icon, color, size = 44 }: { icon: string; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.36, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(color, 0.18) }}>
      <Text style={{ fontSize: size * 0.46 }} allowFontScaling={false}>
        {icon}
      </Text>
    </View>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: string; title: string; body: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.xl, gap: space.sm }}>
      <Text style={{ fontSize: 44 }}>{icon}</Text>
      <Text variant="h2">{title}</Text>
      <Text variant="body" color="textDim" style={{ textAlign: 'center' }}>
        {body}
      </Text>
      {action ? <View style={{ marginTop: space.md }}>{action}</View> : null}
    </View>
  );
}

/** Bottom padding that clears the floating tab bar. */
export function useTabInset() {
  const { bottom } = useSafeAreaInsets();
  return 78 + Math.max(bottom, 12);
}

/* -------------------------------- number motion ------------------------------- */

/** Eased count-up. Re-runs when `target` changes, starting from the last displayed value. */
export function useCountUp(target: number, ms = 750) {
  const [val, setVal] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    if (start === target) return;
    const t0 = Date.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(start + (target - start) * eased);
      from.current = v;
      setVal(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return val;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.sm, minHeight: 56 },
  headerSide: { width: 56 },
  btn: { paddingVertical: 15, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 13 },
  rowIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
