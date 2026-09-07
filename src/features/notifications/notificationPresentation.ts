import { AlertTriangle, Info, ShieldAlert, type LucideIcon } from 'lucide-react';
import type { NotificationSeverity } from '@/types';

export interface SeverityPresentation {
  label: string;
  icon: LucideIcon;
  /** Badge/pill classes. */
  badgeClass: string;
  /** Left accent bar / icon colour. */
  accentClass: string;
  iconClass: string;
}

/**
 * Severity presentation. Critical is unmistakable (solid destructive
 * treatment, shield icon) but static — no flashing or pulsing animation,
 * per the Block D brief.
 */
export const SEVERITY_PRESENTATION: Record<NotificationSeverity, SeverityPresentation> = {
  critical: {
    label: 'Critical',
    icon: ShieldAlert,
    badgeClass: 'border-destructive/30 bg-destructive/15 text-destructive',
    accentClass: 'bg-destructive',
    iconClass: 'text-destructive',
  },
  warning: {
    label: 'Needs attention',
    icon: AlertTriangle,
    badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
    accentClass: 'bg-amber-500',
    iconClass: 'text-amber-600 dark:text-amber-400',
  },
  info: {
    label: 'For information',
    icon: Info,
    badgeClass: 'border-border bg-muted text-muted-foreground',
    accentClass: 'bg-muted-foreground/40',
    iconClass: 'text-muted-foreground',
  },
};

export function severityRank(severity: NotificationSeverity): number {
  return severity === 'critical' ? 0 : severity === 'warning' ? 1 : 2;
}
