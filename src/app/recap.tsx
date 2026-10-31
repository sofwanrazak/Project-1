import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banknote } from '../components/Banknote';
import { Icon } from '../components/Icon';
import { useMoney } from '../components/Money';
import { TallyGroup } from '../components/Tally';
import { Text } from '../components/Text';
import { Button, haptic } from '../components/ui';
import { shortDate, todayStr, weekdayName, weekStart } from '../lib/dates.ts';
import { weekRecap } from '../lib/recap.ts';
import { useStore } from '../store/useStore';
import { NOTE } from '../theme';

const SLIDE_MS = 5500;
const COLORS = [NOTE.none, '#5B3FD0', NOTE.tight, NOTE.safe, '#B8325A'] as const;

function Segment({ state, running, reduced }: { state: 'done' | 'active' | 'todo'; running: boolean; reduced: boolean }) {
  const p = useSharedValue(state === 'done' ? 1 : 0);
  useEffect(() => {
    if (state === 'done') p.set(1);
    else if (state === 'todo') p.set(0);
    else if (reduced || !running) p.set(1);
    else {
      p.set(0);
      p.set(withTiming(1, { duration: SLIDE_MS, easing: Easing.linear }));
    }
  }, [state, running, reduced, p]);
  const fill = useAnimatedStyle(() => ({ width: `${p.get() * 100}%` }));
  return (
    <View style={styles.segTrack}>
      <Animated.View style={[styles.segFill, fill]} />
    </View>
  );
}

