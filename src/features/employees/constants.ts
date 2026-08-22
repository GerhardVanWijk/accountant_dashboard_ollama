import type { EmployeeStatus, EmploymentType, PayFrequency, PayrollRunStatus } from '@/types';

export const PAYROLL_CURRENCY = 'ZAR';

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  permanent: 'Permanent',
  fixed_term: 'Fixed Term',
  part_time: 'Part Time',
  temporary: 'Temporary',
};

export const PAY_FREQUENCY_LABELS: Record<PayFrequency, string> = {
  monthly: 'Monthly',
  weekly: 'Weekly',
  biweekly: 'Biweekly',
};

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  terminated: 'Terminated',
};

export const PAYROLL_RUN_STATUS_LABELS: Record<PayrollRunStatus, string> = {
  draft: 'Draft',
  posted: 'Posted',
};
