import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { Swatches } from '../components/Swatches';
import { Text } from '../components/Text';
import { useToast } from '../components/Toast';
import { Button, Chip, Field, Header, IconButton, Screen } from '../components/ui';
import { ACCOUNT_TYPES, PALETTE } from '../lib/defaults.ts';
import { parseMinor } from '../lib/money.ts';
import type { AccountType } from '../lib/types.ts';
import { useStore } from '../store/useStore';
import { space } from '../theme';

/** Opening balance may be negative (credit card debt). */
function parseSigned(s: string): number | null {
  const t = s.trim();
  if (t === '' || t === '-') return 0;
  const neg = t.startsWith('-');
  const v = parseMinor(neg ? t.slice(1) : t);
  return v === null ? null : neg ? -v : v;
}

export default function AccountEdit() {
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useStore((s) => s.accounts.find((a) => a.id === id));
  const accountCount = useStore((s) => s.accounts.length);
  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<AccountType>(existing?.type ?? 'bank');
  const [balance, setBalance] = useState(existing ? (existing.openingBalance / 100).toFixed(2).replace(/\.00$/, '') : '');
  const [color, setColor] = useState(existing?.color ?? PALETTE[accountCount % 8]);
  const [error, setError] = useState<{ name?: string; balance?: string }>({});

  const save = async () => {
    const opening = parseSigned(balance);
    const e: typeof error = {};
    if (!name.trim()) e.name = 'Give the account a name.';
    if (opening === null) e.balance = 'Enter a valid amount, e.g. 1250.50';
    setError(e);
    if (e.name || e.balance || opening === null) return;
    try {
      await useStore.getState().saveAccount({ id: existing?.id, name, type, openingBalance: opening, color });
      router.back();
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not save.', tone: 'error' });
    }
  };

  const remove = () => {
    if (!existing) return;
    const go = async () => {
      const r = await useStore.getState().removeAccount(existing.id);
      router.back();
      toast({ message: r === 'deleted' ? 'Account deleted' : 'Account archived (it has transactions)' });
    };
    if (Platform.OS === 'web') return void go();
    Alert.alert(`Remove “${existing.name}”?`, 'Accounts with transactions are archived instead, so your history stays correct.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void go() }]);
  };

  const restore = async () => {
    if (!existing) return;
    await useStore.getState().setArchived('accounts', existing.id, false);
    router.back();
  };

  return (
    <Screen scroll={false} edges={['top', 'bottom']} header={<Header title={existing ? 'Edit account' : 'New account'} left={<IconButton icon="close" label="Close" onPress={() => router.back()} />} />}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl }} keyboardShouldPersistTaps="handled">
          <Field label="Name" value={name} onChangeText={(v) => { setName(v); setError((x) => ({ ...x, name: undefined })); }} placeholder="e.g. Maybank, TNG eWallet" maxLength={40} autoFocus={!existing} error={error.name} />
          <View style={{ gap: 8 }}>
            <Text variant="overline" color="textFaint">Type</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {ACCOUNT_TYPES.map((t) => (
                <Chip key={t.type} label={t.label} icon={t.icon} selected={type === t.type} onPress={() => setType(t.type)} />
              ))}
            </View>
          </View>
          <Field label="Current balance when you start tracking" value={balance} onChangeText={(v) => { setBalance(v); setError((x) => ({ ...x, balance: undefined })); }} keyboardType="numbers-and-punctuation" placeholder="0.00" error={error.balance} />
          <Text variant="caption" color="textDim" style={{ marginTop: -12 }}>
            Use a negative number for debt, like a credit card balance owed (e.g. -850).
          </Text>
          <View style={{ gap: 10 }}>
            <Text variant="overline" color="textFaint">Color</Text>
            <Swatches value={color} onChange={setColor} />
          </View>
        </ScrollView>
        <View style={{ padding: space.lg, gap: 10 }}>
          <Button title="Save account" icon="check" onPress={save} />
          {existing?.archived ? <Button title="Restore account" variant="secondary" onPress={restore} /> : null}
          {existing && !existing.archived && <Button title="Remove account" variant="danger" icon="trash" onPress={remove} />}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
