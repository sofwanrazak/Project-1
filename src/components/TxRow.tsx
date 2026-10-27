import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import type { Account, Category, Transaction } from '../lib/types.ts';
import { useTheme } from '../theme';
import { Icon } from './Icon';
import { Money } from './Money';
import { Text } from './Text';
import { CategoryBadge, haptic } from './ui';

export function TxRow({
  tx,
  accounts,
  categories,
  onPress,
  onDelete,
  showAccount = true,
}: {
  tx: Transaction;
  accounts: Account[];
  categories: Category[];
  onPress?: () => void;
  onDelete?: () => void;
  showAccount?: boolean;
}) {
  const { colors } = useTheme();
  const swipe = useRef<SwipeableMethods>(null);
  const cat = categories.find((c) => c.id === tx.categoryId);
  const acc = accounts.find((a) => a.id === tx.accountId);
  const to = accounts.find((a) => a.id === tx.toAccountId);

  const isTransfer = tx.kind === 'transfer';
  const title = tx.note || (isTransfer ? 'Transfer' : (cat?.name ?? 'Uncategorised'));
  const sub = isTransfer ? `${acc?.name ?? '?'} → ${to?.name ?? '?'}` : [cat?.name, showAccount ? acc?.name : null].filter(Boolean).join(' · ');
  const color = tx.kind === 'income' ? colors.income : tx.kind === 'expense' ? colors.text : colors.textDim;
  const signed = tx.kind === 'expense' ? -tx.amount : tx.kind === 'income' ? tx.amount : tx.amount;

  const row = (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${sub}`}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 }]}
    >
      {isTransfer ? (
        <View style={[styles.transferIcon, { backgroundColor: colors.cardAlt }]}>
          <Icon name="swap" size={20} color={colors.primary} />
        </View>
      ) : (
        <CategoryBadge icon={cat?.icon ?? '❓'} color={cat?.color ?? colors.textFaint} />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" color="textDim" numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', maxWidth: 140 }}>
        <Money minor={signed} sign={tx.kind === 'income'} color={color} />
        {tx.importHash ? (
          <Text variant="caption" color="textFaint" style={{ fontSize: 10, lineHeight: 12 }}>
            imported
          </Text>
        ) : null}
      </View>
    </Pressable>
  );

  if (!onDelete) return row;
  return (
    <ReanimatedSwipeable
      ref={swipe}
      friction={2}
      overshootRight={false}
      rightThreshold={56}
      onSwipeableOpen={() => {
        haptic.warn();
        swipe.current?.close();
        onDelete();
      }}
      renderRightActions={() => (
        <View style={[styles.deleteAction, { backgroundColor: colors.expense }]}>
          <Icon name="trash" size={22} color="#fff" />
        </View>
      )}
    >
      {row}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  transferIcon: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  deleteAction: { width: 88, alignItems: 'center', justifyContent: 'center' },
});
