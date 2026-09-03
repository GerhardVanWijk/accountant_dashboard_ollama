import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Employee, EmployeeAllowance, EmployeeDeduction } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { FormBody, FormFooter } from '@/components/app/form';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Checkbox } from '@/components/ui/shadcn/checkbox';
import { EnumSelect } from '@/components/app/combobox';
import { EMPLOYMENT_TYPE_LABELS, EMPLOYEE_STATUS_LABELS, PAY_FREQUENCY_LABELS, PAYROLL_CURRENCY } from '../constants';
import type { CreateEmployeeDTO, UpdateEmployeeDTO } from '../services';

const EMPLOYEE_STATUS_OPTIONS = Object.entries(EMPLOYEE_STATUS_LABELS).map(([value, label]) => ({ value, label }));
const EMPLOYMENT_TYPE_OPTIONS = Object.entries(EMPLOYMENT_TYPE_LABELS).map(([value, label]) => ({ value, label }));
const PAY_FREQUENCY_OPTIONS = Object.entries(PAY_FREQUENCY_LABELS).map(([value, label]) => ({ value, label }));

function isNonNegativeNumber(value: string): boolean {
  return value.trim() !== '' && !Number.isNaN(Number(value)) && Number(value) >= 0;
}

const employeeSchema = z.object({
  employeeNumber: z.string().trim().min(1, 'Employee number is required'),
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  idNumber: z.string().trim().optional(),
  taxNumber: z.string().trim().optional(),
  dateOfBirth: z.string().optional(),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  employmentType: z.enum(['permanent', 'fixed_term', 'part_time', 'temporary']),
  payFrequency: z.enum(['monthly', 'weekly', 'biweekly']),
  status: z.enum(['active', 'inactive', 'terminated']),
  startDate: z.string().min(1, 'Start date is required'),
  basicSalary: z.string().refine(isNonNegativeNumber, { message: 'Basic salary must be 0 or more' }),
  bankName: z.string().trim().optional(),
  bankAccountNumber: z.string().trim().optional(),
  uifExempt: z.boolean(),
});

export type EmployeeFormValues = z.infer<typeof employeeSchema>;

