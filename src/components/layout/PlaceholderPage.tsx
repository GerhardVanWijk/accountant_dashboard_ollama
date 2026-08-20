import { EmptyState } from '@/components/feedback/EmptyState';

export interface PlaceholderPageProps {
  title: string;
  description?: string;
}

/**
 * Minimal route-proving page used by every stub page under
 * src/features/*\/pages/ for Phase 0. Feature bees replace the body
 * with real list/detail/create UI; the route and title stay stable.
 */
export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col gap-lg">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
        {description && <p className="mt-xs text-sm text-text-secondary">{description}</p>}
      </div>
      <EmptyState
        title="Module under construction"
        message="This page is a Phase 0 routing placeholder. Feature UI ships in a later phase."
      />
    </div>
  );
}
