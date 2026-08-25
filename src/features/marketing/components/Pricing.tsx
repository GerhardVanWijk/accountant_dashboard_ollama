import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckIcon, MinusIcon, PlusIcon } from 'lucide-react';

import { Button } from '@/components/ui/shadcn/button';
import { Checkbox } from '@/components/ui/shadcn/checkbox';
import { Separator } from '@/components/ui/shadcn/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/shadcn/toggle-group';
import { cn } from '@/lib/utils';
import { ANNUAL_DISCOUNT, VAT_RATE, addOns, brand, plans } from '../content';
import { SectionHeading } from './SectionHeading';

function formatZar(amount: number, decimals = 0) {
  return `R ${amount
    .toFixed(decimals)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
    .replace('.', ',')}`;
}

/** Ported from accounting-v0-frontend/components/landing/pricing.tsx — <a href> CTA swapped for react-router Link, otherwise unchanged (the calculator logic is pure client-side marketing content, not real billing). */
export function Pricing() {
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const [planId, setPlanId] = useState(plans.find((p) => p.popular)?.id ?? plans[0].id);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [extraUsers, setExtraUsers] = useState(0);

  const annual = billing === 'annual';
  const discount = annual ? 1 - ANNUAL_DISCOUNT : 1;
  const selectedPlan = plans.find((p) => p.id === planId) ?? plans[0];

  const planPrice = selectedPlan.monthly * discount;

  const addOnLines = addOns
    .map((addOn) => {
      const quantity = addOn.perUnit ? extraUsers : selectedAddOns.includes(addOn.id) ? 1 : 0;
      return { addOn, quantity, amount: addOn.monthly * quantity * discount };
    })
    .filter((line) => line.quantity > 0);

  const subtotal = planPrice + addOnLines.reduce((sum, line) => sum + line.amount, 0);
  const vat = subtotal * VAT_RATE;
  const total = subtotal + vat;

  function toggleAddOn(id: string, checked: boolean) {
    setSelectedAddOns((prev) => (checked ? [...prev, id] : prev.filter((item) => item !== id)));
  }

  return (
    <section id="pricing" className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
      <SectionHeading
        kicker="Pricing in rands"
        title="Build the plan that fits your books"
        description="Pick a tier, add only the modules you need, and see exactly what leaves your account each month — VAT included."
      />

      <div className="mt-10 flex flex-col items-center gap-3">
        <ToggleGroup
          value={[billing]}
          onValueChange={(value) => {
            const next = value[0];
            if (next === 'monthly' || next === 'annual') setBilling(next);
          }}
          variant="outline"
          spacing={0}
          aria-label="Billing period"
        >
          <ToggleGroupItem value="monthly" className="h-10 px-5 text-sm aria-pressed:bg-brand aria-pressed:text-brand-foreground">
            Monthly
          </ToggleGroupItem>
          <ToggleGroupItem value="annual" className="h-10 gap-2 px-5 text-sm aria-pressed:bg-brand aria-pressed:text-brand-foreground">
            Annual
            <span className="rounded-full bg-brand-muted px-1.5 py-0.5 text-[10px] font-medium text-brand group-aria-pressed/toggle:bg-brand-foreground/15 group-aria-pressed/toggle:text-brand-foreground">
              Save 20%
            </span>
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="text-xs text-muted-foreground">All prices exclude VAT unless stated. Cancel or change any time.</p>
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => {
          const active = plan.id === planId;
          const price = plan.monthly * discount;
          return (
            <div
              key={plan.id}
              className={cn(
                'relative flex flex-col gap-6 rounded-2xl border p-6 transition-colors',
                active ? 'border-brand/50 bg-card/70 ring-1 ring-brand/25' : 'border-border bg-card/30 hover:border-border/80',
              )}
            >
              {plan.popular ? (
                <span className="absolute -top-3 left-6 rounded-full bg-brand px-2.5 py-1 text-[10px] font-semibold tracking-wide text-brand-foreground uppercase">Most popular</span>
              ) : null}

              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-medium tracking-tight">{plan.name}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{plan.blurb}</p>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-semibold tracking-tight">{formatZar(price)}</span>
                  <span className="text-sm text-muted-foreground">/ month</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {plan.includedUsers} user{plan.includedUsers > 1 ? 's' : ''} included
                  {annual ? ` · billed ${formatZar(price * 12)} yearly` : ''}
                </span>
              </div>

              <Separator />

              <ul className="flex flex-1 flex-col gap-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                    <span className="leading-relaxed text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button onClick={() => setPlanId(plan.id)} variant={active ? 'default' : 'outline'} className={cn('h-11 w-full', active && 'bg-brand text-brand-foreground hover:bg-brand/90')} aria-pressed={active}>
                {active ? 'Selected' : `Choose ${plan.name}`}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col items-start gap-4 lg:flex-row">
        <div className="flex w-full flex-1 flex-col gap-4 rounded-2xl border border-border bg-card/30 p-6">
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-medium tracking-tight">Add-ons</h3>
            <p className="text-sm text-muted-foreground">Bolt on only what you use. Everything is prorated to the day.</p>
          </div>

          <div className="flex flex-col gap-3">
            {addOns.map((addOn) => {
              const checked = selectedAddOns.includes(addOn.id);
              if (addOn.perUnit) {
                return (
                  <div key={addOn.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/40 p-4">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-sm font-medium">{addOn.name}</span>
                      <span className="text-xs leading-relaxed text-muted-foreground">
                        {addOn.description} {formatZar(addOn.monthly)} per {addOn.unitLabel} / month.
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon-lg" onClick={() => setExtraUsers((n) => Math.max(0, n - 1))} disabled={extraUsers === 0} aria-label={`Remove one extra ${addOn.unitLabel}`}>
                        <MinusIcon />
                      </Button>
                      <span aria-live="polite" className="w-8 text-center text-sm tabular-nums">
                        {extraUsers}
                      </span>
                      <Button variant="outline" size="icon-lg" onClick={() => setExtraUsers((n) => Math.min(addOn.maxUnits ?? 99, n + 1))} aria-label={`Add one extra ${addOn.unitLabel}`}>
                        <PlusIcon />
                      </Button>
                    </div>
                  </div>
                );
              }
              return (
                <label
                  key={addOn.id}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors',
                    checked ? 'border-brand/40 bg-brand-muted/40' : 'border-border/70 bg-background/40 hover:border-border',
                  )}
                >
                  <Checkbox checked={checked} onCheckedChange={(value) => toggleAddOn(addOn.id, value === true)} className="mt-0.5" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">{addOn.name}</span>
                      <span className="shrink-0 text-sm tabular-nums">
                        {formatZar(addOn.monthly)}
                        <span className="text-muted-foreground"> / mo</span>
                      </span>
                    </span>
                    <span className="text-xs leading-relaxed text-muted-foreground">{addOn.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex w-full flex-col gap-5 rounded-2xl border border-brand/30 bg-card/60 p-6 lg:sticky lg:top-24 lg:w-[22rem]">
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-medium tracking-tight">Your estimate</h3>
            <p className="text-xs text-muted-foreground">{annual ? 'Annual billing, shown per month' : 'Billed monthly'}</p>
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{selectedPlan.name} plan</span>
              <span className="tabular-nums">{formatZar(planPrice, 2)}</span>
            </div>

            {addOnLines.map((line) => (
              <div key={line.addOn.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-muted-foreground">
                  {line.addOn.name}
                  {line.quantity > 1 ? ` × ${line.quantity}` : ''}
                </span>
                <span className="tabular-nums">{formatZar(line.amount, 2)}</span>
              </div>
            ))}

            {addOnLines.length === 0 ? <p className="text-xs text-muted-foreground/70">No add-ons selected.</p> : null}
          </div>

          <Separator />

          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Subtotal excl. VAT</span>
              <span className="tabular-nums">{formatZar(subtotal, 2)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">VAT at 15%</span>
              <span className="tabular-nums">{formatZar(vat, 2)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1 rounded-xl bg-brand-muted p-4">
            <span className="text-xs font-medium text-brand">Total per month incl. VAT</span>
            <span aria-live="polite" className="text-3xl font-semibold tracking-tight text-brand tabular-nums">
              {formatZar(total, 2)}
            </span>
            {annual ? <span className="text-xs text-brand/80">{formatZar(total * 12, 2)} billed once a year</span> : null}
          </div>

          <Button render={<Link to={brand.signUpHref} />} nativeButton={false} className="h-11 w-full bg-brand text-brand-foreground hover:bg-brand/90">
            {brand.ctaPrimary}
          </Button>
          <p className="text-center text-xs text-muted-foreground">No card needed. Cancel before day 30 and you pay nothing.</p>
        </div>
      </div>
    </section>
  );
}
