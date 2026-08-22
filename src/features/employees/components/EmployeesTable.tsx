import type { Employee, EmployeeStatus } from '@/types';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import { cn } from '@/utils/cn';
import { EMPLOYMENT_TYPE_LABELS, EMPLOYEE_STATUS_LABELS, PAY_FREQUENCY_LABELS } from '../constants';

const STATUS_STYLES: Record<EmployeeStatus, string> = {
  active: 'bg-positive/10 text-positive',
  inactive: 'bg-text-muted/10 text-text-secondary',
  terminated: 'bg-danger/10 text-danger',
};

export interface EmployeesTableProps {
  employees: Employee[];
  onEdit: (employee: Employee) => void;
  onDelete: (employee: Employee) => void;
}

export function EmployeesTable({ employees, onEdit, onDelete }: EmployeesTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[820px] border-collapse text-left text-sm">
        <thead className="bg-background">
          <tr>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Employee #</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Name</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Type</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Pay Frequency</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Basic Salary</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Status</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary" />
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <tr key={employee.id} className="border-t border-border hover:bg-background">
              <td className="whitespace-nowrap px-md py-sm font-mono text-text-primary">{employee.employeeNumber}</td>
              <td className="whitespace-nowrap px-md py-sm text-text-primary">
                {employee.firstName} {employee.lastName}
              </td>
              <td className="whitespace-nowrap px-md py-sm text-text-primary">{EMPLOYMENT_TYPE_LABELS[employee.employmentType]}</td>
              <td className="whitespace-nowrap px-md py-sm text-text-primary">{PAY_FREQUENCY_LABELS[employee.payFrequency]}</td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                <FinancialNumber value={employee.basicSalary} format={formatCurrency} showFlash={false} />
              </td>
              <td className="whitespace-nowrap px-md py-sm">
                <span className={cn('inline-flex items-center rounded-full px-sm py-0.5 text-xs font-medium', STATUS_STYLES[employee.status])}>
                  {EMPLOYEE_STATUS_LABELS[employee.status]}
                </span>
              </td>
              <td className="whitespace-nowrap px-md py-sm">
                <div className="flex justify-end gap-sm">
                  <button
                    type="button"
                    onClick={() => onEdit(employee)}
                    className="rounded-md px-sm py-xs text-xs font-medium text-primary hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(employee)}
                    className="rounded-md px-sm py-xs text-xs font-medium text-danger hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
