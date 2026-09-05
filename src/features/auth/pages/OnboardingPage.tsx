import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { Checkbox } from '@/components/ui/shadcn/checkbox';
import { Field, FieldError, FieldLabel } from '@/components/ui/shadcn/field';
import { FormSection } from '@/components/app/form';
import { Input } from '@/components/ui/shadcn/input';
import { EnumSelect } from '@/components/app/combobox';
import { Wordmark } from '@/components/app/wordmark';
import { supabase } from '@/config/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { SALegalEntityType } from '@/types';
import { profileService } from '../services';

const legalEntityOptions: { value: SALegalEntityType; label: string }[] = [
  { value: 'private_company', label: '(Pty) Ltd — Private Company' },
  { value: 'public_company', label: 'Ltd — Public Company' },
  { value: 'personal_liability_company', label: 'Inc — Personal Liability Company' },
  { value: 'state_owned_company', label: 'SOC Ltd — State-Owned Company' },
  { value: 'non_profit_company', label: 'NPC — Non-Profit Company' },
  { value: 'close_corporation', label: 'CC — Close Corporation' },
  { value: 'sole_proprietor', label: 'Sole Proprietor' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'trust', label: 'Trust' },
  { value: 'external_company', label: 'External Company' },
  { value: 'other', label: 'Other' },
];

const monthOptions = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
].map((label, i) => ({ value: String(i + 1), label }));

const schema = z
  .object({
    name: z.string().trim().min(1, 'Company name is required.').max(160, 'That name is too long.'),
    tradingName: z.string().trim().max(160, 'That name is too long.').optional(),
    legalEntityType: z.enum([
      'private_company', 'public_company', 'personal_liability_company', 'state_owned_company',
      'non_profit_company', 'close_corporation', 'sole_proprietor', 'partnership', 'trust',
      'external_company', 'other',
    ]),
    registrationNumber: z.string().trim().max(60, 'That number is too long.').optional(),
    isVatRegistered: z.boolean(),
    vatRegistrationNumber: z.string().trim().max(30, 'That number is too long.').optional(),
    financialYearEndMonth: z.coerce.number().int().min(1).max(12),
    financialYearEndDay: z.coerce.number().int().min(1, 'Enter a day between 1 and 31.').max(31, 'Enter a day between 1 and 31.'),
    contactEmail: z
      .string()
      .trim()
      .max(160)
      .optional()
      .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address.'),
    contactPhone: z.string().trim().max(30, 'That number is too long.').optional(),
  })
  .refine((d) => !d.isVatRegistered || Boolean(d.vatRegistrationNumber && d.vatRegistrationNumber.length > 0), {
    message: 'Enter your VAT registration number, or clear the "VAT registered" box.',
    path: ['vatRegistrationNumber'],
  });

type FormValues = z.infer<typeof schema>;

/**
 * First-login step for a signed-up user with no company yet
 * (`profile.companyId` undefined). Creates the company through the
 * `create_company_and_become_admin` RPC (migration 0066) — one atomic
 * SECURITY DEFINER transaction that inserts the company, links the caller
 * as its admin (via a strictly-scoped trigger-bypass GUC), seeds the
 * default South African chart of accounts + current financial year + 12
 * monthly periods, and audits it. Before 0066 the profile link was
 * silently reverted by `protect_profile_privileged_columns` and every
 * attempt left an orphan company — see docs/KNOWN_ISSUES.md.
 *
 * Still a "create only" step (no self-serve "join an existing company" —
 * see docs/COMMERCIAL_ONBOARDING.md / docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase T). A colleague joining an existing company is admin-initiated
 * from /admin/users (migration 0065 `add_existing_user_to_company` + the
 * invitation flow).
 */
