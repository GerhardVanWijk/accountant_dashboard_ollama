import type { SupabaseClient } from '@supabase/supabase-js';
import type { Notification, NotificationEvaluationResult } from '@/types';
import type { INotificationRepository } from './INotificationRepository';

interface FeedRow {
  id: string;
  company_id: string;
  dedupe_key: string;
  category: string;
  severity: string;
  source_module: string;
  title: string;
  body: string | null;
  action_url: string | null;
  source_record_type: string | null;
  source_record_id: string | null;
  status: string;
  event_seq: number;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  metadata: Record<string, unknown> | null;
  is_unread: boolean;
}

function rowToNotification(row: FeedRow): Notification {
  return {
    id: row.id,
    companyId: row.company_id,
    dedupeKey: row.dedupe_key,
    category: row.category as Notification['category'],
    severity: row.severity as Notification['severity'],
    sourceModule: row.source_module,
    title: row.title,
    body: row.body ?? undefined,
    actionUrl: row.action_url ?? undefined,
    sourceRecordType: row.source_record_type ?? undefined,
    sourceRecordId: row.source_record_id ?? undefined,
    status: row.status as Notification['status'],
    eventSeq: row.event_seq,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    resolvedAt: row.resolved_at ?? undefined,
    metadata: row.metadata ?? {},
    isUnread: row.is_unread,
  };
}

/** Supabase-backed INotificationRepository (migration 0073). All access goes
 * through SECURITY DEFINER RPCs — the `notifications` table has no client
 * write policy and a read policy that already enforces company + role +
 * permission + entitlement targeting. */
export class SupabaseNotificationRepository implements INotificationRepository {
  constructor(private readonly client: SupabaseClient) {}

  async evaluate(): Promise<NotificationEvaluationResult> {
    const { data, error } = await this.client.rpc('evaluate_company_notifications');
    if (error) throw new Error(`SupabaseNotificationRepository.evaluate: ${error.message}`);
    return (data as NotificationEvaluationResult) ?? { company: null, opened: 0, resolved: 0, active: 0 };
  }

  async getFeed(options?: { includeResolved?: boolean; limit?: number }): Promise<Notification[]> {
    const { data, error } = await this.client.rpc('notification_feed', {
      p_include_resolved: options?.includeResolved ?? false,
      p_limit: options?.limit ?? 100,
    });
    if (error) throw new Error(`SupabaseNotificationRepository.getFeed: ${error.message}`);
    return (data as FeedRow[]).map(rowToNotification);
  }

  async getUnreadCount(): Promise<number> {
    const { data, error } = await this.client.rpc('notification_unread_count');
    if (error) throw new Error(`SupabaseNotificationRepository.getUnreadCount: ${error.message}`);
    return Number(data ?? 0);
  }

  async markRead(id: string): Promise<void> {
    const { error } = await this.client.rpc('mark_notification_read', { p_id: id });
    if (error) throw new Error(`SupabaseNotificationRepository.markRead: ${error.message}`);
  }

  async markAllRead(): Promise<number> {
    const { data, error } = await this.client.rpc('mark_all_notifications_read');
    if (error) throw new Error(`SupabaseNotificationRepository.markAllRead: ${error.message}`);
    return Number(data ?? 0);
  }

  async getMutedCategories(): Promise<string[]> {
    const { data, error } = await this.client
      .from('notification_mutes')
      .select('category');
    if (error) throw new Error(`SupabaseNotificationRepository.getMutedCategories: ${error.message}`);
    return (data as { category: string }[]).map((r) => r.category);
  }

  async setCategoryMuted(category: string, muted: boolean): Promise<void> {
    const { error } = await this.client.rpc('set_notification_category_muted', {
      p_category: category,
      p_muted: muted,
    });
    if (error) throw new Error(`SupabaseNotificationRepository.setCategoryMuted: ${error.message}`);
  }
}
