import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '../../components/Icon';
import { Money } from '../../components/Money';
import { Text } from '../../components/Text';
import { useToast } from '../../components/Toast';
import { TxRow } from '../../components/TxRow';
import { Chip, EmptyState, IconButton, Segmented, useTabInset } from '../../components/ui';
import { addMonths, dayLabel, monthKey, monthLabel, todayStr } from '../../lib/dates.ts';
import { groupByDay, totals } from '../../lib/stats.ts';
import type { Transaction, TxKind } from '../../lib/types.ts';
import { useStore } from '../../store/useStore';
import { radius, space, useTheme } from '../../theme';

type KindFilter = 'all' | TxKind;

type Item =
  | { type: 'header'; key: string; date: string; net: number }
  | { type: 'row'; key: string; tx: Transaction; first: boolean; last: boolean };

export default function Activity() {
  const { colors } = useTheme();
  const toast = useToast();
  const inset = useTabInset();
  const params = useLocalSearchParams<{ category?: string }>();
  const { transactions, accounts, categories } = useStore();

  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [month, setMonth] = useState<string | null>(monthKey(todayStr()));
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(params.category ?? null);
  const [showFilters, setShowFilters] = useState(!!params.category);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter((t) => {
      if (month && !t.date.startsWith(month)) return false;
      if (kind !== 'all' && t.kind !== kind) return false;
      if (accountId && t.accountId !== accountId && t.toAccountId !== accountId) return false;
      if (categoryId && t.categoryId !== categoryId) return false;
      if (!q) return true;
      const cat = categories.find((c) => c.id === t.categoryId)?.name ?? '';
      const acc = accounts.find((a) => a.id === t.accountId)?.name ?? '';
      return t.note.toLowerCase().includes(q) || cat.toLowerCase().includes(q) || acc.toLowerCase().includes(q) || (t.amount / 100).toFixed(2).includes(q);
    });
  }, [transactions, query, kind, month, accountId, categoryId, categories, accounts]);

  const sum = useMemo(() => totals(filtered), [filtered]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const g of groupByDay(filtered)) {
      out.push({ type: 'header', key: `h${g.date}`, date: g.date, net: g.net });
      g.items.forEach((tx, i) => out.push({ type: 'row', key: tx.id, tx, first: i === 0, last: i === g.items.length - 1 }));
    }
    return out;
  }, [filtered]);

  const activeFilters = (accountId ? 1 : 0) + (categoryId ? 1 : 0);
  const today = todayStr();

  const remove = async (id: string) => {
    const removed = await useStore.getState().deleteTransaction(id);
    if (removed) toast({ message: 'Transaction deleted', actionLabel: 'Undo', onAction: () => void useStore.getState().restoreTransaction(removed) });
  };

  const visibleCats = categories.filter((c) => !c.archived || c.id === categoryId);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.head}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="display">Activity</Text>
          <View>
            <IconButton icon="filter" label="Filters" onPress={() => setShowFilters((s) => !s)} color={activeFilters ? colors.primary : undefined} />
            {activeFilters > 0 && <View style={[styles.badge, { backgroundColor: colors.primary }]} />}
          </View>
        </View>

        <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Icon name="search" size={18} color={colors.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search notes, categories, amounts"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.primary}
            accessibilityLabel="Search transactions"
            returnKeyType="search"
            autoCorrect={false}
            style={{ flex: 1, fontFamily: 'Inter_500Medium', fontSize: 15, color: colors.text, paddingVertical: 11 }}
          />
          {query ? <Icon name="close" size={18} color={colors.textFaint} /> : null}
        </View>

        <View style={styles.monthRow}>
          <IconButton icon="left" label="Previous month" size={34} onPress={() => setMonth(addMonths(month ?? monthKey(today), -1))} />
          <Chip label={month ? monthLabel(month) : 'All time'} selected onPress={() => setMonth(month ? null : monthKey(today))} />
          <IconButton icon="right" label="Next month" size={34} onPress={() => setMonth(addMonths(month ?? monthKey(today), 1))} />
        </View>

        <Segmented<KindFilter>
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: 'All' },
            { value: 'expense', label: 'Expenses' },
            { value: 'income', label: 'Income' },
            { value: 'transfer', label: 'Transfers' },
          ]}
        />

        {showFilters && (
          <Animated.View entering={FadeInDown.duration(200)} style={{ gap: 10 }}>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={[{ id: null as string | null, name: 'All accounts' }, ...accounts.filter((a) => !a.archived)]}
              keyExtractor={(a) => a.id ?? 'all'}
              contentContainerStyle={{ gap: 8 }}
              renderItem={({ item }) => <Chip label={item.name} selected={accountId === item.id} onPress={() => setAccountId(item.id)} />}
            />
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={[{ id: null as string | null, name: 'All categories', icon: undefined as string | undefined, color: undefined as string | undefined }, ...visibleCats]}
              keyExtractor={(c) => c.id ?? 'all'}
              contentContainerStyle={{ gap: 8 }}
              renderItem={({ item }) => <Chip label={item.name} icon={item.icon} color={item.color} selected={categoryId === item.id} onPress={() => setCategoryId(item.id)} />}
            />
          </Animated.View>
        )}

        <View style={styles.summary}>
          <Text variant="caption" color="textDim">
            {filtered.length} {filtered.length === 1 ? 'transaction' : 'transactions'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <Money minor={sum.income} sign variant="caption" color={colors.income} />
            <Money minor={-sum.expense} variant="caption" color={colors.expense} />
          </View>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.key}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: inset + 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={14}
        windowSize={9}
        ListEmptyComponent={
          <EmptyState
            icon={transactions.length === 0 ? '🧾' : '🔍'}
            title={transactions.length === 0 ? 'Nothing here yet' : 'No matches'}
            body={transactions.length === 0 ? 'Your transactions will show up here, grouped by day.' : 'Try another month or clear a filter.'}
          />
        }
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <View style={styles.dayHeader}>
              <Text variant="overline" color="textFaint">
                {dayLabel(item.date, today)}
              </Text>
              {item.net !== 0 ? <Money minor={item.net} sign variant="caption" color={item.net >= 0 ? colors.income : colors.textDim} /> : null}
            </View>
          ) : (
            <Animated.View
              layout={LinearTransition.springify().damping(20)}
              style={{
                overflow: 'hidden',
                borderTopLeftRadius: item.first ? radius.lg : 0,
                borderTopRightRadius: item.first ? radius.lg : 0,
                borderBottomLeftRadius: item.last ? radius.lg : 0,
                borderBottomRightRadius: item.last ? radius.lg : 0,
                borderTopWidth: item.first ? 0 : StyleSheet.hairlineWidth,
                borderTopColor: colors.border,
              }}
            >
              <TxRow tx={item.tx} accounts={accounts} categories={categories} onPress={() => router.push({ pathname: '/add', params: { id: item.tx.id } })} onDelete={() => void remove(item.tx.id)} />
            </Animated.View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: space.lg, paddingTop: space.md, gap: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 4 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, paddingBottom: 8 },
  badge: { position: 'absolute', top: 2, right: 2, width: 9, height: 9, borderRadius: 5 },
});
