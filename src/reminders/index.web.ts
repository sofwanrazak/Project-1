import type { ReminderRoute } from '../lib/reminderPlan.ts';
import type { RecurringBill } from '../lib/recurring.ts';
import type { Settings } from '../lib/types.ts';

// Browsers cannot schedule local notifications while closed, so reminders are a mobile-only feature.
export const remindersSupported = false;
export async function hasReminderPermission(): Promise<boolean> {
  return false;
}
export async function requestReminderPermission(): Promise<boolean> {
  return false;
}
export async function syncReminders(_a: { settings: Settings; loggedToday: boolean; bills: RecurringBill[]; today: string }): Promise<void> {}
export function onReminderTap(_handler: (route: ReminderRoute) => void): () => void {
  return () => {};
}
