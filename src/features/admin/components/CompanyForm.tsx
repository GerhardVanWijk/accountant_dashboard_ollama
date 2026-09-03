import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { BankAccount, Company } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel, FieldError } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { EnumSelect, type EnumOption } from '@/components/app/combobox';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { FormBody, FormFooter, FormSection } from '@/components/app/form';
import {
  companyFormSchema,
  companyToFormValues,
  LOGO_ACCEPTED_MIME,
  LOGO_MAX_BYTES,
  type CompanyFormValues,
} from '../utils/companyFormSchema';

export interface CompanyFormProps {
  company: Company;
  /** The company's own bank accounts — populates the "Bank account shown on documents" selector. */
  bankAccounts?: BankAccount[];
  onSubmit: (values: CompanyFormValues) => Promise<void> | void;
  onCancel: () => void;
  submitError?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
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

const LEGAL_ENTITY_OPTIONS: EnumOption[] = Object.entries(legalEntityLabels).map(([value, label]) => ({
  value,
  label,
}));

const ACCOUNTING_BASIS_OPTIONS: EnumOption[] = [
  { value: 'accrual', label: 'Accrual' },
  { value: 'cash', label: 'Cash' },
];

const VAT_FILING_FREQUENCY_OPTIONS: EnumOption[] = [
  { value: '', label: 'Not set' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'bi_monthly', label: 'Bi-monthly' },
  { value: 'six_monthly', label: 'Six-monthly' },
  { value: 'annual', label: 'Annual' },
];

const VAT_ACCOUNTING_BASIS_OPTIONS: EnumOption[] = [
  { value: '', label: 'Not set' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'payments', label: 'Payments' },
];

const LOGO_ACCEPT_ATTR = LOGO_ACCEPTED_MIME.join(',');

/**
 * Company profile edit form — react-hook-form + zod
 * (companyFormSchema.ts). Deliberately does not expose reportingFramework
 * or isSbcEligible; see that schema's doc comment for why.
 *
 * The "Document & branding" section (Phase 4B-2) feeds the global business
 * documents (`src/features/businessDocuments/`). The logo is read
 * client-side into a base64 data URL — there is no Storage bucket — with a
 * mime allow-list and a 512 KB cap enforced here on file pick.
 */
export function CompanyForm({
  company,
  bankAccounts = [],
  onSubmit,
  onCancel,
  submitError,
  onDirtyChange,
}: CompanyFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: companyToFormValues(company),
  });

  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);

  const logo = watch('logo');
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handleLogoFile(file: File | undefined) {
    setLogoError(null);
    if (!file) return;
    if (!(LOGO_ACCEPTED_MIME as readonly string[]).includes(file.type)) {
      setLogoError('Logo must be a PNG, JPEG, WebP or SVG image.');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError('Logo must be 512 KB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setValue('logo', String(reader.result), { shouldDirty: true });
    reader.onerror = () => setLogoError('Could not read that file.');
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    setLogoError(null);
    setValue('logo', '', { shouldDirty: true });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        await onSubmit(values);
      })}
      className="flex min-h-0 flex-1 flex-col"
    >
      <FormBody>
      <FormSection title="Company details">
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
            <Controller
              control={control}
              name="legalEntityType"
              render={({ field, fieldState }) => (
                <EnumSelect
                  id="company-legal-type"
                  name="legalEntityType"
                  value={field.value ?? 'private_company'}
                  onValueChange={field.onChange}
                  invalid={Boolean(fieldState.error)}
                  options={LEGAL_ENTITY_OPTIONS}
                />
              )}
            />
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
      </FormSection>

      <FormSection title="Financial year & accounting">
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
            <Controller
              control={control}
              name="accountingBasis"
              render={({ field, fieldState }) => (
                <EnumSelect
                  id="company-accounting-basis"
                  name="accountingBasis"
                  value={field.value ?? 'accrual'}
                  onValueChange={field.onChange}
                  invalid={Boolean(fieldState.error)}
                  options={ACCOUNTING_BASIS_OPTIONS}
                />
              )}
            />
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
      </FormSection>

      <FormSection title="VAT & tax">
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
            <Controller
              control={control}
              name="vatFilingFrequency"
              render={({ field, fieldState }) => (
                <EnumSelect
                  id="company-vat-frequency"
                  name="vatFilingFrequency"
                  value={field.value ?? ''}
                  onValueChange={(v) => field.onChange(v === '' ? undefined : v)}
                  invalid={Boolean(fieldState.error)}
                  options={VAT_FILING_FREQUENCY_OPTIONS}
                />
              )}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="company-vat-basis">VAT accounting basis</FieldLabel>
            <Controller
              control={control}
              name="vatAccountingBasis"
              render={({ field, fieldState }) => (
                <EnumSelect
                  id="company-vat-basis"
                  name="vatAccountingBasis"
                  value={field.value ?? ''}
                  onValueChange={(v) => field.onChange(v === '' ? undefined : v)}
                  invalid={Boolean(fieldState.error)}
                  options={VAT_ACCOUNTING_BASIS_OPTIONS}
                />
              )}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="company-income-tax-number">Income tax number</FieldLabel>
            <Input id="company-income-tax-number" {...register('incomeTaxNumber')} />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Document & branding"
        description="Shown on printed quotes, invoices, credit notes and purchase orders. Leave a field blank to omit it from the document."
      >
        <input type="hidden" {...register('logo')} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="company-trading-name">Trading name</FieldLabel>
            <Input id="company-trading-name" {...register('tradingName')} />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="company-logo">Logo</FieldLabel>
            <div className="flex flex-wrap items-center gap-3">
              {logo ? (
                <img
                  src={logo}
                  alt="Company logo preview"
                  className="max-h-16 w-auto max-w-[220px] rounded border border-border bg-white object-contain p-1"
                />
              ) : (
                <span className="text-xs text-muted-foreground">No logo — the name is shown as a wordmark.</span>
              )}
              <input
                ref={fileInputRef}
                id="company-logo"
                type="file"
                accept={LOGO_ACCEPT_ATTR}
                className="text-xs"
                onChange={(e) => handleLogoFile(e.target.files?.[0])}
              />
              {logo && (
                <Button type="button" size="sm" variant="outline" onClick={removeLogo}>
                  Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">PNG, JPEG, WebP or SVG. Maximum 512 KB.</p>
            {logoError && <p className="text-xs text-destructive">{logoError}</p>}
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="company-doc-line1">Address line 1</FieldLabel>
            <Input id="company-doc-line1" {...register('documentAddress.line1')} />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="company-doc-line2">Address line 2</FieldLabel>
            <Input id="company-doc-line2" {...register('documentAddress.line2')} />
          </Field>
          <Field>
            <FieldLabel htmlFor="company-doc-city">City</FieldLabel>
            <Input id="company-doc-city" {...register('documentAddress.city')} />
          </Field>
          <Field>
            <FieldLabel htmlFor="company-doc-state">Province / state</FieldLabel>
            <Input id="company-doc-state" {...register('documentAddress.state')} />
          </Field>
          <Field>
            <FieldLabel htmlFor="company-doc-postal">Postal code</FieldLabel>
            <Input id="company-doc-postal" {...register('documentAddress.postalCode')} />
          </Field>
          <Field>
            <FieldLabel htmlFor="company-doc-country">Country</FieldLabel>
            <Input id="company-doc-country" {...register('documentAddress.country')} />
          </Field>
          <Field>
            <FieldLabel htmlFor="company-phone">Phone</FieldLabel>
            <Input id="company-phone" {...register('phone')} />
          </Field>
          <Field>
            <FieldLabel htmlFor="company-email">Email</FieldLabel>
            <Input id="company-email" {...register('email')} />
            <FieldError errors={[errors.email]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="company-website">Website</FieldLabel>
            <Input id="company-website" {...register('website')} />
          </Field>
          <Field>
            <FieldLabel htmlFor="company-documents-bank-account">Bank account shown on documents</FieldLabel>
            <Controller
              control={control}
              name="documentsBankAccountId"
              render={({ field }) => (
                <EnumSelect
                  id="company-documents-bank-account"
                  name="documentsBankAccountId"
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                  options={[
                    { value: '', label: 'None — omit the payment block' },
                    ...bankAccounts.map((account) => ({
                      value: account.id,
                      label: `${account.name} — ${account.bankName} (${account.accountNumber})${
                        account.status !== 'active' ? ' — inactive' : ''
                      }`,
                    })),
                  ]}
                />
              )}
            />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="company-document-terms">Default document terms</FieldLabel>
            <Textarea id="company-document-terms" rows={3} {...register('documentTerms')} />
          </Field>
        </div>
      </FormSection>
      </FormBody>

      <FormFooter error={submitError ?? undefined}>
        <Button variant="outline" type="button" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save changes'}
        </Button>
      </FormFooter>
    </form>
  );
}
