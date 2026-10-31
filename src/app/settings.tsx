import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, View } from 'react-native';

import { authenticate, deviceCanAuthenticate } from '../components/AppLock';
import { Text } from '../components/Text';
import { useToast } from '../components/Toast';
import { Card, Chip, Field, Header, IconButton, Row, Screen, Segmented, Toggle } from '../components/ui';
import { BackupError, buildBackup, parseBackup } from '../lib/backup.ts';
import { toCsv } from '../lib/csv.ts';
import { CURRENCIES } from '../lib/defaults.ts';
import { pickTextFile, shareTextFile } from '../lib/files.ts';
import type { Settings } from '../lib/types.ts';
import { remindersSupported, requestReminderPermission } from '../reminders';
import { useStore } from '../store/useStore';
import { space, tint, useTheme } from '../theme';

const REMIND_TIMES = [
  { label: '8 pm', value: '20:00' },
  { label: '9 pm', value: '21:00' },
  { label: '10 pm', value: '22:00' },
  { label: '11 pm', value: '23:00' },
];

const LOCK_OPTIONS = [
  { label: 'Immediately', value: 0 },
  { label: '30 sec', value: 30 },
  { label: '1 min', value: 60 },
  { label: '5 min', value: 300 },
];

function confirm(title: string, message: string, action: string, onYes: () => void) {
  if (Platform.OS === 'web') return onYes();
  Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: action, style: 'destructive', onPress: onYes }]);
}

