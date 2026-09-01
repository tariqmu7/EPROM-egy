import type { Notification } from '../../types';
import { collection, doc, compatDb as db } from '../firestore-compat';
import type { WriteHost } from './host';

// NOTIFICATIONS — the write half. `getNotifications` (which also synthesizes
// the dynamic admin/manager rows) stays a reader on DataService.

export async function markNotificationAsRead(host: WriteHost, notificationId: string): Promise<void> {
  const notification = host.notifications.find(n => n.id === notificationId);
  if (notification) {
    await host.update('notifications', { ...notification, isRead: true });
  }
}

export async function markAllNotificationsAsRead(host: WriteHost, userId: string): Promise<void> {
  const unread = host.notifications.filter(n => n.userId === userId && !n.isRead);
  for (const n of unread) {
    await host.update('notifications', { ...n, isRead: true });
  }
}

// A5.4: Retried up to 3× with exponential backoff so transient Firestore
// hiccups don't silently drop notification writes.
export async function addNotification(
  host: WriteHost,
  notification: Omit<Notification, 'id' | 'createdAt' | 'isRead'>,
): Promise<void> {
  const id = doc(collection(db, 'notifications')).id;
  // Attribution is mandatory on a client write (hole H7): the API refuses a
  // notification that does not name its sender, so nothing sent from a browser
  // can impersonate the system. Only the nightly sweep writes unattributed.
  const { actorId } = host.currentActor();
  const newNotification: Notification = {
    ...notification,
    // Falls back to the raw auth uid — the API accepts either id shape — so a
    // notification written before the user roster has loaded still attributes.
    createdBy: notification.createdBy ?? actorId ?? host.authUid(),
    id,
    createdAt: new Date().toISOString(),
    isRead: false
  };
  await host.withRetry(() => host.persist('notifications', newNotification));
}
