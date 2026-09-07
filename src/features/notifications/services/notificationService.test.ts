import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Notification } from '@/types';
import type { INotificationRepository } from '../repositories/INotificationRepository';
import { NotificationService, EVALUATE_THROTTLE_MS } from './notificationService';

function makeNotification(over: Partial<Notification>): Notification {
  return {
    id: 'n', companyId: 'c', dedupeKey: 'k', category: 'security', severity: 'info',
    sourceModule: 'admin', title: 't', status: 'open', eventSeq: 1,
    firstSeenAt: '2026-09-01T00:00:00Z', lastSeenAt: '2026-09-01T00:00:00Z',
    metadata: {}, isUnread: true, ...over,
  };
}

function makeRepo(): INotificationRepository {
  return {
    evaluate: vi.fn().mockResolvedValue({ company: 'c', opened: 1, resolved: 0, active: 1 }),
    getFeed: vi.fn().mockResolvedValue([]),
    getUnreadCount: vi.fn().mockResolvedValue(0),
    markRead: vi.fn().mockResolvedValue(undefined),
    markAllRead: vi.fn().mockResolvedValue(0),
    getMutedCategories: vi.fn().mockResolvedValue([]),
    setCategoryMuted: vi.fn().mockResolvedValue(undefined),
  };
}

function makeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe('NotificationService', () => {
  beforeEach(() => vi.restoreAllMocks());

  describe('evaluateIfDue — throttling', () => {
    it('evaluates when nothing has run yet', async () => {
      const repo = makeRepo();
      const svc = new NotificationService(repo, makeStorage());
      const result = await svc.evaluateIfDue();
      expect(repo.evaluate).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ company: 'c', opened: 1, resolved: 0, active: 1 });
    });

    it('does NOT re-evaluate inside the throttle window', async () => {
      const repo = makeRepo();
      const storage = makeStorage({ 'vertex.notifications.lastEval': String(Date.now()) });
      const svc = new NotificationService(repo, storage);
      const result = await svc.evaluateIfDue();
      expect(repo.evaluate).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('re-evaluates once the throttle window has passed', async () => {
      const repo = makeRepo();
      const stale = String(Date.now() - EVALUATE_THROTTLE_MS - 1000);
      const svc = new NotificationService(repo, makeStorage({ 'vertex.notifications.lastEval': stale }));
      await svc.evaluateIfDue();
      expect(repo.evaluate).toHaveBeenCalledTimes(1);
    });

    it('force bypasses the throttle', async () => {
      const repo = makeRepo();
      const svc = new NotificationService(repo, makeStorage({ 'vertex.notifications.lastEval': String(Date.now()) }));
      await svc.evaluateIfDue(true);
      expect(repo.evaluate).toHaveBeenCalledTimes(1);
    });

    it('still works when storage throws (private mode) — throttle just disables', async () => {
      const repo = makeRepo();
      const throwingStorage = {
        getItem: () => {
          throw new Error('storage disabled');
        },
        setItem: () => {
          throw new Error('storage disabled');
        },
      };
      const svc = new NotificationService(repo, throwingStorage);
      await svc.evaluateIfDue();
      await svc.evaluateIfDue();
      expect(repo.evaluate).toHaveBeenCalledTimes(2);
    });
  });

  describe('getFeed — ordering', () => {
    it('orders critical → warning → info, open before resolved, newest first', async () => {
      const repo = makeRepo();
      (repo.getFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeNotification({ id: 'info', severity: 'info', lastSeenAt: '2026-09-05T00:00:00Z' }),
        makeNotification({ id: 'crit-resolved', severity: 'critical', status: 'resolved', lastSeenAt: '2026-09-09T00:00:00Z' }),
        makeNotification({ id: 'crit-open-old', severity: 'critical', lastSeenAt: '2026-09-02T00:00:00Z' }),
        makeNotification({ id: 'crit-open-new', severity: 'critical', lastSeenAt: '2026-09-08T00:00:00Z' }),
        makeNotification({ id: 'warn', severity: 'warning', lastSeenAt: '2026-09-07T00:00:00Z' }),
      ]);
      const svc = new NotificationService(repo, makeStorage());
      const feed = await svc.getFeed();
      expect(feed.map((n) => n.id)).toEqual(['crit-open-new', 'crit-open-old', 'crit-resolved', 'warn', 'info']);
    });
  });

  describe('pass-throughs', () => {
    it('delegates mute/unmute to the repository', async () => {
      const repo = makeRepo();
      const svc = new NotificationService(repo, makeStorage());
      await svc.setCategoryMuted('inventory_integrity', true);
      expect(repo.setCategoryMuted).toHaveBeenCalledWith('inventory_integrity', true);
    });

    it('delegates mark-all-read', async () => {
      const repo = makeRepo();
      const svc = new NotificationService(repo, makeStorage());
      await svc.markAllRead();
      expect(repo.markAllRead).toHaveBeenCalled();
    });
  });
});