export default function SettingsScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const settings = useStore((s) => s.settings);
  const encrypted = useStore((s) => s.encrypted);
  const [name, setName] = useState(settings.name);
  const set = (p: Partial<Settings>) => void useStore.getState().updateSettings(p);

  const toggleLock = async (on: boolean) => {
    if (!on) return set({ lockEnabled: false });
    if (!(await deviceCanAuthenticate())) {
      return toast({ message: Platform.OS === 'web' ? 'App lock is only available in the mobile app.' : 'Set up a screen lock or Face ID / fingerprint on your device first.', tone: 'error' });
    }
    // Prove the user can pass the check before turning it on, so they can't lock themselves out.
    if (await authenticate('Confirm to turn on app lock')) {
      useStore.getState().setUnlocked(true);
      set({ lockEnabled: true });
    }
  };

  /** Notification permission is asked for here, at the moment the user turns something on, never earlier. */
  const toggleReminder = async (key: 'remindDaily' | 'remindWeekly' | 'remindBills', on: boolean) => {
    if (!on) return set({ [key]: false });
    if (await requestReminderPermission()) set({ [key]: true, askedReminders: true });
    else toast({ message: 'Notifications are off for Tally. Allow them in your phone settings first.', tone: 'error' });
  };

  const exportCsv = async () => {
    const { transactions, accounts, categories } = useStore.getState();
    const name = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name ?? '';
    const rows: (string | number)[][] = [['Date', 'Type', 'Amount', 'Account', 'To account', 'Category', 'Note']];
    for (const t of [...transactions].reverse()) {
      rows.push([t.date, t.kind, (t.amount / 100).toFixed(2), name(accounts, t.accountId), name(accounts, t.toAccountId), name(categories, t.categoryId), t.note]);
    }
    try {
      await shareTextFile('transactions.csv', toCsv(rows), 'text/csv');
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Export failed.', tone: 'error' });
    }
  };

  const backup = async () => {
    try {
      await shareTextFile('backup.json', buildBackup(useStore.getState().snapshot()), 'application/json');
      set({ lastBackupAt: Date.now() });
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Backup failed.', tone: 'error' });
    }
  };

  const restore = async () => {
    try {
      const f = await pickTextFile(['application/json', 'text/plain']);
      if (!f) return;
      const snap = parseBackup(f.text);
      confirm('Replace all data?', `This replaces everything in the app with the backup (${snap.transactions.length} transactions). This can’t be undone.`, 'Replace', () => {
        void useStore
          .getState()
          .restore(snap)
          .then(() => toast({ message: 'Backup restored' }))
          .catch(() => toast({ message: 'Restore failed. Your data is unchanged.', tone: 'error' }));
      });
    } catch (e) {
      toast({ message: e instanceof BackupError ? `Not a valid backup: ${e.message}` : e instanceof Error ? e.message : 'Could not read that file.', tone: 'error' });
    }
  };

  const erase = () =>
    confirm('Erase everything?', 'All transactions, accounts, categories and budgets are permanently deleted from this device.', 'Erase', () =>
      confirm('Are you sure?', 'There is no way to get this back unless you saved a backup.', 'Erase everything', () => {
        void useStore.getState().eraseAll();
      }),
    );

  return (
    <Screen header={<Header title="Settings" left={<IconButton icon="left" label="Back" onPress={() => router.back()} />} />}>
      <Section title="Profile">
        <Field label="Your name" value={name} onChangeText={setName} onEndEditing={() => set({ name: name.trim().slice(0, 60) })} maxLength={60} placeholder="What should we call you?" returnKeyType="done" />
        <Text variant="overline" color="textFaint">
          Currency
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CURRENCIES.map((c) => (
            <Chip key={c.code} label={c.code} selected={settings.currency === c.code} onPress={() => set({ currency: c.code })} />
          ))}
        </View>
      </Section>

      <Section title="Appearance">
        <Segmented value={settings.theme} onChange={(theme) => set({ theme })} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        <Row title="Hide amounts" subtitle="Mask balances and totals across the app" right={<Toggle label="Hide amounts" value={settings.hideAmounts} onChange={(v) => set({ hideAmounts: v })} />} last />
      </Section>

      {remindersSupported && (
        <Section title="Reminders">
          <Row icon="info" title="Evening nudge" subtitle="Only if you have not logged today" right={<Toggle label="Evening nudge" value={settings.remindDaily} onChange={(v) => void toggleReminder('remindDaily', v)} />} />
          {settings.remindDaily && (
            <View style={{ gap: 8, paddingBottom: 12 }}>
              <Text variant="caption" color="textDim">
                Remind me at
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {REMIND_TIMES.map((o) => (
                  <Chip key={o.value} label={o.label} selected={settings.remindTime === o.value} onPress={() => set({ remindTime: o.value })} />
                ))}
              </View>
            </View>
          )}
          <Row icon="chart" title="Weekly recap" subtitle="Sunday evening" right={<Toggle label="Weekly recap" value={settings.remindWeekly} onChange={(v) => void toggleReminder('remindWeekly', v)} />} />
          <Row icon="alert" title="Bill reminders" subtitle="The day before a detected bill" right={<Toggle label="Bill reminders" value={settings.remindBills} onChange={(v) => void toggleReminder('remindBills', v)} />} last />
          <Text variant="caption" color="textFaint">
            Reminders never show amounts, so nothing private appears on your lock screen.
          </Text>
        </Section>
      )}

      <Section title="Security">
        <Row icon="lock" title="App lock" subtitle="Face ID / fingerprint / device passcode" right={<Toggle label="App lock" value={settings.lockEnabled} onChange={toggleLock} />} />
        {settings.lockEnabled && (
          <View style={{ gap: 8, paddingBottom: 12 }}>
            <Text variant="caption" color="textDim">
              Lock after leaving the app for
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {LOCK_OPTIONS.map((o) => (
                <Chip key={o.value} label={o.label} selected={settings.lockAfterSec === o.value} onPress={() => set({ lockAfterSec: o.value })} />
              ))}
            </View>
          </View>
        )}
        <Row icon="eye" title="Block screenshots" subtitle="Also hides the app in the app switcher" right={<Toggle label="Block screenshots" value={settings.blockScreenshots} onChange={(v) => set({ blockScreenshots: v })} />} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 }}>
          <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(encrypted ? colors.income : colors.warn, 0.16) }}>
            <Text style={{ fontSize: 16 }}>{encrypted ? '🛡️' : '⚠️'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">{encrypted ? 'Database encrypted' : 'Database not encrypted'}</Text>
            <Text variant="caption" color="textDim">
              {encrypted ? 'AES-256 (SQLCipher). The key lives in the secure keychain and never leaves this device.' : 'Encryption needs the installed app build; this environment (Expo Go or browser preview) stores data unencrypted.'}
            </Text>
          </View>
        </View>
      </Section>

      <Section title="Data">
        <Row icon="chart" title="Weekly recap" subtitle="Your last week, in a few taps" onPress={() => router.push('/recap')} />
        {settings.checklistHidden && <Row icon="check" title="Show setup checklist" onPress={() => set({ checklistHidden: false })} />}
        <Row icon="wallet" title="Accounts" onPress={() => router.push('/accounts')} />
        <Row icon="tag" title="Categories" onPress={() => router.push('/categories')} />
        <Row icon="upload" title="Import bank statement (CSV)" subtitle="Maybank, CIMB, RHB, Public Bank and more" onPress={() => router.push('/import')} />
        <Row icon="download" title="Export transactions (CSV)" onPress={exportCsv} />
        <Row icon="download" title="Back up everything (JSON)" subtitle="Plain-text file. Keep it somewhere private." onPress={backup} />
        <Row icon="upload" title="Restore from backup" onPress={restore} />
        <Row icon="trash" title="Erase all data" danger onPress={erase} last />
      </Section>

      <Section title="Bank sync">
        <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 4 }}>
          <Text style={{ fontSize: 22 }}>🏦</Text>
          <Text variant="caption" color="textDim" style={{ flex: 1 }}>
            Live bank connection is planned for the next release. Malaysian banks don’t offer a consumer open-banking API yet, so it needs a licensed aggregator and a small backend. Until then, import your statement CSV: it dedupes, auto-categorizes and takes about 10 seconds.
          </Text>
        </View>
      </Section>

      <Text variant="caption" color="textFaint" style={{ textAlign: 'center' }}>
        Tally {Constants.expoConfig?.version ?? '1.0.0'} · Your data stays on your device
      </Text>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text variant="overline" color="textFaint" style={{ paddingLeft: 4 }}>
        {title}
      </Text>
      <Card style={{ gap: space.md }}>{children}</Card>
    </View>
  );
}
