import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Money } from '../components/Money';
import { WorthCard } from '../components/worth';
import { Text } from '../components/Text';
import { Button, Card, EmptyState, Header, IconButton, PressableScale, Screen } from '../components/ui';
import { useToday } from '../hooks/useToday';
import { ACCOUNT_TYPES, accountIcon } from '../lib/defaults.ts';
import { accountBalances } from '../lib/stats.ts';
import { useStore } from '../store/useStore';
import { tint, useTheme } from '../theme';

export default function Accounts() {
  const { colors } = useTheme();
  const today = useToday();
  const { accounts, transactions } = useStore();
  const [showArchived, setShowArchived] = useState(false);
  const bal = useMemo(() => accountBalances(accounts, transactions), [accounts, transactions]);
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);
  const shown = showArchived ? [...active, ...archived] : active;

  return (
    <Screen header={<Header title="Accounts" left={<IconButton icon="left" label="Back" onPress={() => router.back()} />} right={<IconButton icon="plus" label="Add account" onPress={() => router.push('/account-edit')} />} />}>
      {active.length > 0 && <WorthCard today={today} title="Net worth" />}
      {shown.length === 0 ? (
        <Card>
          <EmptyState icon="🏦" title="No accounts" body="Add the places your money lives: cash, bank, cards, e-wallets." action={<Button title="Add account" icon="plus" onPress={() => router.push('/account-edit')} />} />
        </Card>
      ) : (
        shown.map((a) => (
          <PressableScale key={a.id} onPress={() => router.push({ pathname: '/account-detail', params: { id: a.id } })} accessibilityRole="button" accessibilityLabel={`${a.name}${a.archived ? ', archived' : ''}. Open details`}>
            <Card style={[styles.row, a.archived ? { opacity: 0.55 } : null]}>
              <View style={[styles.icon, { backgroundColor: tint(a.color, 0.2) }]}>
                <Text style={{ fontSize: 22 }}>{accountIcon(a.type)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{a.name}</Text>
                <Text variant="caption" color="textDim">
                  {ACCOUNT_TYPES.find((t) => t.type === a.type)?.label}
                  {a.archived ? ' · archived' : ''}
                </Text>
              </View>
              <Money minor={bal.get(a.id) ?? 0} variant="h2" color={(bal.get(a.id) ?? 0) < 0 ? colors.expense : colors.text} />
            </Card>
          </PressableScale>
        ))
      )}
      {archived.length > 0 && <Button title={showArchived ? 'Hide archived' : `Show archived (${archived.length})`} variant="ghost" onPress={() => setShowArchived((s) => !s)} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
