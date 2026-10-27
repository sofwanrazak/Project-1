import { useEffect, useId, useMemo, useState } from 'react';
import { View, type GestureResponderEvent } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { tint, useTheme } from '../theme';
import { haptic } from './ui';
import { Text } from './Text';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const EASE = Easing.out(Easing.cubic);

/* ------------------------------- progress ring ------------------------------- */

export function ProgressRing({ ratio, size = 64, stroke = 7, color, children }: { ratio: number; size?: number; stroke?: number; color: string; children?: React.ReactNode }) {
  const { colors } = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withTiming(Math.min(Math.max(ratio, 0), 1), { duration: 900, easing: EASE }));
  }, [ratio, p]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - p.value) }));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.cardAlt} strokeWidth={stroke} fill="none" />
        <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={`${c} ${c}`} animatedProps={props} />
      </Svg>
      {children}
    </View>
  );
}

/* ----------------------------------- donut ----------------------------------- */

export interface Slice {
  key: string;
  value: number;
  color: string;
}

function Arc({ cx, cy, r, stroke, color, start, len, c, p }: { cx: number; cy: number; r: number; stroke: number; color: string; start: number; len: number; c: number; p: { value: number } }) {
  const props = useAnimatedProps(() => {
    const l = Math.max(len * p.value - 2 * Math.min(1, p.value), 0.001);
    return { strokeDasharray: `${l} ${c}`, strokeDashoffset: -start * p.value };
  });
  return <AnimatedCircle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="butt" animatedProps={props} />;
}

export function Donut({ slices, size = 180, stroke = 22, center }: { slices: Slice[]; size?: number; stroke?: number; center?: React.ReactNode }) {
  const { colors } = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((s, x) => s + x.value, 0);
  const p = useSharedValue(0);
  const sig = slices.map((s) => `${s.key}:${s.value}`).join('|');
  useEffect(() => {
    p.set(0);
    p.set(withTiming(1, { duration: 1000, easing: EASE }));
  }, [sig, p]);
  let acc = 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.cardAlt} strokeWidth={stroke} fill="none" />
        {total > 0 &&
          slices.map((s) => {
            const len = (s.value / total) * c;
            const start = acc;
            acc += len;
            return <Arc key={s.key} cx={size / 2} cy={size / 2} r={r} stroke={stroke} color={s.color} start={start} len={len} c={c} p={p} />;
          })}
      </Svg>
      {center}
    </View>
  );
}

/* ---------------------------------- sparkline --------------------------------- */

export function Sparkline({ values, width, height = 56, color }: { values: number[]; width: number; height?: number; color: string }) {
  const id = `sg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const p = useSharedValue(0);
  const sig = values.join(',');
  useEffect(() => {
    p.set(0);
    p.set(withTiming(1, { duration: 1100, easing: EASE }));
  }, [sig, p]);

  const { line, area, len } = useMemo(() => {
    const n = values.length;
    const max = Math.max(...values, 1);
    const pad = 4;
    const pts = values.map((v, i) => [pad + (n === 1 ? 0 : (i / (n - 1)) * (width - pad * 2)), height - pad - (v / max) * (height - pad * 2)] as const);
    // Catmull-Rom -> cubic Bezier for a smooth curve.
    let d = `M${pts[0][0]},${pts[0][1]}`;
    let length = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
      length += Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * 1.15;
    }
    const last = pts[pts.length - 1];
    return { line: d, area: `${d} L${last[0]},${height} L${pts[0][0]},${height} Z`, len: Math.ceil(length) + 8 };
  }, [values, width, height]);

  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - p.value) }));
  const fillStyle = useAnimatedStyle(() => ({ opacity: p.value }));
  if (values.length < 2) return <View style={{ width, height }} />;
  return (
    <View style={{ width, height }}>
      <Animated.View style={[{ position: 'absolute' }, fillStyle]}>
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.35} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={area} fill={`url(#${id})`} />
        </Svg>
      </Animated.View>
      <Svg width={width} height={height} style={{ position: 'absolute' }}>
        <AnimatedPath d={line} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeDasharray={`${len} ${len}`} animatedProps={lineProps} />
      </Svg>
    </View>
  );
}

