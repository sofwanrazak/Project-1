import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Money } from '../components/Money';
import { Text } from '../components/Text';
import { useToast } from '../components/Toast';
import { Button, Card, CategoryBadge, Chip, EmptyState, Header, IconButton, Screen, Segmented, Toggle } from '../components/ui';
import { detectDateFormat, guessColumns, parseAmount, parseCsv, parseDate, type DateFormat } from '../lib/csv.ts';
import { pickTextFile } from '../lib/files.ts';
import { planImport, type Mapping } from '../lib/importer.ts';
import { newId, useStore } from '../store/useStore';
import { space, useTheme } from '../theme';

/** Without a header row, infer columns by looking at what the values parse as. */
function guessWithoutHeader(rows: string[][]): Omit<Mapping, 'format' | 'invert'> {
  const sample = rows.slice(0, 30);
  const cols = Math.max(...sample.map((r) => r.length), 0);
  let date = 0;
  let amount = -1;
  let description = 0;
  let bestDate = -1;
  let bestNum = -1;
  let bestLen = -1;
  for (let c = 0; c < cols; c++) {
    const vals = sample.map((r) => r[c] ?? '').filter(Boolean);
    if (!vals.length) continue;
    const dateScore = vals.filter((v) => parseDate(v, 'DMY')).length / vals.length;
    const numScore = vals.filter((v) => parseAmount(v) !== null && !parseDate(v, 'DMY')).length / vals.length;
    const avgLen = vals.reduce((s, v) => s + v.length, 0) / vals.length;
    if (dateScore > bestDate && dateScore >= 0.6) {
      bestDate = dateScore;
      date = c;
    }
    if (numScore >= bestNum && numScore >= 0.6) {
      bestNum = numScore;
      amount = c;
    }
    if (dateScore < 0.6 && numScore < 0.6 && avgLen > bestLen) {
      bestLen = avgLen;
      description = c;
    }
  }
  return { date, description, amount, debit: -1, credit: -1 };
}

