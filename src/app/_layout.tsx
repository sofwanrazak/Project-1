import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, useFonts } from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Alert, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppLock } from '../components/AppLock';
import { Text } from '../components/Text';
import { ToastProvider } from '../components/Toast';
import { Button } from '../components/ui';
import { useStore } from '../store/useStore';
import { ThemeProvider, useTheme } from '../theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });
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
            <Stack.Screen name="categories" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="import" />
          </Stack.Protected>
        </Stack>
      </AppLock>
    </ToastProvider>
  );
}
