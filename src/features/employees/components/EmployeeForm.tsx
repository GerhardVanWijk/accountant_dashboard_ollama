import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Employee, EmployeeAllowance, EmployeeDeduction } from '@/types';
import { Button } from '@/components/ui/Button';
import { EMPLOYMENT_TYPE_LABELS, EMPLOYEE_STATUS_LABELS, PAY_FREQUENCY_LABELS, PAYROLL_CURRENCY } from '../constants';
import { fieldError, fieldHint, fieldInput, fieldLabel } from './formStyles';
import type { CreateEmployeeDTO, UpdateEmployeeDTO } from '../services';

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
 * scalar fields, mirroring src/features/assets/components/AssetForm.tsx).
 * Recurring allowances/deductions are a plain local-state repeatable list
 * — every payroll run recomputes from these standard amounts, plus a
 * one-off overtime/bonus override per run (see PayrollRunDetail).
 */
export function EmployeeForm({ employee, onSubmit, onCancel }: EmployeeFormProps) {
  const [allowances, setAllowances] = useState<EmployeeAllowance[]>(employee?.standardAllowances ?? []);
  const [deductions, setDeductions] = useState<EmployeeDeduction[]>(employee?.standardDeductions ?? []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: toDefaultValues(employee),
  });

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
    <form onSubmit={submit} className="flex flex-col gap-md" noValidate>
      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <div>
          <label className={fieldLabel} htmlFor="employeeNumber">
            Employee Number
          </label>
          <input id="employeeNumber" className={fieldInput} {...register('employeeNumber')} />
          {errors.employeeNumber && <p className={fieldError}>{errors.employeeNumber.message}</p>}
        </div>
        <div>
          <label className={fieldLabel} htmlFor="status">
            Status
          </label>
          <select id="status" className={fieldInput} {...register('status')}>
            {Object.entries(EMPLOYEE_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <div>
          <label className={fieldLabel} htmlFor="firstName">
            First Name
          </label>
          <input id="firstName" className={fieldInput} {...register('firstName')} />
          {errors.firstName && <p className={fieldError}>{errors.firstName.message}</p>}
        </div>
        <div>
          <label className={fieldLabel} htmlFor="lastName">
            Last Name
          </label>
          <input id="lastName" className={fieldInput} {...register('lastName')} />
          {errors.lastName && <p className={fieldError}>{errors.lastName.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-md md:grid-cols-3">
        <div>
          <label className={fieldLabel} htmlFor="idNumber">
            SA ID Number
          </label>
          <input id="idNumber" className={fieldInput} {...register('idNumber')} />
        </div>
        <div>
          <label className={fieldLabel} htmlFor="taxNumber">
            Tax Number (SARS)
          </label>
          <input id="taxNumber" className={fieldInput} {...register('taxNumber')} />
        </div>
        <div>
          <label className={fieldLabel} htmlFor="dateOfBirth">
            Date of Birth
          </label>
          <input id="dateOfBirth" type="date" className={fieldInput} {...register('dateOfBirth')} />
          <p className={fieldHint}>Drives the 65+/75+ PAYE rebate tier.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <div>
          <label className={fieldLabel} htmlFor="email">
            Email
          </label>
          <input id="email" type="email" className={fieldInput} {...register('email')} />
        </div>
        <div>
          <label className={fieldLabel} htmlFor="phone">
            Phone
          </label>
          <input id="phone" className={fieldInput} {...register('phone')} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-md md:grid-cols-3">
        <div>
          <label className={fieldLabel} htmlFor="employmentType">
            Employment Type
          </label>
          <select id="employmentType" className={fieldInput} {...register('employmentType')}>
            {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={fieldLabel} htmlFor="payFrequency">
            Pay Frequency
          </label>
          <select id="payFrequency" className={fieldInput} {...register('payFrequency')}>
            {Object.entries(PAY_FREQUENCY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={fieldLabel} htmlFor="startDate">
            Start Date
          </label>
          <input id="startDate" type="date" className={fieldInput} {...register('startDate')} />
          {errors.startDate && <p className={fieldError}>{errors.startDate.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <div>
          <label className={fieldLabel} htmlFor="basicSalary">
            Basic Salary per Pay Period ({PAYROLL_CURRENCY})
          </label>
          <input id="basicSalary" type="number" step="0.01" className={fieldInput} {...register('basicSalary')} />
          {errors.basicSalary && <p className={fieldError}>{errors.basicSalary.message}</p>}
        </div>
        <div className="flex items-end pb-xs">
          <label className="flex items-center gap-sm text-sm text-text-primary">
            <input type="checkbox" {...register('uifExempt')} />
            UIF exempt
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <div>
          <label className={fieldLabel} htmlFor="bankName">
            Bank Name
          </label>
          <input id="bankName" className={fieldInput} {...register('bankName')} />
        </div>
        <div>
          <label className={fieldLabel} htmlFor="bankAccountNumber">
            Bank Account Number
          </label>
          <input id="bankAccountNumber" className={fieldInput} {...register('bankAccountNumber')} />
        </div>
      </div>

      <fieldset className="rounded-md border border-border p-md">
        <legend className="px-xs text-sm font-medium text-text-primary">Standard Allowances</legend>
        <div className="flex flex-col gap-sm">
          {allowances.map((allowance, index) => (
            <div key={allowance.id} className="flex flex-col gap-sm sm:flex-row sm:items-center">
              <input
                aria-label="Allowance label"
                className={fieldInput}
                placeholder="e.g. Travel Allowance"
                value={allowance.label}
                onChange={(e) => setAllowances((prev) => prev.map((a, i) => (i === index ? { ...a, label: e.target.value } : a)))}
              />
              <input
                aria-label="Allowance amount"
                type="number"
                step="0.01"
                className={fieldInput}
                placeholder="Amount"
                value={allowance.amount}
                onChange={(e) =>
                  setAllowances((prev) => prev.map((a, i) => (i === index ? { ...a, amount: Number(e.target.value) } : a)))
                }
              />
              <label className="flex items-center gap-xs whitespace-nowrap text-sm">
                <input
                  type="checkbox"
                  checked={allowance.taxable}
                  onChange={(e) => setAllowances((prev) => prev.map((a, i) => (i === index ? { ...a, taxable: e.target.checked } : a)))}
                />
                Taxable
              </label>
              <Button type="button" variant="ghost" onClick={() => setAllowances((prev) => prev.filter((_, i) => i !== index))}>
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            onClick={() => setAllowances((prev) => [...prev, { id: newId('allow'), label: '', amount: 0, taxable: true }])}
          >
            + Add Allowance
          </Button>
        </div>
      </fieldset>

      <fieldset className="rounded-md border border-border p-md">
        <legend className="px-xs text-sm font-medium text-text-primary">Standard Deductions</legend>
        <div className="flex flex-col gap-sm">
          {deductions.map((deduction, index) => (
            <div key={deduction.id} className="flex flex-col gap-sm sm:flex-row sm:items-center">
              <input
                aria-label="Deduction label"
                className={fieldInput}
                placeholder="e.g. Pension Fund"
                value={deduction.label}
                onChange={(e) => setDeductions((prev) => prev.map((d, i) => (i === index ? { ...d, label: e.target.value } : d)))}
              />
              <input
                aria-label="Deduction amount"
                type="number"
                step="0.01"
                className={fieldInput}
                placeholder="Amount"
                value={deduction.amount}
                onChange={(e) =>
                  setDeductions((prev) => prev.map((d, i) => (i === index ? { ...d, amount: Number(e.target.value) } : d)))
                }
              />
              <label className="flex items-center gap-xs whitespace-nowrap text-sm">
                <input
                  type="checkbox"
                  checked={deduction.preTax}
                  onChange={(e) => setDeductions((prev) => prev.map((d, i) => (i === index ? { ...d, preTax: e.target.checked } : d)))}
                />
                Pre-tax
              </label>
              <Button type="button" variant="ghost" onClick={() => setDeductions((prev) => prev.filter((_, i) => i !== index))}>
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            onClick={() => setDeductions((prev) => [...prev, { id: newId('ded'), label: '', amount: 0, preTax: false }])}
          >
            + Add Deduction
          </Button>
        </div>
      </fieldset>

      <div className="flex justify-end gap-sm pt-sm">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {employee ? 'Save Changes' : 'Add Employee'}
        </Button>
      </div>
    </form>
  );
}
