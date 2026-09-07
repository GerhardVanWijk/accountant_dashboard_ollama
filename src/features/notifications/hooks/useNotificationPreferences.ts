import { useCallback, useEffect, useState } from 'react';
import type { NotificationCategory } from '@/types';
import { MUTEABLE_NOTIFICATION_CATEGORIES } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { notificationService } from '../services';

export interface UseNotificationPreferencesResult {
  /** The categories the current user may choose to mute. */
  muteable: readonly NotificationCategory[];
  mutedCategories: Set<NotificationCategory>;
  loading: boolean;
  error: Error | null;
  setMuted: (category: NotificationCategory, muted: boolean) => Promise<void>;
}

/**
 * Per-user notification category preferences. Only non-critical categories
 * can be muted (the DB `set_notification_category_muted` RPC rejects the
 * rest), and a `critical`-severity item is still shown even in a muted
 * category — so muting reduces noise without hiding anything urgent.
 */
export function useNotificationPreferences(): UseNotificationPreferencesResult {
  const authed = useAuthStore((s) => s.status === 'authenticated');
  const [mutedCategories, setMutedCategories] = useState<Set<NotificationCategory>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!authed) {
      setMutedCategories(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const categories = await notificationService.getMutedCategories();
      setMutedCategories(new Set(categories as NotificationCategory[]));
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load notification preferences'));
    } finally {
      setLoading(false);
    }
  }, [authed]);

  useEffect(() => {
    void load();
  }, [load]);

  const setMuted = useCallback(
    async (category: NotificationCategory, muted: boolean) => {
      setMutedCategories((prev) => {
        const next = new Set(prev);
        if (muted) next.add(category);
        else next.delete(category);
        return next;
      });
      try {
        await notificationService.setCategoryMuted(category, muted);
      } catch (err) {
        await load(); // revert optimistic change from source of truth
        throw err;
      }
    },
    [load],
  );

  return { muteable: MUTEABLE_NOTIFICATION_CATEGORIES, mutedCategories, loading, error, setMuted };
}
