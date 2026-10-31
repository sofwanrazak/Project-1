import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { useTheme } from '../theme';

/** Paper and ink are fixed per theme (not the card colours) so the slip always reads as a slip of paper. */
export function useSlipColors() {
  const { isDark } = useTheme();
  return isDark ? { paper: '#E4E9F3', ink: '#0E1326', dim: '#5A6482', rule: '#9AA4BF', chip: '#C9D1E3' } : { paper: '#FFFFFF', ink: '#0E1326', dim: '#5A6482', rule: '#B8C0D6', chip: '#D5DBEA' };
}

const TOOTH = 10;

/** A receipt slip with a torn zigzag bottom edge: the preview of what is about to be written to the tally. */
export function Slip({ children }: { children: ReactNode }) {
  const { paper } = useSlipColors();
  const { colors, isDark } = useTheme();
  const [w, setW] = useState(0);
  const teeth = Math.max(Math.floor(w / TOOTH), 1);
  const step = w / teeth;
  let edge = `M0 0 H${w}`;
  for (let i = teeth - 1; i >= 0; i--) edge += ` L${(i + 0.5) * step} ${TOOTH * 0.8} L${i * step} 0`;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ shadowColor: '#000', shadowOpacity: isDark ? 0.4 : 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4 }}>
      <View style={[styles.body, { backgroundColor: paper, borderColor: colors.border }]}>{children}</View>
      {w > 0 && (
        <Svg width={w} height={TOOTH} style={{ marginTop: -1 }}>
          <Path d={edge} fill={paper} />
        </Svg>
      )}
    </View>
  );
}

/** The dotted tear line between the item and its details. */
export function Perforation({ color }: { color: string }) {
  const [w, setW] = useState(0);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: 2, marginVertical: 14 }}>
      {w > 0 && (
        <Svg width={w} height={2}>
          <Line x1={0} y1={1} x2={w} y2={1} stroke={color} strokeWidth={1.5} strokeDasharray="2 5" strokeLinecap="round" />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 18, borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0 },
});
