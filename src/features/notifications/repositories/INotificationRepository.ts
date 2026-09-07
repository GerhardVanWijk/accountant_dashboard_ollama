import type { Notification, NotificationEvaluationResult } from '@/types';

export interface INotificationRepository {
  /**
   * Run the deterministic condition engine for the caller's company
   * (`evaluate_company_notifications`). Opens new conditions, keeps
   * existing ones, auto-resolves cleared ones. Cheap — a handful of
   * aggregate queries — but still throttled by the service.
   */
  evaluate(): Promise<NotificationEvaluationResult>;

  /** The visible, targeting-filtered, mute-filtered feed for the current user. */
  getFeed(options?: { includeResolved?: boolean; limit?: number }): Promise<Notification[]>;

  /** Attention-worthy unread count for the navbar badge. */
  getUnreadCount(): Promise<number>;

  markRead(id: string): Promise<void>;
  markAllRead(): Promise<number>;

  /** Muted categories for the current user. */
  getMutedCategories(): Promise<string[]>;
  setCategoryMuted(category: string, muted: boolean): Promise<void>;
}
