import { router } from 'expo-router';

import { BillsView } from '../components/bills';
import { Header, IconButton, Screen } from '../components/ui';

/** Standalone entry for bills, reached from Home's "Coming up" card. */
export default function BillsScreen() {
  return (
    <Screen header={<Header title="Bills" left={<IconButton icon="left" label="Back" onPress={() => router.back()} />} right={<IconButton icon="plus" label="Add a bill" onPress={() => router.push('/bill-edit')} />} />}>
      <BillsView />
    </Screen>
  );
}
