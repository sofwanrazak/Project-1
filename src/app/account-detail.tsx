import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Money, useMoney } from '../components/Money';
import { Text } from '../components/Text';
import { TxRow } from '../components/TxRow';
import { WorthCard } from '../components/worth';
import { Button, Card, EmptyState, Header, IconButton, Screen } from '../components/ui';
import { useToday } from '../hooks/useToday';
import { monthEnd, monthKey, monthLabel, monthStart } from '../lib/dates.ts';
import { ACCOUNT_TYPES } from '../lib/defaults.ts';
import { accountBalances } from '../lib/stats.ts';
import { useStore } from '../store/useStore';
import { radius, useTheme } from '../theme';

/** One account: its balance history, this month's money in and out, and its latest transactions. */
export default function AccountDetail() {
  const { colors } = useTheme();
  const fmt = useMoney();
  const today = useToday();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { accounts, categories, transactions } = useStore();
  const account = accounts.find((a) => a.id === id);

  const mine = useMemo(() => transactions.filter((t) => t.accountId === id || t.toAccountId === id), [transactions, id]);
  const balance = useMemo(() => accountBalances(accounts, transactions).get(id ?? '') ?? 0, [accounts, transactions, id]);
  const month = useMemo(() => {
    const from = monthStart(monthKey(today));
    const to = monthEnd(monthKey(today));
    let inn = 0;
    let out = 0;
    for (const t of mine) {
      if (t.date < from || t.date > to) continue;
      if (t.kind === 'income') inn += t.amount;
      else if (t.kind === 'expense') out += t.amount;
      else if (t.kind === 'transfer') {
        if (t.toAccountId === id) inn += t.amount;
        else out += t.amount;
      }
    }
    return { inn, out };
  }, [mine, today, id]);

  if (!account) {
    return (
      <Screen header={<Header title="Account" left={<IconButton icon="left" label="Back" onPress={() => router.back()} />} />}>
        <Card>
          <EmptyState icon="🏦" title="Account not found" body="It may have been removed." />
        </Card>
      </Screen>
    );
  }

  const typeLabel = ACCOUNT_TYPES.find((t) => t.type === account.type)?.label ?? '';
  return (
    <Screen
      header={
        <Header
          title={account.name}
          subtitle={`${typeLabel}${account.archived ? ' · archived' : ''}`}
          left={<IconButton icon="left" label="Back" onPress={() => router.back()} />}
          right={<IconButton icon="edit" label="Edit account" onPress={() => router.push({ pathname: '/account-edit', params: { id: account.id } })} />}
        />
      }
    >
      <WorthCard accountId={account.id} today={today} title="Balance" />

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text variant="caption" color="textDim">
            In · {monthLabel(monthKey(today), false)}
          </Text>
          <Money minor={month.inn} variant="h2" color={colors.income} />
        </View>
        <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text variant="caption" color="textDim">
            Out · {monthLabel(monthKey(today), false)}
          </Text>
          <Money minor={month.out} variant="h2" />
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="h2">Recent</Text>
          {mine.length > 8 && <Button title="See all" size="sm" variant="ghost" onPress={() => router.push({ pathname: '/activity', params: { account: account.id } })} />}
        </View>
        {mine.length === 0 ? (
          <Card>
            <Text variant="body" color="textDim" style={{ textAlign: 'center' }}>
              Nothing logged to this account yet. Balance is {fmt(balance)}.
            </Text>
          </Card>
        ) : (
          <Card pad={false} style={{ overflow: 'hidden' }}>
            {mine.slice(0, 8).map((t, i) => (
              <View key={t.id} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : undefined}>
                <TxRow tx={t} accounts={accounts} categories={categories} onPress={() => router.push({ pathname: '/add', params: { id: t.id } })} />
              </View>
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stat: { flex: 1, padding: 14, gap: 4, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
});
