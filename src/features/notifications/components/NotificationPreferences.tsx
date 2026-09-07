import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { NOTIFICATION_CATEGORY_LABELS } from '@/types';
import { SectionCard } from '@/components/app/page-header';
import { Checkbox } from '@/components/ui/shadcn/checkbox';
import { useNotificationPreferences } from '../hooks/useNotificationPreferences';

const CATEGORY_HINT: Partial<Record<string, string>> = {
  document_expiry: 'Company documents nearing or past their expiry date.',
  receivable_overdue: 'A material amount of receivables more than 60 days overdue.',
  inventory_integrity: 'Negative stock balances and products at or below reorder level.',
  budget_variance: 'Budgeted accounts running materially off budget this month.',
};

/**
 * Per-user notification preferences (Settings → Notifications). Only
 * non-critical categories can be silenced; security, subscription,
 * reconciliation and tax-deadline notifications stay on for everyone, and
 * a critical-severity item is always shown even inside a muted category.
 * There is no email or SMS toggle here because Vertex has no email/SMS
 * delivery channel — showing switches that do nothing would be misleading.
 */
export function NotificationPreferences() {
  const { muteable, mutedCategories, loading, error, setMuted } = useNotificationPreferences();

  return (
    <SectionCard
      title="Notifications"
      description="Choose which non-urgent notification categories appear in your bell and on the Notifications page."
    >
      {loading ? (
        <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading preferences…
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error.message}
            </p>
          )}
          <ul className="flex flex-col divide-y divide-border">
            {muteable.map((category) => {
              const enabled = !mutedCategories.has(category);
              return (
                <li key={category} className="flex items-start justify-between gap-4 py-3 first:pt-0">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">
                      {NOTIFICATION_CATEGORY_LABELS[category]}
                    </span>
                    {CATEGORY_HINT[category] && (
                      <span className="text-xs leading-relaxed text-muted-foreground">{CATEGORY_HINT[category]}</span>
                    )}
                  </div>
                  <label className="group/field flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={enabled}
                      onCheckedChange={(checked) => void setMuted(category, !checked)}
                      aria-label={`Show ${NOTIFICATION_CATEGORY_LABELS[category]} notifications`}
                    />
                    {enabled ? 'On' : 'Muted'}
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            Security, subscription &amp; workspace, bank reconciliation, and tax-deadline notifications can&apos;t be
            muted. Anything marked <span className="font-medium text-foreground">critical</span> always appears, even in a
            muted category. See the full list on the{' '}
            <Link to="/notifications" className="text-primary hover:underline">
              Notifications page
            </Link>
            .
          </p>
        </div>
      )}
    </SectionCard>
  );
}
