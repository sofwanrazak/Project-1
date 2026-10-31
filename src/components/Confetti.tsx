import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

const COLORS = ['#2F5FEA', '#3DD598', '#FFAA45', '#FF6F66', '#A98BFF', '#2CC4BE', '#FFD84D'];

/** Small deterministic generator: a burst looks the same for a given key, and render stays pure. */
function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

interface Piece {
  angle: number;
  dist: number;
  fall: number;
  size: number;
  color: string;
  spin: number;
  round: boolean;
}

function Particle({ piece, p }: { piece: Piece; p: { get(): number } }) {
  const style = useAnimatedStyle(() => {
    const t = p.get();
    const ease = 1 - (1 - t) * (1 - t); // fast out, slow settle
    return {
      opacity: t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3,
      transform: [
        { translateX: Math.cos(piece.angle) * piece.dist * ease },
        { translateY: Math.sin(piece.angle) * piece.dist * ease + piece.fall * t * t },
        { rotate: `${piece.spin * t}deg` },
      ],
    };
  });
  return <Animated.View style={[{ position: 'absolute', width: piece.size, height: piece.round ? piece.size : piece.size * 0.45, borderRadius: piece.round ? piece.size / 2 : 2, backgroundColor: piece.color }, style]} />;
}

/**
 * One-shot burst from the centre of its container. Rare-tier delight only: first log, milestones, goals.
 * With reduced motion it renders nothing; the caller's text carries the message on its own.
 */
export function Confetti({ burst, count = 46 }: { burst: number; count?: number }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  const pieces = useMemo<Piece[]>(() => {
    const r = rng(burst + 1);
    return Array.from({ length: count }, () => ({
      angle: -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.5,
      dist: 90 + r() * 190,
      fall: 120 + r() * 160,
      size: 7 + r() * 7,
      color: COLORS[Math.floor(r() * COLORS.length)],
      spin: (r() - 0.5) * 900,
      round: r() < 0.3,
    }));
  }, [burst, count]);

  useEffect(() => {
    if (reduced) return;
    p.set(0);
    p.set(withTiming(1, { duration: 1700, easing: Easing.out(Easing.cubic) }));
  }, [burst, reduced, p]);

  if (reduced) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      {pieces.map((piece, i) => (
        <Particle key={i} piece={piece} p={p} />
      ))}
    </View>
  );
}
