import type { Notification, NotificationEvaluationResult, NotificationSeverity } from '@/types';
import type { INotificationRepository } from '../repositories/INotificationRepository';

const SEVERITY_RANK: Record<NotificationSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** Client-side throttle for the condition engine — one evaluation per
 * company per this window, tracked in localStorage. Keeps a busy user
 * clicking around from re-running the checks on every mount. */
export const EVALUATE_THROTTLE_MS = 5 * 60 * 1000;

const THROTTLE_KEY = 'vertex.notifications.lastEval';

function canEvaluate(now: number, store: Pick<Storage, 'getItem' | 'setItem'> | undefined): boolean {
  if (!store) return true;
  try {
    const last = Number(store.getItem(THROTTLE_KEY) ?? 0);
    return !Number.isFinite(last) || now - last >= EVALUATE_THROTTLE_MS;
  } catch {
    return true;
  }
}

function markEvaluated(now: number, store: Pick<Storage, 'getItem' | 'setItem'> | undefined): void {
  if (!store) return;
  try {
    store.setItem(THROTTLE_KEY, String(now));
  } catch {
    /* private mode / storage disabled — evaluation just isn't throttled */
  }
}

/**
 * Notification subsystem service (migration 0073). The database engine
 * (`evaluate_company_notifications`) is authoritative for what is and
 * isn't a notification-worthy condition; this service only orchestrates
 * when to ask it to re-evaluate and shapes the feed for the UI.
 */
export class NotificationService {
  constructor(
    private readonly repository: INotificationRepository,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined =
      typeof localStorage !== 'undefined' ? localStorage : undefined,
  ) {}

  /** Re-run the condition engine unless it ran within the throttle window. */
  async evaluateIfDue(force = false): Promise<NotificationEvaluationResult | null> {
    const now = Date.now();
    if (!force && !canEvaluate(now, this.storage)) return null;
    const result = await this.repository.evaluate();
    markEvaluated(now, this.storage);
    return result;
  }

  async getFeed(options?: { includeResolved?: boolean; limit?: number }): Promise<Notification[]> {
    const feed = await this.repository.getFeed(options);
    return [...feed].sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1) ||
        b.lastSeenAt.localeCompare(a.lastSeenAt),
    );
  }

  getUnreadCount(): Promise<number> {
    return this.repository.getUnreadCount();
  }

  markRead(id: string): Promise<void> {
    return this.repository.markRead(id);
  }

  markAllRead(): Promise<number> {
    return this.repository.markAllRead();
  }

  getMutedCategories(): Promise<string[]> {
    return this.repository.getMutedCategories();
  }

  setCategoryMuted(category: string, muted: boolean): Promise<void> {
    return this.repository.setCategoryMuted(category, muted);
  }
}
