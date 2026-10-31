import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { netWorthSeries } from '../lib/analytics.ts';
import { addDays, shortDate } from '../lib/dates.ts';
import { useStore } from '../store/useStore';
import { useTheme } from '../theme';
import { LineChart } from './charts';
import { Money, useMoney } from './Money';
import { Text } from './Text';
import { Card, Chip } from './ui';

const RANGES = [
  { days: 30, label: '30 days', every: 7 },
  { days: 90, label: '3 months', every: 15 },
  { days: 365, label: '1 year', every: 60 },
] as const;

/**
 * Balance over time for all accounts, or one account. Drag across the line to read any day.
 * The headline shows the change across the chosen range, so "am I better off?" has one answer.
 */
export function WorthCard({ accountId, today, title }: { accountId?: string; today: string; title: string }) {
  const { colors } = useTheme();
  const fmt = useMoney();
  const { accounts, transactions } = useStore();
  const [range, setRange] = useState<(typeof RANGES)[number]['days']>(90);
  const [sel, setSel] = useState<number | null>(null);
  const r = RANGES.find((x) => x.days === range) ?? RANGES[1];

  const s = useMemo(() => netWorthSeries(accounts, transactions, addDays(today, -(range - 1)), today, accountId), [accounts, transactions, today, range, accountId]);
  const last = s.values.length - 1;
  const idx = sel !== null && sel <= last ? sel : last;
  const shown = s.values[idx] ?? 0;
  const change = (s.values[last] ?? 0) - (s.values[0] ?? 0);
  const up = change >= 0;

  return (
    <Card style={{ gap: 14 }}>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text variant="overline" color="textFaint">
            {sel !== null && sel < last ? shortDate(s.dates[idx]) : title}
          </Text>
          <Money minor={shown} variant="display" color={shown < 0 ? colors.expense : colors.text} />
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Money minor={change} variant="bodyStrong" sign color={up ? colors.income : colors.expense} />
          <Text variant="caption" color="textDim">
            over {r.label}
          </Text>
        </View>
      </View>
      <LineChart
        series={[{ key: 'worth', label: 'Balance', values: s.values, color: colors.brand, fill: true }]}
        xLabels={s.dates.map((d) => shortDate(d))}
        axisEvery={r.every}
        zeroBase={false}
        height={150}
        format={(v) => fmt(v)}
        onSelect={setSel}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {RANGES.map((x) => (
          <Chip
            key={x.days}
            label={x.label}
            selected={range === x.days}
            onPress={() => {
              setRange(x.days);
              setSel(null);
            }}
          />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
});
