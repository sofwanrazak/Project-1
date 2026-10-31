import { addDays, daysBetween, fromDateStr } from './dates.ts';
import type { RecurringBill } from './recurring.ts';

export type ReminderRoute = '/add' | '/recap' | '/';

export interface PlannedReminder {
  id: string;
  kind: 'daily' | 'bill' | 'weekly';
  /** Epoch ms for one-off reminders. */
  at?: number;
  /** Repeating weekly slot; weekday 1 = Sunday (the notification API's convention). */
  weekly?: { weekday: number; hour: number; minute: number };
  title: string;
  body: string;
  route: ReminderRoute;
}

const DAILY_COPY = [
  ['Got a minute?', 'Log today’s spending to keep your streak alive.'],
  ['Quick tally', 'Anything to log from today? It takes five seconds.'],
  ['Before you wind down', 'Add today’s spends so tomorrow’s number is right.'],
  ['Nothing to log?', 'Tap to mark today as a no-spend day.'],
  ['Evening check-in', 'Two taps keep your tally going.'],
] as const;

export function parseTime(hhmm: string): { hour: number; minute: number } {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  const hour = m ? Math.min(23, Number(m[1])) : 21;
  const minute = m ? Math.min(59, Number(m[2])) : 0;
  return { hour, minute };
}

const at = (date: string, hour: number, minute: number) => {
  const d = fromDateStr(date);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
};

/**
 * What should be scheduled right now. Local notifications cannot check state when they fire, so the daily
 * nudge is planned one day at a time for the next week and re-planned whenever the app opens or you log:
 * logging today removes tonight's reminder. Text never contains amounts (it shows on the lock screen).
 */
export function planReminders(a: {
  now: number;
  today: string;
  remindDaily: boolean;
  remindTime: string;
  remindWeekly: boolean;
  remindBills: boolean;
  loggedToday: boolean;
  bills: RecurringBill[];
}): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  const { hour, minute } = parseTime(a.remindTime);

  if (a.remindDaily) {
    for (let i = 0; i < 7; i++) {
      const date = addDays(a.today, i);
      const when = at(date, hour, minute);
      if (when <= a.now + 60_000) continue;
      if (i === 0 && a.loggedToday) continue;
      const [title, body] = DAILY_COPY[(daysBetween('2026-01-01', date) % DAILY_COPY.length + DAILY_COPY.length) % DAILY_COPY.length];
      out.push({ id: `daily-${date}`, kind: 'daily', at: when, title, body, route: '/add' });
    }
  }

  if (a.remindWeekly) {
    out.push({ id: 'weekly-recap', kind: 'weekly', weekly: { weekday: 1, hour: 19, minute: 0 }, title: 'Your week is ready', body: 'See how your spending went and what changed.', route: '/recap' });
  }

  if (a.remindBills) {
    for (const b of a.bills) {
      const due = b.nextDate;
      if (daysBetween(a.today, due) < 0 || daysBetween(a.today, due) > 14) continue;
      const eve = addDays(due, -1);
      // Day before at 9am; if that moment has passed, the morning of the due date.
      const day = at(eve, 9, 0) > a.now ? eve : due;
      const when = at(day, 9, 0);
      if (when <= a.now) continue;
      out.push({ id: `bill-${b.key}-${due}`, kind: 'bill', at: when, title: 'A bill is coming up', body: `${b.name} is due ${day === due ? 'today' : 'tomorrow'}.`, route: '/' });
    }
  }
  return out;
}
