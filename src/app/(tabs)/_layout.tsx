import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '../../components/Icon';
import { Text } from '../../components/Text';
import { haptic } from '../../components/ui';
import { shadow, useTheme } from '../../theme';
import { PRESS, SETTLE } from '../../theme/motion';

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Home', icon: 'home' },
  activity: { label: 'Activity', icon: 'list' },
  insights: { label: 'Insights', icon: 'chart' },
  budgets: { label: 'Plan', icon: 'pie' },
};

function TabItem({ name, focused, onPress }: { name: string; focused: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const t = TABS[name];
  const s = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    s.set(withSpring(focused ? 1 : 0, SETTLE));
  }, [focused, s]);
  const dot = useAnimatedStyle(() => ({ opacity: s.value, transform: [{ scale: s.value }] }));
  if (!t) return null;
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: focused }} style={styles.item}>
      <Icon name={t.icon} size={22} color={focused ? colors.primary : colors.textFaint} strokeWidth={focused ? 2.4 : 2} />
      <Text variant="label" style={{ fontSize: 10, color: focused ? colors.text : colors.textFaint }}>
        {t.label}
      </Text>
      <Animated.View style={[styles.dot, { backgroundColor: colors.primary }, dot]} />
    </Pressable>
  );
}

function Fab() {
  const { colors } = useTheme();
  const press = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.06 * press.value }] }));
  return (
    <Pressable
      onPressIn={() => press.set(withSpring(1, PRESS))}
      onPressOut={() => press.set(withSpring(0, PRESS))}
      onPress={() => {
        haptic.tap();
        router.push('/add');
      }}
      accessibilityRole="button"
      accessibilityLabel="Add transaction"
      style={styles.fabWrap}
    >
      <Animated.View style={[styles.fab, style]}>
        <View style={[styles.fabFill, { backgroundColor: colors.brand }]}>
          <Icon name="plus" size={28} color="#fff" strokeWidth={2.6} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

function TabBar({ state, navigateToTab, emitter }: BottomTabBarProps) {
  const { colors, isDark } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const items = state.routes.map((r, i) => ({ name: r.name, key: r.key, focused: state.index === i }));
  const left = items.slice(0, 2);
  const right = items.slice(2);

  const press = (key: string, focused: boolean) => {
    const e = emitter.emit({ type: 'tabPress', target: key, canPreventDefault: true });
    if (!focused && !e.defaultPrevented) {
      haptic.select();
      navigateToTab(key);
    }
  };

  return (
    <View style={[styles.wrap, { bottom: Math.max(bottom, 12) }]} pointerEvents="box-none">
      <View style={[styles.bar, shadow(isDark), { borderColor: colors.border }]}>
        {Platform.OS === 'android' ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(16,21,36,0.97)' : 'rgba(255,255,255,0.97)' }]} />
        ) : (
          <>
            <BlurView intensity={50} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.tabBar }]} />
          </>
        )}
        <View style={styles.group}>{left.map((t) => <TabItem key={t.key} name={t.name} focused={t.focused} onPress={() => press(t.key, t.focused)} />)}</View>
        <View style={{ width: 70 }} />
        <View style={styles.group}>{right.map((t) => <TabItem key={t.key} name={t.name} focused={t.focused} onPress={() => press(t.key, t.focused)} />)}</View>
      </View>
      <Fab />
    </View>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="insights" />
      <Tabs.Screen name="budgets" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 520, height: 66, borderRadius: 33, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 6 },
  group: { flex: 1, flexDirection: 'row' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, height: 66 },
  dot: { position: 'absolute', bottom: 5, width: 4, height: 4, borderRadius: 2 },
  fabWrap: { position: 'absolute', top: -20, alignSelf: 'center' },
  fab: { width: 62, height: 62, borderRadius: 31, shadowColor: '#2F5FEA', shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  fabFill: { flex: 1, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
});
