import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, useFonts } from '@expo-google-fonts/inter';
import { BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Alert, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppLock } from '../components/AppLock';
import { CelebrationHost } from '../components/celebrate';
import { Text } from '../components/Text';
import { ToastProvider, useToast } from '../components/Toast';
import { Button } from '../components/ui';
import { useToday } from '../hooks/useToday';
import { nextDue, unmanaged } from '../lib/bills.ts';
import type { ReminderBill } from '../lib/reminderPlan.ts';
import { detectRecurring } from '../lib/recurring.ts';
import { onReminderTap, remindersSupported, syncReminders } from '../reminders';
import { onShortcut, registerShortcuts } from '../shortcuts';
import { addDays, todayStr } from '../lib/dates.ts';
import { useStore } from '../store/useStore';
import { ThemeProvider, useTheme } from '../theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold });
  const status = useStore((s) => s.status);

  useEffect(() => {
    void useStore.getState().init();
  }, []);

  const ready = (fontsLoaded || !!fontError) && status !== 'loading';
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <Shell />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Shell() {
  const { colors, isDark } = useTheme();
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const onboarded = useStore((s) => s.settings.onboarded);

  if (status === 'error') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Text style={{ fontSize: 44 }}>🔒</Text>
        <Text variant="title">Can’t open your data</Text>
        <Text variant="body" color="textDim" style={{ textAlign: 'center' }}>
          {error}
        </Text>
        <Text variant="caption" color="textFaint" style={{ textAlign: 'center' }}>
          Your data stays encrypted on this device. If the encryption key was lost (for example after a restore from a cloud backup), the only way forward is to start fresh and restore from your own exported backup file.
        </Text>
        <View style={{ gap: 10, marginTop: 12, alignSelf: 'stretch' }}>
          <Button title="Try again" onPress={() => void useStore.getState().init()} />
          <Button
            title="Erase local data and start fresh"
            variant="danger"
            onPress={() => {
              const go = () => void useStore.getState().resetAfterError();
              if (Platform.OS === 'web') go();
              else Alert.alert('Erase all local data?', 'This permanently deletes the encrypted database on this device.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Erase', style: 'destructive', onPress: go }]);
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <ToastProvider>
      <AppLock>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ReminderSync />
        <ShortcutSync />
        <BillSync />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
          <Stack.Protected guard={!onboarded}>
            <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          </Stack.Protected>
          <Stack.Protected guard={onboarded}>
            <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
            <Stack.Screen name="add" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="account-edit" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="category-edit" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="budget-edit" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="accounts" />
            <Stack.Screen name="account-detail" />
            <Stack.Screen name="categories" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="import" />
            <Stack.Screen name="goal-edit" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="goal-add" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="bills" />
            <Stack.Screen name="bill-edit" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="recap" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          </Stack.Protected>
        </Stack>
        <CelebrationHost />
      </AppLock>
    </ToastProvider>
  );
}

/**
 * Keeps local reminders in step with what the user has done. Notifications cannot check state when they
 * fire, so the plan is rebuilt whenever something relevant changes (logging today removes tonight's nudge).
 */
function ReminderSync() {
  const ready = useStore((s) => s.status === 'ready' && s.settings.onboarded);
  const transactions = useStore((s) => s.transactions);
  const settings = useStore((s) => s.settings);
  const bills = useStore((s) => s.bills);
  const today = useToday();

  useEffect(() => {
    if (!ready || !remindersSupported) return;
    const timer = setTimeout(() => {
      const loggedToday = transactions.some((t) => t.date === today && !t.importHash) || settings.noSpendDays.includes(today);
      // Managed bills first, then detected repeats that are not already managed.
      const managed: ReminderBill[] = bills
        .filter((b) => !b.archived)
        .map((b) => ({ key: b.id, name: b.name, nextDate: nextDue(b) }))
        .filter((b) => b.nextDate <= addDays(today, 14));
      const guessed = unmanaged(detectRecurring(transactions, today), bills);
      void syncReminders({ settings, loggedToday, bills: [...managed, ...guessed], today }).catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [ready, transactions, settings, bills, today]);

  useEffect(() => onReminderTap((route) => router.push(route)), []);
  return null;
}

/**
 * Logs auto-post bills the moment they fall due (and any that fell due while the app was closed).
 * Idempotent: each occurrence is keyed, so reopening the app never double-posts.
 */
function BillSync() {
  const ready = useStore((s) => s.status === 'ready' && s.settings.onboarded);
  const toast = useToast();
  const today = useToday();

  useEffect(() => {
    if (!ready) return;
    void useStore
      .getState()
      .settleDueBills(today)
      .then((n) => {
        if (n > 0) toast({ message: n === 1 ? 'Logged 1 bill that fell due' : `Logged ${n} bills that fell due`, actionLabel: 'View', onAction: () => router.push('/bills') });
      })
      .catch(() => {});
  }, [ready, today, toast]);
  return null;
}

/**
 * Long-press shortcuts on the app icon. They act once the app is ready (and unlocked, since the lock screen
 * sits on top), so a cold start from a shortcut still lands where the user asked.
 */
function ShortcutSync() {
  const ready = useStore((s) => s.status === 'ready' && s.settings.onboarded);
  const toast = useToast();

  useEffect(() => {
    if (!ready) return;
    void registerShortcuts();
    return onShortcut((id) => {
      if (id === 'add') router.push('/add');
      else if (id === 'recap') router.push('/recap');
      else {
        void useStore.getState().markNoSpend(todayStr());
        toast({ message: 'No spend today, logged on the tally' });
      }
    });
  }, [ready, toast]);
  return null;
}
