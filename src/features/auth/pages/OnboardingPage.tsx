import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
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

const schema = z.object({
  name: z.string().min(1, 'Company name is required.'),
  legalEntityType: z.enum([
    'private_company',
    'public_company',
    'personal_liability_company',
    'state_owned_company',
    'non_profit_company',
    'close_corporation',
    'sole_proprietor',
    'partnership',
    'trust',
    'external_company',
    'other',
  ]),
  financialYearEndMonth: z.coerce.number().int().min(1).max(12),
  financialYearEndDay: z.coerce.number().int().min(1).max(31),
});

type FormValues = z.infer<typeof schema>;

/**
 * First-login step for a signed-up user with no company yet
 * (`profile.companyId` undefined). PRESENTATION ONLY re-skin (M10) — same
 * `create_company_and_become_admin` SECURITY DEFINER RPC, same fields, same
 * validation, same redirect. See the pre-M10 version's history for the full
 * rationale on why this is a "create only" step (no self-serve "join an
 * existing company" — see docs/SUPABASE_MIGRATION_GUIDE.md's Phase T
 * section) and why it runs through an RPC rather than plain table writes.
 */
export function OnboardingPage() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { financialYearEndMonth: 12, financialYearEndDay: 31 },
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const { error } = await supabase.rpc('create_company_and_become_admin', {
      p_name: values.name,
      p_legal_entity_type: values.legalEntityType,
      p_financial_year_end_month: values.financialYearEndMonth,
      p_financial_year_end_day: values.financialYearEndDay,
      p_functional_currency: 'ZAR',
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
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6">
        <h1 className="text-xl font-semibold text-foreground">Set up your company</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          You&apos;ll become this company&apos;s admin. Already have a company on the platform? Ask its admin to add you using <span className="font-medium text-foreground">{profile?.email}</span>.
        </p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <Field>
            <FieldLabel htmlFor="name">Company name</FieldLabel>
            <Input id="name" {...register('name')} />
            <FieldError errors={[errors.name]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="legalEntityType">Legal entity type</FieldLabel>
            <NativeSelect id="legalEntityType" {...register('legalEntityType')}>
              {legalEntityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="financialYearEndMonth">Year-end month</FieldLabel>
              <Input id="financialYearEndMonth" type="number" min={1} max={12} {...register('financialYearEndMonth')} />
              <FieldError errors={[errors.financialYearEndMonth]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="financialYearEndDay">Year-end day</FieldLabel>
              <Input id="financialYearEndDay" type="number" min={1} max={31} {...register('financialYearEndDay')} />
              <FieldError errors={[errors.financialYearEndDay]} />
            </Field>
          </div>

          {serverError && (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          )}

          <Button type="submit" className="mt-1 w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" data-icon="inline-start" />
                Creating company…
              </>
            ) : (
              'Create company'
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
