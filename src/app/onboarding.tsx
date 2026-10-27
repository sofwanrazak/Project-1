import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName } from '../components/Icon';
import { Text } from '../components/Text';
import { useToast } from '../components/Toast';
import { Button, Chip, Field } from '../components/ui';
import { CURRENCIES } from '../lib/defaults.ts';
import { parseMinor } from '../lib/money.ts';
import { useStore } from '../store/useStore';
import { radius, space, tint, useTheme } from '../theme';

const POINTS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'plus', title: 'Log in 5 seconds', body: 'A keypad, a category, done. Smart suggestions learn your usual spots.' },
  { icon: 'pie', title: 'Budgets that talk back', body: 'See what’s left today, not just what you spent.' },
  { icon: 'shield', title: 'Private by design', body: 'Encrypted on your phone. No account, no cloud, no ads.' },
];

function Orb({ size, left, top, delay, color }: { size: number; left: number; top: number; delay: number; color: string }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.set(withRepeat(withTiming(1, { duration: 3200 + delay, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [y, delay]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value * 16 - 8 }, { scale: 1 + y.value * 0.06 }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, left, top, backgroundColor: color }, style]} />;
}

export default function Onboarding() {
  const { colors } = useTheme();
  const toast = useToast();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('MYR');
  const [balance, setBalance] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const start = async () => {
    const trimmed = balance.trim();
    const neg = trimmed.startsWith('-');
    const parsed = trimmed === '' ? 0 : parseMinor(neg ? trimmed.slice(1) : trimmed);
    if (parsed === null) return setError('Enter a valid amount, e.g. 150.50');
    setBusy(true);
    try {
      await useStore.getState().completeOnboarding({ name, currency, openingBalance: neg ? -parsed : parsed });
    } catch {
      setBusy(false);
      toast({ message: 'Could not set things up. Please try again.', tone: 'error' });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.springify().damping(16)}>
            <LinearGradient colors={['#5B3CF0', '#2F5BE0', '#0E9CBF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
              <Orb size={120} left={-30} top={-30} delay={0} color="rgba(255,255,255,0.12)" />
              <Orb size={70} left={230} top={90} delay={500} color="rgba(255,255,255,0.14)" />
              <Orb size={40} left={170} top={20} delay={900} color="rgba(255,255,255,0.18)" />
              <View style={styles.logo}>
                <Text style={{ fontSize: 30 }}>💸</Text>
              </View>
              <Text variant="display" style={{ color: '#fff' }}>
                Tally
              </Text>
              <Text variant="body" style={{ color: 'rgba(255,255,255,0.85)' }}>
                Know where every ringgit goes.
              </Text>
            </LinearGradient>
          </Animated.View>

          <View style={{ gap: 14 }}>
            {POINTS.map((p, i) => (
              <Animated.View key={p.title} entering={FadeInDown.delay(150 + i * 90).springify().damping(16)} style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                <View style={[styles.pointIcon, { backgroundColor: tint(colors.primary, 0.16) }]}>
                  <Icon name={p.icon} size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{p.title}</Text>
                  <Text variant="caption" color="textDim">
                    {p.body}
                  </Text>
                </View>
              </Animated.View>
            ))}
          </View>

          <Animated.View entering={FadeInDown.delay(450).springify().damping(16)} style={{ gap: 16 }}>
            <Field label="What should we call you? (optional)" value={name} onChangeText={setName} maxLength={60} placeholder="Your name" returnKeyType="next" />
            <View style={{ gap: 8 }}>
              <Text variant="overline" color="textFaint">
                Currency
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {CURRENCIES.map((c) => (
                  <Chip key={c.code} label={c.code} selected={currency === c.code} onPress={() => setCurrency(c.code)} />
                ))}
              </View>
            </View>
            <Field label="Cash on hand right now (optional)" value={balance} onChangeText={(v) => { setBalance(v); setError(undefined); }} keyboardType="numbers-and-punctuation" placeholder="0.00" error={error} returnKeyType="done" onSubmitEditing={start} />
            <Button title="Start tracking" icon="check" onPress={start} loading={busy} />
            <Text variant="caption" color="textFaint" style={{ textAlign: 'center' }}>
              You can add bank accounts, e-wallets and cards next.
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: 24, paddingTop: 28, gap: 6, overflow: 'hidden', minHeight: 190, justifyContent: 'flex-end' },
  logo: { width: 60, height: 60, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  pointIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
