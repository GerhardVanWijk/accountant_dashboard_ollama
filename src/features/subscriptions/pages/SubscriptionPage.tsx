import { CheckIcon, LockIcon } from 'lucide-react';

import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import { Seo } from '@/lib/seo/Seo';
import { formatLongDate } from '@/lib/app/format';
import { useLogSensitiveAccess } from '@/features/auth/hooks/useLogSensitiveAccess';
import {
  ENTITLEMENT_KEYS,
  ENTITLEMENT_LABELS,
  CORE_ENTITLEMENTS,
  PLAN_CATALOGUE,
  formatZarFromCents,
  lowestPlanFor,
  type EntitlementKey,
} from '../entitlements';
import { usePlanCode, useSubscription, useEntitlements } from '../hooks/useEntitlement';

const STATUS_TONE: Record<string, string> = {
  active: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  trialing: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  past_due: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  suspended: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  pending: 'border-border bg-muted text-muted-foreground',
  cancelled: 'border-destructive/30 bg-destructive/10 text-destructive',
  expired: 'border-destructive/30 bg-destructive/10 text-destructive',
};

const PROVIDER_LABEL: Record<string, string> = {
  manual: 'Managed manually by Vertex',
  paystack: 'Billed automatically via Paystack',
};

const NON_CORE_ORDER: EntitlementKey[] = [
  'sales', 'sales_receipts', 'purchasing', 'purchasing_payments', 'banking', 'vat',
  'income_tax', 'general_ledger', 'financial_statements', 'audit_trail',
  'advanced_tax', 'assets', 'assets_depreciation', 'inventory', 'compliance',
  'payroll', 'foreign_exchange',
];

/**
 * `/settings/subscription` — the company's Vertex plan, exactly what it
 * unlocks and what it doesn't, and the upgrade options. Read-only: there is
 * no checkout yet (Paystack — Block 5). Nothing is fabricated —
 * payment history, card details, next-debit dates and Paystack transactions
 * are NOT shown because no payment integration supplies them yet. An
 * unmanaged company shows the honest "not on a managed plan" state.
 */
export function SubscriptionPage() {
  useLogSensitiveAccess('Plan & billing');
  const subscription = useSubscription();
  const planCode = usePlanCode();
  const entitlements = useEntitlements();
  const resolvedPlan = planCode ? PLAN_CATALOGUE.find((p) => p.code === planCode) : undefined;

  const includedModules = ENTITLEMENT_KEYS.filter(
    (k) => !CORE_ENTITLEMENTS.includes(k) && entitlements.has(k),
  );
  const lockedModules = ENTITLEMENT_KEYS.filter(
    (k) => !CORE_ENTITLEMENTS.includes(k) && !entitlements.has(k),
  );

  const period =
    subscription?.currentPeriodStart && subscription?.currentPeriodEnd
      ? `${formatLongDate(subscription.currentPeriodStart)} – ${formatLongDate(subscription.currentPeriodEnd)}`
      : null;

  return (
    <div className="flex flex-col gap-6">
      <Seo noindex />
      <PageHeader
        title="Plan & billing"
        description="Your Vertex Accounting subscription and what it includes. Platform billing — separate from your company's accounting."
      />

      <SectionCard title="Current plan">
        {!subscription ? (
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-medium text-foreground">Not on a managed plan yet</p>
            <p className="text-muted-foreground text-pretty">
              Your workspace currently has access to every module. Online checkout is coming soon — until then, contact us
              to set up billing for your business.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-lg font-semibold text-foreground">{resolvedPlan?.name ?? 'Vertex plan'}</span>
                <span className="text-muted-foreground">
                  {resolvedPlan
                    ? `${formatZarFromCents(resolvedPlan.priceCents)} / month excl. VAT · ${resolvedPlan.includedUsers} user${resolvedPlan.includedUsers > 1 ? 's' : ''} included`
                    : 'Active subscription'}
                </span>
              </div>
              <Badge variant="outline" className={cn('capitalize', STATUS_TONE[subscription.status] ?? '')}>
                {subscription.status.replace('_', ' ')}
              </Badge>
            </div>
            <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              <Detail label="Billing interval" value="Monthly" />
              <Detail label="Management" value={PROVIDER_LABEL[subscription.provider ?? ''] ?? 'Managed by Vertex'} />
              {period && <Detail label="Current period" value={period} />}
              {subscription.status === 'past_due' && (
                <Detail label="Action needed" value="The last payment did not go through — contact Vertex to update billing." />
              )}
            </dl>
            <p className="text-xs text-muted-foreground">
              Payment history, card details and invoices aren&apos;t shown here yet — online payments aren&apos;t
              connected. For a billing query, contact Vertex support.
            </p>
          </div>
        )}
      </SectionCard>

      {subscription && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="In your plan" description="Modules this plan unlocks, on top of the always-included essentials.">
            {includedModules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No optional modules on this plan.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {NON_CORE_ORDER.filter((k) => includedModules.includes(k)).map((k) => (
                  <li key={k} className="flex items-start gap-2 text-foreground">
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                    {ENTITLEMENT_LABELS[k]}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Not in your plan" description="Available on a higher plan. Your data stays intact — a locked module is read-only, never deleted.">
            {lockedModules.length === 0 ? (
              <p className="text-sm text-muted-foreground">You have every module.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {NON_CORE_ORDER.filter((k) => lockedModules.includes(k)).map((k) => {
                  const plan = lowestPlanFor(k);
                  return (
                    <li key={k} className="flex items-start justify-between gap-2 text-muted-foreground">
                      <span className="flex items-start gap-2">
                        <LockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        {ENTITLEMENT_LABELS[k]}
                      </span>
                      {plan && <span className="shrink-0 text-xs">{plan.name}+</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </div>
      )}

      <SectionCard title="Compare plans" description="Downgrading never deletes your accounting data — a module you lose becomes read-only, with all history, journals and audit records intact.">
        <div className="grid gap-4 lg:grid-cols-3">
          {PLAN_CATALOGUE.map((plan) => (
            <div
              key={plan.code}
              className={cn(
                'flex flex-col gap-5 rounded-xl border p-5',
                plan.code === planCode ? 'border-brand/60 ring-1 ring-brand/30' : plan.popular ? 'border-brand/40 ring-1 ring-brand/20' : 'border-border',
              )}
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
                  {plan.code === planCode ? (
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand">Current</span>
                  ) : plan.popular ? (
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand">Popular</span>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground text-pretty">{plan.blurb}</p>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tracking-tight text-foreground">{formatZarFromCents(plan.priceCents)}</span>
                <span className="text-sm text-muted-foreground">/ month</span>
              </div>
              <ul className="flex flex-1 flex-col gap-2 text-sm">
                {NON_CORE_ORDER.filter((f) => plan.features.includes(f)).map((f) => (
                  <li key={f} className="flex items-start gap-2 text-muted-foreground">
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                    {ENTITLEMENT_LABELS[f]}
                  </li>
                ))}
              </ul>
              <Button variant="outline" disabled className="w-full">
                <LockIcon data-icon="inline-start" />
                {plan.code === planCode ? 'Current plan' : 'Checkout coming soon'}
              </Button>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Every plan also includes Dashboard, Customers, Suppliers, Users &amp; access and Settings. Payroll and the
          Foreign exchange toolkit are optional add-ons.
        </p>
      </SectionCard>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}
