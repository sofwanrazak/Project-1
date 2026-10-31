import { Platform } from 'react-native';

import { planReminders, type ReminderBill, type ReminderRoute } from '../lib/reminderPlan.ts';
import type { Settings } from '../lib/types.ts';

type Notifications = typeof import('expo-notifications');

const CHANNEL = 'reminders';
const ROUTES: readonly string[] = ['/add', '/recap', '/', '/bills'];

let loaded: Notifications | null | undefined;
let configured = false;

/**
 * The native module is loaded on first use, not at app start. If it is missing or fails to initialise,
 * reminders quietly become unavailable instead of taking the whole app down at launch.
 */
async function load(): Promise<Notifications | null> {
  if (loaded !== undefined) return loaded;
  try {
    loaded = await import('expo-notifications');
  } catch {
    loaded = null;
  }
  return loaded;
}

async function configure(N: Notifications) {
  if (configured) return;
  configured = true;
  N.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync(CHANNEL, { name: 'Reminders', importance: N.AndroidImportance.DEFAULT });
  }
}

export const remindersSupported = true;

export async function hasReminderPermission(): Promise<boolean> {
  const N = await load();
  return N ? (await N.getPermissionsAsync()).granted : false;
}

/** Asks only when it makes sense to: returns true if reminders can be delivered. */
export async function requestReminderPermission(): Promise<boolean> {
  const N = await load();
  if (!N) return false;
  try {
    await configure(N);
    const current = await N.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await N.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function syncReminders(a: { settings: Settings; loggedToday: boolean; bills: ReminderBill[]; today: string }): Promise<void> {
  const { settings } = a;
  const wants = settings.remindDaily || settings.remindWeekly || settings.remindBills;
  const N = await load();
  if (!N) return;
  await configure(N);
  await N.cancelAllScheduledNotificationsAsync();
  if (!wants || !(await N.getPermissionsAsync()).granted) return;

  const plan = planReminders({ now: Date.now(), today: a.today, remindDaily: settings.remindDaily, remindTime: settings.remindTime, remindWeekly: settings.remindWeekly, remindBills: settings.remindBills, loggedToday: a.loggedToday, bills: a.bills });
  for (const r of plan) {
    await N.scheduleNotificationAsync({
      identifier: r.id,
      content: { title: r.title, body: r.body, data: { route: r.route } },
      trigger: r.weekly
        ? { type: N.SchedulableTriggerInputTypes.WEEKLY, weekday: r.weekly.weekday, hour: r.weekly.hour, minute: r.weekly.minute, channelId: CHANNEL }
        : { type: N.SchedulableTriggerInputTypes.DATE, date: r.at!, channelId: CHANNEL },
    });
  }
}

/** Opens the screen a reminder points at. Only our own routes are honoured. */
export function onReminderTap(handler: (route: ReminderRoute) => void): () => void {
  let cancelled = false;
  let remove: (() => void) | null = null;
  void load().then((N) => {
    if (!N || cancelled) return;
    const sub = N.addNotificationResponseReceivedListener((e) => {
      const route = (e.notification.request.content.data as { route?: unknown } | null)?.route;
      if (typeof route === 'string' && ROUTES.includes(route)) handler(route as ReminderRoute);
    });
    remove = () => sub.remove();
  });
  return () => {
    cancelled = true;
    remove?.();
  };
}
