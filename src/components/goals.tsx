import { router } from 'expo-router';
import { useEffect, useId } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { ClipPath, Defs, Path, Rect } from 'react-native-svg';

import { goalPct } from '../lib/goals.ts';
import type { Goal } from '../lib/types.ts';
import { radius, tint, useTheme } from '../theme';
import { useMoney } from './Money';
import { Text } from './Text';
import { Button, Card, PressableScale } from './ui';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const W = 58;
const H = 76;
// A squat jar: lid, neck, round shoulders.
const JAR = `M14 6 H44 V13 C52 16 55 22 55 30 V62 C55 70 50 73 42 73 H16 C8 73 3 70 3 62 V30 C3 22 6 16 14 13 Z`;

/** Savings jar that fills to the goal's percentage. */
export function Jar({ pct, color, emoji }: { pct: number; color: string; emoji: string }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const id = `jar${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const fill = useSharedValue(reduced ? pct : 0);
  useEffect(() => {
    fill.set(reduced ? pct : withTiming(pct, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [pct, reduced, fill]);
  // Fill occupies the body of the jar (y 13..73); animate y/height of one rect clipped to the jar outline.
  const props = useAnimatedProps(() => {
    const h = (60 * fill.get()) / 100;
    return { y: 73 - h, height: h };
  });
  return (
    <View style={{ width: W, height: H }}>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <ClipPath id={id}>
            <Path d={JAR} />
          </ClipPath>
        </Defs>
        <Path d={JAR} fill={tint(color, 0.12)} />
        <AnimatedRect x={0} width={W} fill={color} clipPath={`url(#${id})`} animatedProps={props} />
        <Path d={JAR} fill="none" stroke={colors.textFaint} strokeWidth={2.4} strokeLinejoin="round" />
      </Svg>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 26, alignItems: 'center' }}>
        <Text style={{ fontSize: 24 }} allowFontScaling={false}>
          {emoji}
        </Text>
      </View>
    </View>
  );
}

function GoalCard({ goal }: { goal: Goal }) {
  const { colors } = useTheme();
  const fmt = useMoney();
  const pct = goalPct(goal);
  const done = goal.saved >= goal.target;
  return (
    <PressableScale onPress={() => router.push({ pathname: '/goal-edit', params: { id: goal.id } })} accessibilityRole="button" accessibilityLabel={`${goal.name}, ${Math.round(pct)} percent saved. Tap to edit`} scaleTo={0.98}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Jar pct={pct} color={goal.color} emoji={goal.icon} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="h2" numberOfLines={1}>
            {goal.name}
          </Text>
          <Text variant="caption" color="textDim">
            {fmt(goal.saved)} of {fmt(goal.target)}
          </Text>
          <Text variant="bodyStrong" style={{ color: done ? colors.income : goal.color }}>
            {done ? 'Reached' : `${Math.round(pct)}% · ${fmt(goal.target - goal.saved)} to go`}
          </Text>
          <View style={{ flexDirection: 'row', marginTop: 6 }}>
            <Button title="Add money" size="sm" variant="secondary" onPress={() => router.push({ pathname: '/goal-add', params: { id: goal.id } })} />
          </View>
        </View>
      </Card>
    </PressableScale>
  );
}

const IDEAS = [
  { icon: '🛟', name: 'Emergency fund' },
  { icon: '✈️', name: 'Holiday' },
  { icon: '📱', name: 'New phone' },
  { icon: '🕋', name: 'Umrah' },
  { icon: '💍', name: 'Wedding' },
  { icon: '🏠', name: 'House deposit' },
];

export function GoalsView({ goals }: { goals: Goal[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 14 }}>
      {goals.map((g) => (
        <GoalCard key={g.id} goal={g} />
      ))}
      {goals.length === 0 ? (
        <Card style={{ gap: 12 }}>
          <Text variant="title">What are you saving for?</Text>
          <Text variant="body" color="textDim">
            A named goal is easier to keep than a vague plan. Pick one to start.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {IDEAS.map((i) => (
              <PressableScale
                key={i.name}
                onPress={() => router.push({ pathname: '/goal-edit', params: { name: i.name, icon: i.icon } })}
                feedback="select"
                accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.cardAlt }}
              >
                <Text style={{ fontSize: 16 }}>{i.icon}</Text>
                <Text variant="label">{i.name}</Text>
              </PressableScale>
            ))}
          </View>
        </Card>
      ) : (
        <Button title="New goal" icon="plus" variant="secondary" onPress={() => router.push('/goal-edit')} />
      )}
    </View>
  );
}
