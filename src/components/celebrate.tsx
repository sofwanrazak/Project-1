import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { create } from 'zustand';

import { todayStr } from '../lib/dates.ts';
import { newMilestone, streakInfo } from '../lib/streak.ts';
import { useStore } from '../store/useStore';
import { radius, shadow, useTheme } from '../theme';
import { Confetti } from './Confetti';
import { Text } from './Text';
import { Button, haptic } from './ui';

interface Celebration {
  emoji: string;
  title: string;
  body: string;
  cta?: string;
}

interface CelebrateState {
  id: number;
  item: Celebration | null;
  show(c: Celebration): void;
  hide(): void;
}

export const useCelebrate = create<CelebrateState>()((set) => ({
  id: 0,
  item: null,
  show: (item) => set((s) => ({ item, id: s.id + 1 })),
  hide: () => set({ item: null }),
}));

/** The moments worth a celebration are rare on purpose: first log, a streak milestone, a goal step. */
export function CelebrationHost() {
  const { colors, isDark } = useTheme();
  const { id, item, hide, show } = useCelebrate();
  const ready = useStore((s) => s.status === 'ready' && s.settings.onboarded);
  const unlocked = useStore((s) => s.unlocked || !s.settings.lockEnabled);
  const transactions = useStore((s) => s.transactions);
  const noSpend = useStore((s) => s.settings.noSpendDays);
  const seen = useStore((s) => s.settings.seenMilestones);

  const current = useMemo(() => (ready ? streakInfo(transactions, noSpend, todayStr()).current : 0), [ready, transactions, noSpend]);

  // Streak milestones: fire once per milestone, only while the app is visible and unlocked.
  useEffect(() => {
    if (!ready || !unlocked || item) return;
    const m = newMilestone(current, seen);
    if (m === null) return;
    void useStore.getState().ackMilestone(m);
    show({ emoji: '🔥', title: `${m}-day streak`, body: m >= 30 ? 'A real habit now. Your future self says thanks.' : 'You keep showing up. That is the whole trick.', cta: 'Keep going' });
  }, [current, seen, ready, unlocked, item, show]);

  useEffect(() => {
    if (!item) return;
    haptic.success();
    const t = setTimeout(hide, 5000);
    return () => clearTimeout(t);
  }, [item, id, hide]);

  if (!item) return null;
  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(200)} style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: colors.scrim }]} accessibilityViewIsModal>
      <Pressable style={StyleSheet.absoluteFill} onPress={hide} accessibilityLabel="Dismiss" />
      <Confetti burst={id} />
      <Animated.View entering={FadeIn.duration(220)} style={[styles.card, shadow(isDark), { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityLiveRegion="polite">
        <Text style={{ fontSize: 56 }} allowFontScaling={false}>
          {item.emoji}
        </Text>
        <Text variant="title" style={{ textAlign: 'center' }}>
          {item.title}
        </Text>
        <Text variant="body" color="textDim" style={{ textAlign: 'center' }}>
          {item.body}
        </Text>
        <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
          <Button title={item.cta ?? 'Nice'} onPress={hide} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', padding: 32, zIndex: 90 },
  card: { width: '100%', maxWidth: 340, alignItems: 'center', gap: 8, padding: 24, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth },
});
