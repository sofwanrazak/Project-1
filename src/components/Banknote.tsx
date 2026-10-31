import { useMemo, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * A card dressed like a ringgit note: flat note colour with the fine wave lines and rosette of
 * a real security print, drawn in translucent white so any content on top stays legible.
 */
export function Banknote({ color, radius = 26, children, style }: { color: string; radius?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  const waves = useMemo(() => {
    if (!size.w) return [];
    const out: string[] = [];
    for (let k = 0; k < 26; k++) {
      const y0 = (size.h / 26) * k;
      let d = `M 0 ${y0.toFixed(1)}`;
      for (let x = 8; x <= size.w + 8; x += 8) {
        const y = y0 + Math.sin(x * 0.045 + k * 0.5) * 7 + Math.sin(x * 0.011 + k * 0.2) * 5;
        d += ` L ${x} ${y.toFixed(1)}`;
      }
      out.push(d);
    }
    return out;
  }, [size]);

  return (
    <View
      onLayout={(e) => setSize({ w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) })}
      style={[{ backgroundColor: color, borderRadius: radius, overflow: 'hidden' }, style]}
    >
      {size.w > 0 && (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill} pointerEvents="none">
          {waves.map((d, i) => (
            <Path key={i} d={d} stroke="#fff" strokeOpacity={0.09} strokeWidth={1} fill="none" />
          ))}
          {Array.from({ length: 16 }, (_, i) => (
            <Circle key={i} cx={size.w - 34} cy={34} r={10 + i * 8.5} stroke="#fff" strokeOpacity={0.14 - i * 0.004} strokeWidth={1} fill="none" />
          ))}
          <Rect x={8} y={8} width={size.w - 16} height={size.h - 16} rx={Math.max(radius - 8, 4)} stroke="#fff" strokeOpacity={0.2} strokeWidth={1.5} fill="none" />
        </Svg>
      )}
      {children}
    </View>
  );
}