export interface EmployeeFormProps {
  employee?: Employee;
  onSubmit: (data: CreateEmployeeDTO | UpdateEmployeeDTO) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function toDefaultValues(employee?: Employee): EmployeeFormValues {
  return {
    employeeNumber: employee?.employeeNumber ?? '',
    firstName: employee?.firstName ?? '',
    lastName: employee?.lastName ?? '',
    idNumber: employee?.idNumber ?? '',
    taxNumber: employee?.taxNumber ?? '',
    dateOfBirth: employee?.dateOfBirth ?? '',
    email: employee?.email ?? '',
    phone: employee?.phone ?? '',
    employmentType: employee?.employmentType ?? 'permanent',
    payFrequency: employee?.payFrequency ?? 'monthly',
    status: employee?.status ?? 'active',
    startDate: employee?.startDate ?? new Date().toISOString().slice(0, 10),
    basicSalary: employee ? String(employee.basicSalary) : '',
    bankName: employee?.bankName ?? '',
    bankAccountNumber: employee?.bankAccountNumber ?? '',
    uifExempt: employee?.uifExempt ?? false,
  };
}

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Create/edit form for Employee master data (react-hook-form + zod for the
 * scalar fields). Recurring allowances/deductions are a plain local-state
 * repeatable list — every payroll run recomputes from these standard
 * amounts, plus a one-off overtime/bonus override per run (see
 * PayslipLinesTable). Re-skinned onto v0's Field/Input/Checkbox (M13);
 * validation schema, DTO shape and payroll calculation inputs unchanged.
 */
export function EmployeeForm({ employee, onSubmit, onCancel, onDirtyChange }: EmployeeFormProps) {
  const [allowances, setAllowances] = useState<EmployeeAllowance[]>(employee?.standardAllowances ?? []);
  const [deductions, setDeductions] = useState<EmployeeDeduction[]>(employee?.standardDeductions ?? []);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: toDefaultValues(employee),
  });

  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);

  const submit = handleSubmit(async (data) => {
    await onSubmit({
      employeeNumber: data.employeeNumber,
      firstName: data.firstName,
      lastName: data.lastName,
      idNumber: data.idNumber || undefined,
      taxNumber: data.taxNumber || undefined,
      dateOfBirth: data.dateOfBirth || undefined,
      email: data.email || undefined,
      phone: data.phone || undefined,
      employmentType: data.employmentType,
      payFrequency: data.payFrequency,
      status: data.status,
      startDate: data.startDate,
      basicSalary: Number(data.basicSalary),
      standardAllowances: allowances.filter((a) => a.label.trim() !== ''),
      standardDeductions: deductions.filter((d) => d.label.trim() !== ''),
      bankName: data.bankName || undefined,
      bankAccountNumber: data.bankAccountNumber || undefined,
      uifExempt: data.uifExempt,
      currency: employee?.currency ?? PAYROLL_CURRENCY,
    });
  });

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <FormBody>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="employeeNumber">Employee Number</FieldLabel>
          <Input id="employeeNumber" className="font-mono" {...register('employeeNumber')} />
          <FieldError errors={[errors.employeeNumber]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="status">Status</FieldLabel>
          <Controller
            control={control}
            name="status"
            render={({ field, fieldState }) => (
              <EnumSelect
                id="status"
                name="status"
                value={field.value ?? 'active'}
                onValueChange={field.onChange}
                invalid={Boolean(fieldState.error)}
                options={EMPLOYEE_STATUS_OPTIONS}
              />
            )}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="firstName">First Name</FieldLabel>
          <Input id="firstName" {...register('firstName')} />
          <FieldError errors={[errors.firstName]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="lastName">Last Name</FieldLabel>
          <Input id="lastName" {...register('lastName')} />
          <FieldError errors={[errors.lastName]} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="idNumber">SA ID Number</FieldLabel>
          <Input id="idNumber" {...register('idNumber')} />
        </Field>
        <Field>
          <FieldLabel htmlFor="taxNumber">Tax Number (SARS)</FieldLabel>
          <Input id="taxNumber" {...register('taxNumber')} />
        </Field>
        <Field>
          <FieldLabel htmlFor="dateOfBirth">Date of Birth</FieldLabel>
          <Input id="dateOfBirth" type="date" {...register('dateOfBirth')} />
          <FieldDescription>Drives the 65+/75+ PAYE rebate tier.</FieldDescription>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" type="email" {...register('email')} />
        </Field>
        <Field>
          <FieldLabel htmlFor="phone">Phone</FieldLabel>
          <Input id="phone" {...register('phone')} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="employmentType">Employment Type</FieldLabel>
          <Controller
            control={control}
            name="employmentType"
            render={({ field, fieldState }) => (
              <EnumSelect
                id="employmentType"
                name="employmentType"
                value={field.value ?? 'permanent'}
                onValueChange={field.onChange}
                invalid={Boolean(fieldState.error)}
                options={EMPLOYMENT_TYPE_OPTIONS}
              />
            )}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="payFrequency">Pay Frequency</FieldLabel>
          <Controller
            control={control}
            name="payFrequency"
            render={({ field, fieldState }) => (
              <EnumSelect
                id="payFrequency"
                name="payFrequency"
                value={field.value ?? 'monthly'}
                onValueChange={field.onChange}
                invalid={Boolean(fieldState.error)}
                options={PAY_FREQUENCY_OPTIONS}
              />
            )}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="startDate">Start Date</FieldLabel>
          <Input id="startDate" type="date" {...register('startDate')} />
          <FieldError errors={[errors.startDate]} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="basicSalary">Basic Salary per Pay Period ({PAYROLL_CURRENCY})</FieldLabel>
          <Input id="basicSalary" type="number" step="0.01" {...register('basicSalary')} />
          <FieldError errors={[errors.basicSalary]} />
        </Field>
        <Controller
          control={control}
          name="uifExempt"
          render={({ field }) => (
            <Field orientation="horizontal" className="items-center pt-6">
              <Checkbox id="uifExempt" checked={field.value} onCheckedChange={(value) => field.onChange(value === true)} />
              <FieldLabel htmlFor="uifExempt">UIF exempt</FieldLabel>
            </Field>
          )}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="bankName">Bank Name</FieldLabel>
          <Input id="bankName" {...register('bankName')} />
        </Field>
        <Field>
          <FieldLabel htmlFor="bankAccountNumber">Bank Account Number</FieldLabel>
          <Input id="bankAccountNumber" {...register('bankAccountNumber')} />
        </Field>
      </div>

      <fieldset className="rounded-lg border border-border p-4">
        <legend className="px-1.5 text-sm font-medium">Standard Allowances</legend>
        <div className="flex flex-col gap-3">
          {allowances.map((allowance, index) => (
            <div key={allowance.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                aria-label="Allowance label"
                placeholder="e.g. Travel Allowance"
                value={allowance.label}
                onChange={(e) => setAllowances((prev) => prev.map((a, i) => (i === index ? { ...a, label: e.target.value } : a)))}
              />
              <Input
                aria-label="Allowance amount"
                type="number"
                step="0.01"
                placeholder="Amount"
                value={allowance.amount}
                onChange={(e) => setAllowances((prev) => prev.map((a, i) => (i === index ? { ...a, amount: Number(e.target.value) } : a)))}
              />
              <label className="flex items-center gap-1.5 whitespace-nowrap text-sm">
                <Checkbox checked={allowance.taxable} onCheckedChange={(value) => setAllowances((prev) => prev.map((a, i) => (i === index ? { ...a, taxable: value === true } : a)))} />
                Taxable
              </label>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAllowances((prev) => prev.filter((_, i) => i !== index))}>
                Remove
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setAllowances((prev) => [...prev, { id: newId('allow'), label: '', amount: 0, taxable: true }])}>
            + Add Allowance
          </Button>
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-border p-4">
        <legend className="px-1.5 text-sm font-medium">Standard Deductions</legend>
        <div className="flex flex-col gap-3">
          {deductions.map((deduction, index) => (
            <div key={deduction.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                aria-label="Deduction label"
                placeholder="e.g. Pension Fund"
                value={deduction.label}
                onChange={(e) => setDeductions((prev) => prev.map((d, i) => (i === index ? { ...d, label: e.target.value } : d)))}
              />
              <Input
                aria-label="Deduction amount"
                type="number"
                step="0.01"
                placeholder="Amount"
                value={deduction.amount}
                onChange={(e) => setDeductions((prev) => prev.map((d, i) => (i === index ? { ...d, amount: Number(e.target.value) } : d)))}
              />
              <label className="flex items-center gap-1.5 whitespace-nowrap text-sm">
                <Checkbox checked={deduction.preTax} onCheckedChange={(value) => setDeductions((prev) => prev.map((d, i) => (i === index ? { ...d, preTax: value === true } : d)))} />
                Pre-tax
              </label>
              <Button type="button" variant="ghost" size="sm" onClick={() => setDeductions((prev) => prev.filter((_, i) => i !== index))}>
                Remove
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setDeductions((prev) => [...prev, { id: newId('ded'), label: '', amount: 0, preTax: false }])}>
            + Add Deduction
          </Button>
        </div>
      </fieldset>

      </FormBody>

      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {employee ? 'Save Changes' : 'Add Employee'}
        </Button>
      </FormFooter>
    </form>
  );
}