export default function ImportScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const { accounts, categories, transactions } = useStore();
  const activeAccounts = accounts.filter((a) => !a.archived);

  const [fileName, setFileName] = useState<string | null>(null);
  const [all, setAll] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Mapping>({ date: 0, description: 1, amount: 2, debit: -1, credit: -1, format: 'DMY', invert: false });
  const [accountId, setAccountId] = useState<string | null>(activeAccounts[0]?.id ?? null);
  const [busy, setBusy] = useState(false);

  const header = hasHeader ? (all[0] ?? []) : [];
  const rows = hasHeader ? all.slice(1) : all;
  const colCount = Math.max(...all.slice(0, 50).map((r) => r.length), 0);
  const label = (i: number) => (header[i]?.trim() ? header[i].trim().slice(0, 24) : `Column ${i + 1}`);
  const split = mapping.amount < 0;

  const apply = (data: string[][], headerRow: boolean, keepFormat?: DateFormat) => {
    const head = headerRow ? data[0] : null;
    const body = headerRow ? data.slice(1) : data;
    const g = head ? guessColumns(head) : guessWithoutHeader(body);
    const col = (v: number, d: number) => (v >= 0 ? v : d);
    const dateCol = col(g.date, 0);
    setMapping({
      date: dateCol,
      description: col(g.description, Math.min(1, Math.max(0, (head?.length ?? 2) - 1))),
      amount: g.amount >= 0 ? g.amount : g.debit >= 0 && g.credit >= 0 ? -1 : Math.max(0, (head?.length ?? 3) - 1),
      debit: g.debit,
      credit: g.credit,
      format: keepFormat ?? detectDateFormat(body.slice(0, 50).map((r) => r[dateCol] ?? '')),
      invert: false,
    });
  };

  const pick = async () => {
    try {
      const f = await pickTextFile(['text/csv', 'text/comma-separated-values', 'application/csv', 'text/plain', 'application/vnd.ms-excel']);
      if (!f) return;
      const data = parseCsv(f.text);
      if (data.length < 2) return toast({ message: 'That file has no rows to import.', tone: 'error' });
      const firstLooksLikeData = !!parseDate(data[0].find((c) => parseDate(c, 'DMY')) ?? '', 'DMY');
      setFileName(f.name);
      setAll(data);
      setHasHeader(!firstLooksLikeData);
      apply(data, !firstLooksLikeData);
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Could not read that file.', tone: 'error' });
    }
  };

  const existingHashes = useMemo(() => new Set(transactions.map((t) => t.importHash).filter((h): h is string => !!h)), [transactions]);
  const plan = useMemo(() => {
    if (!accountId || rows.length === 0) return null;
    return planImport({ rows, mapping, accountId, categories, existingHashes, newId, now: 0 });
  }, [rows, mapping, accountId, categories, existingHashes]);

  const doImport = async () => {
    if (!plan || plan.items.length === 0) return;
    setBusy(true);
    try {
      const n = await useStore.getState().importTransactions(plan.items);
      toast({ message: `Imported ${n} transaction${n === 1 ? '' : 's'}` });
      router.back();
    } catch {
      setBusy(false);
      toast({ message: 'Import failed. Nothing was added.', tone: 'error' });
    }
  };

  // A render helper, not a component: an inner component would remount (and reset scroll) on every state change.
  const colPicker = (field: 'date' | 'description' | 'amount' | 'debit' | 'credit', title: string, optional = false) => (
    <View key={field} style={{ gap: 8 }}>
      <Text variant="overline" color="textFaint">
        {title}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {optional && <Chip label="None" selected={mapping[field] < 0} onPress={() => setMapping({ ...mapping, [field]: -1 })} />}
        {Array.from({ length: colCount }, (_, i) => (
          <Chip key={i} label={label(i)} selected={mapping[field] === i} onPress={() => setMapping({ ...mapping, [field]: i })} />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <Screen header={<Header title="Import statement" left={<IconButton icon="left" label="Back" onPress={() => router.back()} />} />}>
      {!fileName ? (
        <Card>
          <EmptyState
            icon="📄"
            title="Import a bank statement"
            body="Export a CSV from your bank’s website or app (Maybank2u, CIMB Clicks, RHB, Public Bank, …) and pick it here. It’s read on your phone. Nothing is uploaded."
            action={<Button title="Choose CSV file" icon="upload" onPress={pick} />}
          />
        </Card>
      ) : (
        <>
          <Card style={{ gap: 4 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {fileName}
            </Text>
            <Text variant="caption" color="textDim">
              {rows.length} rows · {colCount} columns
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
              <Text variant="body">First row is a header</Text>
              <Toggle
                label="First row is a header"
                value={hasHeader}
                onChange={(v) => {
                  setHasHeader(v);
                  apply(all, v);
                }}
              />
            </View>
          </Card>

          <View style={{ gap: 8 }}>
            <Text variant="overline" color="textFaint">
              Import into
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {activeAccounts.map((a) => (
                <Chip key={a.id} label={a.name} color={a.color} selected={accountId === a.id} onPress={() => setAccountId(a.id)} />
              ))}
            </ScrollView>
          </View>

          {colPicker('date', 'Date column')}
          {colPicker('description', 'Description column')}
          <Segmented<'one' | 'two'>
            value={split ? 'two' : 'one'}
            onChange={(v) => setMapping(v === 'one' ? { ...mapping, amount: Math.max(0, mapping.debit), debit: -1, credit: -1 } : { ...mapping, amount: -1, debit: Math.max(0, colCount - 2), credit: Math.max(0, colCount - 1) })}
            options={[
              { value: 'one', label: 'One amount column' },
              { value: 'two', label: 'Debit / Credit' },
            ]}
          />
          {split ? (
            <>
              {colPicker('debit', 'Debit (money out)')}
              {colPicker('credit', 'Credit (money in)')}
            </>
          ) : (
            colPicker('amount', 'Amount column')
          )}

          <View style={{ gap: 8 }}>
            <Text variant="overline" color="textFaint">
              Date format
            </Text>
            <Segmented<DateFormat>
              value={mapping.format}
              onChange={(f) => setMapping({ ...mapping, format: f })}
              options={[
                { value: 'DMY', label: 'DD/MM/YYYY' },
                { value: 'MDY', label: 'MM/DD/YYYY' },
                { value: 'YMD', label: 'YYYY-MM-DD' },
              ]}
            />
          </View>

          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">Flip signs</Text>
              <Text variant="caption" color="textDim">
                Turn on for credit-card statements where purchases are positive.
              </Text>
            </View>
            <Toggle label="Flip signs" value={mapping.invert} onChange={(v) => setMapping({ ...mapping, invert: v })} />
          </Card>

          <View style={{ gap: 10 }}>
            <Text variant="h2">Preview</Text>
            {plan && plan.items.length > 0 ? (
              <Card pad={false} style={{ overflow: 'hidden' }}>
                {plan.items.slice(0, 5).map((t, i) => {
                  const cat = categories.find((c) => c.id === t.categoryId);
                  return (
                    <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderTopWidth: i ? 0.5 : 0, borderTopColor: colors.border }}>
                      <CategoryBadge icon={cat?.icon ?? '❓'} color={cat?.color ?? colors.textFaint} size={36} />
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyStrong" numberOfLines={1}>
                          {t.note || cat?.name}
                        </Text>
                        <Text variant="caption" color="textDim">
                          {t.date} · {cat?.name}
                        </Text>
                      </View>
                      <Money minor={t.kind === 'expense' ? -t.amount : t.amount} sign color={t.kind === 'income' ? colors.income : colors.text} />
                    </View>
                  );
                })}
              </Card>
            ) : (
              <Card>
                <Text variant="body" color="textDim" style={{ textAlign: 'center' }}>
                  {plan && plan.duplicates > 0 ? 'Everything in this file is already imported.' : 'No readable rows with this mapping. Try other columns or a different date format.'}
                </Text>
              </Card>
            )}
            {plan && (
              <Text variant="caption" color="textDim" style={{ textAlign: 'center' }}>
                {plan.items.length} to import · {plan.duplicates} already imported · {plan.invalid} skipped
              </Text>
            )}
          </View>

          <Button title={plan && plan.items.length ? `Import ${plan.items.length} transactions` : 'Import'} icon="download" onPress={doImport} loading={busy} disabled={!plan || plan.items.length === 0} />
          <Button title="Choose a different file" variant="ghost" onPress={pick} />
          <View style={{ height: space.lg }} />
        </>
      )}
    </Screen>
  );
}
