import { useCallback, useEffect, useRef, useState } from 'react';
import type { Notification } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { notificationService } from '../services';

export interface UseNotificationsOptions {
  /** Ask the condition engine to re-evaluate on mount (throttled in the service). */
  evaluate?: boolean;
  includeResolved?: boolean;
  limit?: number;
}

export interface UseNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

/**
 * Loads the current user's notification feed + unread count. Used by both
 * the navbar bell and the full Notifications page. The engine evaluation
 * is throttled to once per 5 minutes per browser, so mounting this in two
 * places at once costs at most one extra `notification_feed` read.
 */
export function useNotifications(options: UseNotificationsOptions = {}): UseNotificationsResult {
  const { evaluate = false, includeResolved = false, limit } = options;
  const authed = useAuthStore((s) => s.status === 'authenticated');
  const companyId = useAuthStore((s) => s.profile?.companyId);
  const suspended = useAuthStore((s) => s.workspaceSuspended);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const request = useRef(0);

  const load = useCallback(async () => {
    if (!authed || !companyId || suspended) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }
    const id = ++request.current;
    setLoading(true);
    setError(null);
    try {
      if (evaluate) {
        await notificationService.evaluateIfDue().catch(() => undefined);
      }
      const [feed, count] = await Promise.all([
        notificationService.getFeed({ includeResolved, limit }),
        notificationService.getUnreadCount(),
      ]);
      if (id !== request.current) return;
      setNotifications(feed);
      setUnreadCount(count);
    } catch (err) {
      if (id !== request.current) return;
      setError(err instanceof Error ? err : new Error('Failed to load notifications'));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [authed, companyId, suspended, evaluate, includeResolved, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = useCallback(
    async (notificationId: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, isUnread: false } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        await notificationService.markRead(notificationId);
      } finally {
        await load();
      }
    },
    [load],
  );

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isUnread: false })));
    setUnreadCount(0);
    try {
      await notificationService.markAllRead();
    } finally {
      await load();
    }
  }, [load]);

  return { notifications, unreadCount, loading, error, refetch: load, markRead, markAllRead };
}
