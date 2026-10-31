import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { todayStr } from '../lib/dates.ts';

/** Today's date, refreshed when the app returns to the foreground and every minute (midnight rollover). */
export function useToday() {
  const [today, setToday] = useState(todayStr);
  useEffect(() => {
    const refresh = () => setToday(todayStr());
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    const timer = setInterval(refresh, 60_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, []);
  return today;
}