/** Sparkline that fills the width of its parent. */
export function AutoSparkline({ values, height, color }: { values: number[]; height: number; color: string }) {
  const [w, setW] = useState(0);
  return (
    <View onLayout={(e) => setW(Math.floor(e.nativeEvent.layout.width))} style={{ height }}>
      {w > 0 ? <Sparkline values={values} width={w} height={height} color={color} /> : null}
    </View>
  );
}

/* ----------------------------------- bar chart --------------------------------- */

export interface Bar {
  key: string;
  label: string;
  /** Short text under the bar (defaults to label). */
  axis?: string;
  value: number;
  /** Optional second series drawn behind (e.g. income). */
  ghost?: number;
}

function AnimatedBar({ ratio, color, index, selected, dim }: { ratio: number; color: string; index: number; selected: boolean; dim: boolean }) {
  const h = useSharedValue(0);
  useEffect(() => {
    h.set(withDelay(Math.min(index * 18, 400), withTiming(ratio, { duration: 650, easing: EASE })));
  }, [ratio, index, h]);
  const style = useAnimatedStyle(() => ({ height: `${Math.max(h.value * 100, h.value > 0 ? 2 : 0)}%` }));
  return <Animated.View style={[{ width: '100%', borderRadius: 6, backgroundColor: color, opacity: dim ? 0.4 : 1, borderWidth: selected ? 0 : 0 }, style]} />;
}

/** Tap or drag across the bars to inspect a value. `format` renders the tooltip. */
export function BarChart({ bars, height = 150, color, format, labelEvery = 1, onSelect }: { bars: Bar[]; height?: number; color: string; format: (v: number) => string; labelEvery?: number; onSelect?: (i: number | null) => void }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(...bars.map((b) => b.value), 1);
  const slot = width > 0 ? width / bars.length : 0;

  const pick = (e: GestureResponderEvent) => {
    if (slot === 0) return;
    const i = Math.min(bars.length - 1, Math.max(0, Math.floor(e.nativeEvent.locationX / slot)));
    setSel((prev) => {
      if (prev !== i) {
        haptic.select();
        onSelect?.(i);
      }
      return i;
    });
  };

  const active = sel !== null ? bars[sel] : null;
  const tipLeft = active && slot ? Math.min(Math.max(sel! * slot + slot / 2 - 56, 0), Math.max(width - 112, 0)) : 0;

  return (
    <View>
      <View style={{ height: 34, justifyContent: 'center' }}>
        {active ? (
          <View style={{ position: 'absolute', left: tipLeft, width: 112, alignItems: 'center', backgroundColor: colors.cardAlt, borderRadius: 10, paddingVertical: 4 }}>
            <Text variant="label" tabular>
              {format(active.value)}
            </Text>
            <Text variant="caption" color="textDim" style={{ fontSize: 11, lineHeight: 14 }}>
              {active.label}
            </Text>
          </View>
        ) : null}
      </View>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
        onResponderRelease={() => {
          setSel(null);
          onSelect?.(null);
        }}
        onResponderTerminate={() => setSel(null)}
        style={{ height, flexDirection: 'row', alignItems: 'flex-end' }}
        accessible
        accessibilityLabel="Bar chart. Drag to inspect values."
      >
        {bars.map((b, i) => (
          <View key={b.key} style={{ flex: 1, height: '100%', justifyContent: 'flex-end', paddingHorizontal: bars.length > 20 ? 1 : 3 }}>
            {b.ghost ? <View style={{ position: 'absolute', left: bars.length > 20 ? 1 : 3, right: bars.length > 20 ? 1 : 3, bottom: 0, height: `${(b.ghost / max) * 100}%`, borderRadius: 6, backgroundColor: tint(color, 0.15) }} /> : null}
            <AnimatedBar ratio={b.value / max} color={color} index={i} selected={sel === i} dim={sel !== null && sel !== i} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        {bars.map((b, i) => (
          <View key={b.key} style={{ flex: 1, alignItems: 'center' }}>
            {i % labelEvery === 0 ? (
              <Text variant="caption" color="textFaint" style={{ fontSize: 10, lineHeight: 14, width: 44, flexShrink: 0, textAlign: 'center' }}>
                {b.axis ?? b.label}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}
