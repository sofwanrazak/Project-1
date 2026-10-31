import * as LocalAuthentication from 'expo-local-authentication';
import * as ScreenCapture from 'expo-screen-capture';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useStore } from '../store/useStore';
import { useTheme } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';
import { Button } from './ui';

const SCREEN_KEY = 'tally-privacy';

/** True when the device has any lock (biometric or passcode) we can authenticate against. */
export async function deviceCanAuthenticate() {
  if (Platform.OS === 'web') return false;
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

export async function authenticate(reason: string) {
  const res = await LocalAuthentication.authenticateAsync({ promptMessage: reason, cancelLabel: 'Cancel' });
  return res.success;
}

/**
 * Wraps the app. Locks on cold start and after `lockAfterSec` in the background, and covers the UI
 * whenever the app is not active so balances never show in the app switcher.
 */
export function AppLock({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const lockEnabled = useStore((s) => s.settings.lockEnabled);
  const lockAfterSec = useStore((s) => s.settings.lockAfterSec);
  const block = useStore((s) => s.settings.blockScreenshots);
  const ready = useStore((s) => s.status === 'ready');
  const unlocked = useStore((s) => s.unlocked);

  const [covered, setCovered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const leftAt = useRef<number | null>(null);
  const prompted = useRef(false);

  const unlock = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (!(await deviceCanAuthenticate())) {
        // Nothing to authenticate against (user removed their passcode): don't trap them out of their own data.
        useStore.getState().setUnlocked(true);
        return;
      }
      if (await authenticate('Unlock Tally')) {
        setError(null);
        useStore.getState().setUnlocked(true);
      } else setError('Authentication was cancelled or failed.');
    } catch {
      setError('Could not start authentication.');
    } finally {
      busy.current = false;
    }
  }, []);

  const showLock = ready && lockEnabled && !unlocked && Platform.OS !== 'web';

  // Prompt automatically the first time the lock screen appears on launch.
  useEffect(() => {
    if (showLock && !prompted.current) {
      prompted.current = true;
      void unlock();
    }
  }, [showLock, unlock]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (state) => {
      if (busy.current) return; // the system auth dialog itself makes the app 'inactive'
      if (state === 'active') {
        setCovered(false);
        const away = leftAt.current;
        leftAt.current = null;
        if (lockEnabled && away !== null && Date.now() - away >= lockAfterSec * 1000) {
          useStore.getState().setUnlocked(false);
          prompted.current = true;
          void unlock();
        }
      } else {
        if (lockEnabled) setCovered(true);
        if (leftAt.current === null) leftAt.current = Date.now();
      }
    });
    return () => sub.remove();
  }, [lockEnabled, lockAfterSec, unlock]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    (block ? ScreenCapture.preventScreenCaptureAsync(SCREEN_KEY) : ScreenCapture.allowScreenCaptureAsync(SCREEN_KEY)).catch(() => {});
  }, [block]);

  return (
    <View style={{ flex: 1 }}>
      {/* Children stay mounted so navigation state survives a lock; they are hidden from a11y/touch while locked. */}
      <View style={{ flex: 1 }} importantForAccessibility={showLock ? 'no-hide-descendants' : 'auto'} pointerEvents={showLock ? 'none' : 'auto'}>
        {children}
      </View>
      {(showLock || covered) && (
        <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(220)} style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: colors.bg }]}>
          <View style={[styles.logo, { backgroundColor: colors.brand }]}>
            <Icon name="lock" size={34} color="#fff" />
          </View>
          <Text variant="title">Tally is locked</Text>
          <Text variant="body" color="textDim" style={{ textAlign: 'center' }}>
            Your spending data is private.
          </Text>
          {showLock ? (
            <View style={{ gap: 12, alignItems: 'center', marginTop: 12 }}>
              <Button title="Unlock" onPress={unlock} icon="shield" />
              {error ? (
                <Text variant="caption" color="expense">
                  {error}
                </Text>
              ) : null}
            </View>
          ) : null}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32, zIndex: 100 },
  logo: { width: 84, height: 84, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
});
