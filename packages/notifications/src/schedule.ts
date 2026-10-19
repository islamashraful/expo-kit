import { reportError } from '@expo-kit/core';
import * as Notifications from 'expo-notifications';

export type ScheduleNotificationInput = {
  /** Your own id, e.g. an item ID, so you can cancel it by that id later. Default: a new random id. */
  id?: string;
  title: string;
  body?: string;
  /** Extra data you get back in `useNotificationTap`, e.g. `{ itemId: '42' }`. */
  data?: Record<string, unknown>;
  /** When to show it. */
  at: Date;
  sound?: boolean;
};

/**
 * Schedules a local notification. Returns its id (keep it to cancel later),
 * or `null` if it couldn't be scheduled (the error goes to `reportError`).
 */
export async function scheduleNotification({
  id,
  title,
  body,
  data,
  at,
  sound = true,
}: ScheduleNotificationInput): Promise<string | null> {
  try {
    return await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: { title, body, data, sound },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
  } catch (error) {
    reportError(error, { fn: 'scheduleNotification', id, title });
    return null;
  }
}

/** Cancels scheduled notifications by id. Ids that no longer exist are ignored. */
export async function cancelNotifications(ids: string[]) {
  await Promise.all(
    ids.map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch((error) =>
        reportError(error, { fn: 'cancelNotifications', id }),
      ),
    ),
  );
}
