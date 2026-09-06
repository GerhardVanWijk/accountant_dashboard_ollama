import { Link } from 'react-router-dom';
import { LockIcon, SparklesIcon } from 'lucide-react';

import { Button } from '@/components/ui/shadcn/button';
import { ENTITLEMENT_LABELS, lowestPlanFor, type EntitlementKey } from '../entitlements';

/**
 * Shown in place of a page whose module the company's plan does not
 * include (route-level or direct-URL entry). Same visual language as
 * `AccessDenied`, but the CTA goes to the upgrade page — never a broken
 * accounting route.
 */
export function UpgradeRequired({ feature }: { feature: EntitlementKey }) {
  const label = ENTITLEMENT_LABELS[feature] ?? 'this module';
  const plan = lowestPlanFor(feature);

  return (
    <div role="alert" className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-brand/10 text-brand">
        <LockIcon className="size-6" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-lg font-semibold text-foreground">{label} isn&apos;t part of your plan</h1>
        <p className="max-w-sm text-sm text-muted-foreground text-pretty">
          {plan
            ? <>Upgrade to <span className="font-medium text-foreground">{plan.name}</span> or higher to use {label.toLowerCase()}. Your existing data stays exactly where it is.</>
            : <>This is an optional add-on. Contact us to enable {label.toLowerCase()} for your workspace.</>}
        </p>
      </div>
      <div className="mt-1 flex gap-2">
        <Button size="sm" render={<Link to="/settings/subscription" />}>
          <SparklesIcon data-icon="inline-start" />
          View plans
        </Button>
        <Button variant="outline" size="sm" render={<Link to="/" />}>
          Back to dashboard
        </Button>
      </div>
    </div>
  );
}