export default function Recap() {
  const reduced = useReducedMotion();
  const fmt = useMoney();
  const { week: weekParam } = useLocalSearchParams<{ week?: string }>();
  const { transactions, categories } = useStore();
  const today = todayStr();
  const start = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekStart(weekParam) : weekStart(today);
  const r = useMemo(() => weekRecap(transactions, categories, start, today), [transactions, categories, start, today]);
  const cat = categories.find((c) => c.id === r.topCategory?.id);

  const slides = 5;
  const [idx, setIdx] = useState(0);
  const last = idx === slides - 1;
  const markSeen = useCallback(() => void useStore.getState().updateSettings({ lastRecapWeek: start }), [start]);

  useEffect(() => {
    if (last) markSeen();
  }, [last, markSeen]);

  // Auto-advance, except on the last slide and when the system asks for reduced motion.
  useEffect(() => {
    if (last || reduced) return;
    const t = setTimeout(() => setIdx((i) => Math.min(i + 1, slides - 1)), SLIDE_MS);
    return () => clearTimeout(t);
  }, [idx, last, reduced]);

  const go = (dir: 1 | -1) => {
    haptic.select();
    setIdx((i) => Math.max(0, Math.min(slides - 1, i + dir)));
  };

  const share = async () => {
    const parts = [`My week with Tally: ${r.persona.icon} ${r.persona.title}.`];
    if (r.delta !== null) parts.push(`Spending ${r.delta <= 0 ? 'down' : 'up'} ${Math.abs(Math.round(r.delta))}% on the week before.`);
    if (r.noSpendDays > 0) parts.push(`${r.noSpendDays} no-spend ${r.noSpendDays === 1 ? 'day' : 'days'}.`);
    // Amounts are deliberately left out: the card is for sharing, not for broadcasting a balance.
    await Share.share({ message: parts.join(' ') });
  };

  const range = `${shortDate(r.from)} to ${shortDate(r.to)}`;
  const empty = r.count === 0;

  return (
    <Banknote color={COLORS[idx]} radius={0} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.bars}>
          {Array.from({ length: slides }, (_, i) => (
            <Segment key={i} state={i < idx ? 'done' : i === idx ? 'active' : 'todo'} running={!last} reduced={reduced} />
          ))}
        </View>
        <View style={styles.head}>
          <Text variant="label" style={{ color: '#fff', opacity: 0.9 }}>
            {r.partial ? 'This week so far' : 'Last week'} · {range}
          </Text>
          <Pressable onPress={() => router.back()} hitSlop={14} accessibilityRole="button" accessibilityLabel="Close recap">
            <Icon name="close" size={24} color="#fff" />
          </Pressable>
        </View>

        <Animated.View key={idx} entering={FadeIn.duration(reduced ? 1 : 320)} style={styles.slide}>
          {idx === 0 && (
            <>
              <Text variant="title" style={{ color: '#fff' }}>
                {empty ? 'A quiet week' : 'You spent'}
              </Text>
              <Text variant="hero" tabular style={{ color: '#fff', fontSize: 64, lineHeight: 70 }} numberOfLines={1} adjustsFontSizeToFit>
                {fmt(r.total)}
              </Text>
              <Text variant="title" style={{ color: '#fff', opacity: 0.95 }}>
                {r.delta === null ? (empty ? 'Nothing logged yet.' : 'Your first full week on the tally.') : r.delta <= 0 ? `${Math.abs(Math.round(r.delta))}% less than the week before` : `${Math.round(r.delta)}% more than the week before`}
              </Text>
            </>
          )}
          {idx === 1 && (
            <>
              <Text variant="title" style={{ color: '#fff' }}>
                Where it went
              </Text>
              {r.topCategory ? (
                <>
                  <Text style={{ fontSize: 96 }} allowFontScaling={false}>
                    {cat?.icon ?? '❓'}
                  </Text>
                  <Text variant="display" style={{ color: '#fff' }}>
                    {cat?.name ?? 'Uncategorised'}
                  </Text>
                  <Text variant="title" style={{ color: '#fff', opacity: 0.95 }}>
                    {Math.round(r.topCategory.pct)}% of the week, {fmt(r.topCategory.total)}
                  </Text>
                </>
              ) : (
                <Text variant="title" style={{ color: '#fff', opacity: 0.95 }}>
                  Log a few spends and your top category shows up here.
                </Text>
              )}
            </>
          )}
          {idx === 2 && (
            <>
              <Text variant="title" style={{ color: '#fff' }}>
                Your busiest day
              </Text>
              {r.biggestDay ? (
                <>
                  <Text variant="display" style={{ color: '#fff', fontSize: 44, lineHeight: 50 }}>
                    {weekdayName(r.biggestDay.date)}
                  </Text>
                  <Text variant="title" style={{ color: '#fff', opacity: 0.95 }}>
                    {fmt(r.biggestDay.total)} in one day
                  </Text>
                  {r.topSpot && (
                    <Text variant="body" style={{ color: '#fff', opacity: 0.95 }}>
                      Your regular spot: {r.topSpot.name}, {r.topSpot.n} times ({fmt(r.topSpot.total)}).
                    </Text>
                  )}
                </>
              ) : (
                <Text variant="title" style={{ color: '#fff', opacity: 0.95 }}>
                  No spending to compare yet.
                </Text>
              )}
            </>
          )}
          {idx === 3 && (
            <>
              <Text variant="title" style={{ color: '#fff' }}>
                No-spend days
              </Text>
              <TallyGroup strokes={Math.min(r.noSpendDays, 4)} slashed={r.noSpendDays >= 5} height={96} color="#fff" width={7} />
              <Text variant="display" style={{ color: '#fff' }}>
                {r.noSpendDays} of {r.partial ? 'the days so far' : '7 days'}
              </Text>
              <Text variant="body" style={{ color: '#fff', opacity: 0.95 }}>
                {r.noSpendDays >= 3 ? 'Those days add up. Nicely done.' : 'Even one no-spend day a week changes the month.'}
              </Text>
            </>
          )}
          {idx === 4 && (
            <>
              <Text style={{ fontSize: 96 }} allowFontScaling={false}>
                {r.persona.icon}
              </Text>
              <Text variant="title" style={{ color: '#fff', opacity: 0.95 }}>
                This week you were
              </Text>
              <Text variant="display" style={{ color: '#fff', fontSize: 40, lineHeight: 46 }}>
                {r.persona.title}
              </Text>
              <Text variant="body" style={{ color: '#fff', opacity: 0.95 }}>
                {r.persona.line}
              </Text>
              <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 18 }}>
                <Button title="Share my week" icon="upload" variant="secondary" onPress={() => void share()} />
                <Button title="Done" onPress={() => router.back()} />
              </View>
            </>
          )}
        </Animated.View>

        {/* Tap zones: left third goes back, the rest goes forward. Kept off the last slide's buttons. */}
        {!last && (
          <View style={styles.zones} pointerEvents="box-none">
            <Pressable style={{ flex: 1 }} onPress={() => go(-1)} accessibilityRole="button" accessibilityLabel="Previous" />
            <Pressable style={{ flex: 2 }} onPress={() => go(1)} accessibilityRole="button" accessibilityLabel="Next" />
          </View>
        )}
        {last && (
          <Pressable style={styles.backZone} onPress={() => go(-1)} accessibilityRole="button" accessibilityLabel="Previous" />
        )}
      </SafeAreaView>
    </Banknote>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', gap: 5, paddingHorizontal: 16, paddingTop: 8 },
  segTrack: { flex: 1, height: 3.5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  segFill: { height: 3.5, backgroundColor: '#fff' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 14, zIndex: 5 },
  slide: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 12 },
  zones: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 90, flexDirection: 'row' },
  backZone: { position: 'absolute', left: 0, top: 90, bottom: 260, width: 90 },
});
