import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Company } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel, FieldError } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
import { companyFormSchema, companyToFormValues, type CompanyFormValues } from '../utils/companyFormSchema';

export interface CompanyFormProps {
  company: Company;
  onSubmit: (values: CompanyFormValues) => Promise<void> | void;
  onCancel: () => void;
}

const legalEntityLabels: Record<CompanyFormValues['legalEntityType'], string> = {
  private_company: '(Pty) Ltd — Private company',
  public_company: 'Ltd — Public company',
  personal_liability_company: 'Inc — Personal liability company',
  state_owned_company: 'SOC Ltd — State-owned company',
  non_profit_company: 'NPC — Non-profit company',
  close_corporation: 'CC — Close corporation',
  sole_proprietor: 'Sole proprietor',
  partnership: 'Partnership',
  trust: 'Trust',
  external_company: 'External company',
  other: 'Other',
};

/**
 * Company profile edit form — react-hook-form + zod
 * (companyFormSchema.ts). Deliberately does not expose reportingFramework
 * or isSbcEligible; see that schema's doc comment for why.
 */
export function CompanyForm({ company, onSubmit, onCancel }: CompanyFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: companyToFormValues(company),
  });

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        await onSubmit(values);
      })}
      className="flex min-h-0 flex-1 flex-col gap-4 md:h-full"
    >
      <div className="app-scroll flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
      <fieldset className="flex flex-col gap-4">
        <legend className="text-sm font-semibold">Company details</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="company-name">Company name</FieldLabel>
            <Input id="company-name" {...register('name')} />
            <FieldError errors={[errors.name]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="company-reg-number">Registration number</FieldLabel>
            <Input id="company-reg-number" {...register('registrationNumber')} />
          </Field>
          <Field>
            <FieldLabel htmlFor="company-legal-type">Legal entity type</FieldLabel>
            <NativeSelect id="company-legal-type" {...register('legalEntityType')}>
              {Object.entries(legalEntityLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field orientation="horizontal">
            <input type="checkbox" id="company-active" className="size-4 rounded border-input" {...register('isActive')} />
            <FieldLabel htmlFor="company-active" className="font-normal">
              Active
            </FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <input type="checkbox" id="company-public" className="size-4 rounded border-input" {...register('isPublicCompany')} />
            <FieldLabel htmlFor="company-public" className="font-normal">
              Public company
            </FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <input type="checkbox" id="company-listed" className="size-4 rounded border-input" {...register('isListed')} />
            <FieldLabel htmlFor="company-listed" className="font-normal">
              Listed
            </FieldLabel>
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-sm font-semibold">Financial year &amp; accounting</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="company-fye-month">Financial year-end month</FieldLabel>
            <Input id="company-fye-month" type="number" min={1} max={12} {...register('financialYearEndMonth', { valueAsNumber: true })} />
            <FieldError errors={[errors.financialYearEndMonth]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="company-fye-day">Financial year-end day</FieldLabel>
            <Input id="company-fye-day" type="number" min={1} max={31} {...register('financialYearEndDay', { valueAsNumber: true })} />
            <FieldError errors={[errors.financialYearEndDay]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="company-accounting-basis">Accounting basis</FieldLabel>
            <NativeSelect id="company-accounting-basis" {...register('accountingBasis')}>
              <option value="accrual">Accrual</option>
              <option value="cash">Cash</option>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="company-functional-currency">Functional currency</FieldLabel>
            <Input id="company-functional-currency" {...register('functionalCurrency')} />
            <FieldError errors={[errors.functionalCurrency]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="company-presentation-currency">Presentation currency</FieldLabel>
            <Input id="company-presentation-currency" {...register('presentationCurrency')} />
            <FieldError errors={[errors.presentationCurrency]} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-sm font-semibold">VAT &amp; tax</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field orientation="horizontal">
            <input type="checkbox" id="company-vat-registered" className="size-4 rounded border-input" {...register('isVatRegistered')} />
            <FieldLabel htmlFor="company-vat-registered" className="font-normal">
              VAT registered
            </FieldLabel>
          </Field>
          <Field>
            <FieldLabel htmlFor="company-vat-number">VAT registration number</FieldLabel>
            <Input id="company-vat-number" {...register('vatRegistrationNumber')} />
          </Field>
          <Field>
            <FieldLabel htmlFor="company-vat-frequency">VAT filing frequency</FieldLabel>
            <NativeSelect
              id="company-vat-frequency"
              {...register('vatFilingFrequency', { setValueAs: (v) => (v === '' ? undefined : v) })}
            >
              <option value="">Not set</option>
              <option value="monthly">Monthly</option>
              <option value="bi_monthly">Bi-monthly</option>
              <option value="six_monthly">Six-monthly</option>
              <option value="annual">Annual</option>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="company-vat-basis">VAT accounting basis</FieldLabel>
            <NativeSelect
              id="company-vat-basis"
              {...register('vatAccountingBasis', { setValueAs: (v) => (v === '' ? undefined : v) })}
            >
              <option value="">Not set</option>
              <option value="invoice">Invoice</option>
              <option value="payments">Payments</option>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="company-income-tax-number">Income tax number</FieldLabel>
            <Input id="company-income-tax-number" {...register('incomeTaxNumber')} />
          </Field>
        </div>
      </fieldset>

      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" type="button" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