export function OnboardingPage() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const logout = useAuthStore((s) => s.logout);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      tradingName: '',
      legalEntityType: 'private_company',
      registrationNumber: '',
      isVatRegistered: false,
      vatRegistrationNumber: '',
      financialYearEndMonth: 2,
      financialYearEndDay: 28,
      contactEmail: profile?.email ?? '',
      contactPhone: '',
    },
  });

  const busy = submitting || isSubmitting;
  const vatRegistered = watch('isVatRegistered');

  const onSubmit = async (values: FormValues) => {
    if (submitting) return; // guard against a double-submit slipping past the disabled button
    setSubmitting(true);
    setServerError(null);
    try {
      const { error } = await supabase.rpc('create_company_and_become_admin', {
        p_name: values.name.trim(),
        p_legal_entity_type: values.legalEntityType,
        p_financial_year_end_month: values.financialYearEndMonth,
        p_financial_year_end_day: values.financialYearEndDay,
        p_functional_currency: 'ZAR',
        p_registration_number: values.registrationNumber?.trim() || null,
        p_trading_name: values.tradingName?.trim() || null,
        p_is_vat_registered: values.isVatRegistered,
        p_vat_registration_number: values.isVatRegistered ? values.vatRegistrationNumber?.trim() || null : null,
        p_contact_email: values.contactEmail?.trim() || null,
        p_contact_phone: values.contactPhone?.trim() || null,
      });
      if (error) {
        setServerError(error.message);
        return;
      }
      if (profile) {
        const refreshed = await profileService.getById(profile.id);
        if (refreshed) setProfile(refreshed);
      }
      navigate('/', { replace: true });
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4 sm:px-10">
        <Wordmark />
        <button type="button" onClick={logout} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          Sign out
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10 sm:px-10 sm:py-14">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">Create your company</h1>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            This sets up your accounting workspace{profile?.email ? <> for <span className="font-medium text-foreground">{profile.email}</span></> : null}. We&apos;ll
            create a standard South African chart of accounts and your current financial year automatically — you can
            adjust everything later in Settings.
          </p>
        </div>

        <form className="flex flex-col gap-9" onSubmit={handleSubmit(onSubmit)} noValidate>
          <FormSection title="Company details">
            <Field>
              <FieldLabel htmlFor="name">Registered company name</FieldLabel>
              <Input id="name" autoComplete="organization" placeholder="e.g. Kalahari Trading (Pty) Ltd" {...register('name')} />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="tradingName">Trading name (optional)</FieldLabel>
              <Input id="tradingName" placeholder="The name you trade as, if different" {...register('tradingName')} />
              <FieldError errors={[errors.tradingName]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="legalEntityType">Legal entity type</FieldLabel>
              <Controller
                control={control}
                name="legalEntityType"
                render={({ field, fieldState }) => (
                  <EnumSelect
                    id="legalEntityType"
                    name="legalEntityType"
                    value={field.value}
                    onValueChange={field.onChange}
                    invalid={Boolean(fieldState.error)}
                    options={legalEntityOptions}
                  />
                )}
              />
              <FieldError errors={[errors.legalEntityType]} />
            </Field>
          </FormSection>

          <FormSection title="Registration & tax" description="Optional now — you can add these later. They appear on your invoices and tax returns.">
            <Field>
              <FieldLabel htmlFor="registrationNumber">Company registration number</FieldLabel>
              <Input id="registrationNumber" placeholder="e.g. 2021/123456/07" {...register('registrationNumber')} />
              <FieldError errors={[errors.registrationNumber]} />
            </Field>
            <Controller
              control={control}
              name="isVatRegistered"
              render={({ field }) => (
                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-2.5 text-sm leading-relaxed text-foreground">
                    <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                    This business is registered for VAT
                  </label>
                  <p className="pl-[calc(1rem+0.625rem)] text-sm text-muted-foreground">Turn this on once SARS has issued your VAT number.</p>
                </div>
              )}
            />
            {vatRegistered && (
              <Field>
                <FieldLabel htmlFor="vatRegistrationNumber">VAT registration number</FieldLabel>
                <Input id="vatRegistrationNumber" inputMode="numeric" placeholder="10-digit VAT number" {...register('vatRegistrationNumber')} />
                <FieldError errors={[errors.vatRegistrationNumber]} />
              </Field>
            )}
          </FormSection>

          <FormSection title="Financial setup">
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <Field>
                <FieldLabel htmlFor="financialYearEndMonth">Financial year-end month</FieldLabel>
                <Controller
                  control={control}
                  name="financialYearEndMonth"
                  render={({ field }) => (
                    <EnumSelect
                      id="financialYearEndMonth"
                      name="financialYearEndMonth"
                      value={String(field.value)}
                      onValueChange={(v) => field.onChange(Number(v))}
                      options={monthOptions}
                    />
                  )}
                />
                <FieldError errors={[errors.financialYearEndMonth]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="financialYearEndDay">Day</FieldLabel>
                <Input id="financialYearEndDay" type="number" min={1} max={31} {...register('financialYearEndDay')} />
                <FieldError errors={[errors.financialYearEndDay]} />
              </Field>
            </div>
            <p className="-mt-1 text-sm text-muted-foreground">
              Most South African businesses use the last day of February or December. We&apos;ll create the financial
              year that covers today and its monthly periods.
            </p>
            <Field>
              <FieldLabel htmlFor="currency">Base currency</FieldLabel>
              <Input id="currency" value="South African Rand (ZAR)" readOnly aria-readonly className="text-muted-foreground" />
            </Field>
          </FormSection>

          <FormSection title="Contact (optional)" description="Shown on the documents you send to customers and suppliers.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="contactEmail">Contact email</FieldLabel>
                <Input id="contactEmail" type="email" autoComplete="email" {...register('contactEmail')} />
                <FieldError errors={[errors.contactEmail]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="contactPhone">Contact phone</FieldLabel>
                <Input id="contactPhone" type="tel" autoComplete="tel" placeholder="+27…" {...register('contactPhone')} />
                <FieldError errors={[errors.contactPhone]} />
              </Field>
            </div>
          </FormSection>

          {serverError && (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
              {serverError}
            </p>
          )}

          <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row-reverse sm:items-center sm:justify-between">
            <Button type="submit" size="lg" className="sm:w-auto" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                  Creating your workspace…
                </>
              ) : (
                'Create company'
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              You&apos;ll become this company&apos;s administrator. Joining an existing company? Ask its admin to invite{' '}
              <span className="font-medium text-foreground">{profile?.email ?? 'your email'}</span>.
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}
