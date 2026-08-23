import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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

const inputClasses =
  'w-full rounded-md border border-border bg-background px-md py-sm text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/**
 * First-login step for a signed-up user with no company yet
 * (`profile.companyId` undefined). Only "create a company" is offered —
 * deliberately NOT a self-serve "join an existing company by name/id":
 * every company-scoped table's RLS grants full read/write the instant
 * `company_id` matches, with no separate membership-approval gate, so
 * letting a user set their own `company_id` to any company they can find
 * would be a real tenant-isolation bypass (found while designing this —
 * see docs/SUPABASE_MIGRATION_GUIDE.md's Phase T section). Joining an
 * existing company is instead admin-initiated: a company admin adds an
 * already-signed-up, still-companyless user from the Users & Roles admin
 * page (src/features/admin/pages/UsersPage.tsx), which the DB now
 * explicitly permits (migration 0012's `profiles_update_admin_same_company`
 * policy) without opening this hole.
 *
 * Runs through `create_company_and_become_admin`, a SECURITY DEFINER RPC
 * (migration 0012) rather than plain client-side table writes — the same
 * migration's `protect_profile_privileged_columns` trigger otherwise locks
 * every signed-in user's own `role`/`company_id` against self-elevation.
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
    <div className="flex min-h-screen items-center justify-center bg-background p-lg">
      <Card className="w-full max-w-md">
        <h1 className="text-xl font-semibold text-text-primary">Set up your company</h1>
        <p className="mt-xs text-sm text-text-secondary">
          You'll become this company's admin. Already have a company on the platform? Ask its admin to add you using{' '}
          <span className="font-medium text-text-primary">{profile?.email}</span>.
        </p>

        <form className="mt-lg flex flex-col gap-md" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div>
            <label htmlFor="name" className="mb-xs block text-sm font-medium text-text-primary">
              Company name
            </label>
            <input id="name" type="text" className={inputClasses} {...register('name')} />
            {errors.name && <p className="mt-xs text-sm text-danger">{errors.name.message}</p>}
          </div>

          <div>
            <label htmlFor="legalEntityType" className="mb-xs block text-sm font-medium text-text-primary">
              Legal entity type
            </label>
            <select id="legalEntityType" className={inputClasses} {...register('legalEntityType')}>
              {legalEntityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-md">
            <div>
              <label htmlFor="financialYearEndMonth" className="mb-xs block text-sm font-medium text-text-primary">
                Year-end month
              </label>
              <input
                id="financialYearEndMonth"
                type="number"
                min={1}
                max={12}
                className={inputClasses}
                {...register('financialYearEndMonth')}
              />
              {errors.financialYearEndMonth && (
                <p className="mt-xs text-sm text-danger">{errors.financialYearEndMonth.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="financialYearEndDay" className="mb-xs block text-sm font-medium text-text-primary">
                Year-end day
              </label>
              <input
                id="financialYearEndDay"
                type="number"
                min={1}
                max={31}
                className={inputClasses}
                {...register('financialYearEndDay')}
              />
              {errors.financialYearEndDay && <p className="mt-xs text-sm text-danger">{errors.financialYearEndDay.message}</p>}
            </div>
          </div>

          {serverError && <p className="text-sm text-danger">{serverError}</p>}

          <Button type="submit" className="mt-sm w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Creating company…' : 'Create company'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
