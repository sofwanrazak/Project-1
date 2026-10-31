import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import type { DayState } from '../lib/streak.ts';
import { tallyGroups } from '../lib/streak.ts';
import { useTheme } from '../theme';
import { Text } from './Text';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** One pen stroke that draws itself. The whole app's motif: a day logged is a mark made. */
function Stroke({ d, length, color, width, delay, animate }: { d: string; length: number; color: string; width: number; delay: number; animate: boolean }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(animate && !reduced ? 0 : 1);
  useEffect(() => {
    if (!animate || reduced) return;
    p.set(withDelay(delay, withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) })));
  }, [animate, reduced, delay, p]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - p.get()) }));
  return <AnimatedPath d={d} stroke={color} strokeWidth={width} strokeLinecap="round" fill="none" strokeDasharray={`${length} ${length}`} animatedProps={props} />;
}

const GAP = 11;

/** Four strokes crossed by a slash is five; fewer strokes are an unfinished group. */
export function TallyGroup({ strokes, slashed, height = 34, color, width = 3.4, delay = 0, animate = true }: { strokes: number; slashed: boolean; height?: number; color: string; width?: number; delay?: number; animate?: boolean }) {
  const w = GAP * 4 + width + 4;
  const top = 3;
  const bottom = height - 3;
  return (
    <Svg width={w} height={height} viewBox={`0 0 ${w} ${height}`}>
      {Array.from({ length: strokes }, (_, i) => (
        <Stroke key={i} d={`M ${4 + i * GAP} ${top} L ${4 + i * GAP} ${bottom}`} length={bottom - top} color={color} width={width} delay={delay + i * 70} animate={animate} />
      ))}
      {slashed && <Stroke d={`M 0 ${bottom - 6} L ${w} ${top + 7}`} length={Math.hypot(w, bottom - top - 13)} color={color} width={width * 0.9} delay={delay + 4 * 70 + 40} animate={animate} />}
    </Svg>
  );
}

/** A streak drawn the way a shopkeeper would count it. Shows the latest eight groups (40 days). */
export function TallyStreak({ count, color, height = 34 }: { count: number; color: string; height?: number }) {
  const groups = tallyGroups(count);
  const shown = groups.slice(-8);
  const hidden = groups.length - shown.length;
  return (
    <View style={styles.row} accessible accessibilityLabel={`${count} day streak`}>
      {hidden > 0 && (
        <Text variant="label" color="textDim">
          +{hidden * 5}
        </Text>
      )}
      {shown.map((g, i) => (
        <TallyGroup key={`${hidden + i}-${g.strokes}`} {...g} height={height} color={color} delay={i === shown.length - 1 ? 0 : 0} animate={i === shown.length - 1} />
      ))}
    </View>
  );
}

const LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Last seven days: a stroke for each logged day, a ring for a confirmed no-spend day. */
export function WeekStrip({ week, color }: { week: { date: string; state: DayState }[]; color: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.week}>
      {week.map(({ date, state }) => {
        const dow = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8))).getDay();
        const label = { logged: 'logged', nospend: 'no spend', today: 'not logged yet', missed: 'missed' }[state];
        return (
          <View key={date} style={styles.day} accessible accessibilityLabel={`${date}, ${label}`}>
            <Svg width={22} height={26} viewBox="0 0 22 26">
              {state === 'logged' && <Path d="M 11 3 L 11 23" stroke={color} strokeWidth={3.4} strokeLinecap="round" />}
              {state === 'nospend' && <Circle cx={11} cy={13} r={6.5} stroke={color} strokeWidth={2.6} fill="none" />}
              {state === 'today' && <Circle cx={11} cy={13} r={7} stroke={colors.textFaint} strokeWidth={2} strokeDasharray="3 3.5" fill="none" />}
              {state === 'missed' && <Circle cx={11} cy={13} r={2.2} fill={colors.textFaint} opacity={0.45} />}
            </Svg>
            <Text variant="label" style={{ color: state === 'today' ? colors.text : colors.textFaint, fontSize: 11 }}>
              {LETTER[dow]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function Tick({ i, p, on, off, height }: { i: number; p: { get(): number }; on: string; off: string; height: number }) {
  const style = useAnimatedStyle(() => ({ backgroundColor: p.get() > i ? on : off, transform: [{ scaleY: p.get() > i ? 1 : 0.72 }] }));
  return <Animated.View style={[{ flex: 1, height, borderRadius: 2 }, style]} />;
}

/** Today's allowance as a row of tick marks that fill left to right. */
export function TickMeter({ ratio, on, off, ticks = 24, height = 22 }: { ratio: number; on: string; off: string; ticks?: number; height?: number }) {
  const reduced = useReducedMotion();
  const target = Math.round(Math.min(Math.max(ratio, 0), 1) * ticks);
  const p = useSharedValue(reduced ? target : 0);
  useEffect(() => {
    p.set(reduced ? target : withTiming(target, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [target, reduced, p]);
  return (
    <View style={{ flexDirection: 'row', gap: 3, alignItems: 'flex-end' }} accessible accessibilityLabel={`${Math.round(ratio * 100)} percent of today's allowance used`}>
      {Array.from({ length: ticks }, (_, i) => (
        <Tick key={i} i={i} p={p} on={on} off={off} height={height} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'nowrap' },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { alignItems: 'center', gap: 2, flex: 1 },
});
