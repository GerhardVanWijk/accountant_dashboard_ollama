import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getArticle } from '../content';

export interface HelpLinkProps {
  /** A help article id (see src/features/help/content/articles.ts). */
  article: string;
  /** Override the visible label. Defaults to "Help". */
  label?: string;
  className?: string;
}

/**
 * A compact, unobtrusive contextual help link for embedding in a workflow
 * header — Bank reconciliation, Journal entries, Inventory adjustments,
 * VAT, Forecasting, Users & roles, Documents, Notifications. Deep-links to
 * the relevant Help Centre article. Renders nothing if the id is unknown,
 * so a typo can never ship a dead link.
 */
export function HelpLink({ article, label = 'Help', className }: HelpLinkProps) {
  if (!getArticle(article)) return null;
  // A plain anchor (not react-router <Link>) so the component is safe to
  // drop into any page header without needing a Router in context — help
  // is a leaf destination and a normal navigation to it is fine.
  return (
    <a
      href={`/help/${article}`}
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground',
        className,
      )}
    >
      <HelpCircle className="size-3.5" aria-hidden="true" />
      {label}
    </a>
  );
}
