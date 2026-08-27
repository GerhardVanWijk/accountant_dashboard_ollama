import type { Employee } from '@/types';
import { SectionCard } from '@/components/app/page-header';
import { Amount, FigureBlock } from '@/components/app/figure';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { EMPLOYMENT_TYPE_LABELS, PAY_FREQUENCY_LABELS } from '../constants';

export interface EmployeeDetailProps {
  employee: Employee;
}

/**
 * New — EmployeesTable never had a read-only detail view before this pass,
 * only the Edit form (gated by payroll:update). Deliberately does NOT show
 * idNumber / taxNumber / bankName / bankAccountNumber here: those are the
 * genuinely sensitive PII fields on Employee, and today they're only ever
 * shown inside the update-gated Edit form — a plain click-to-view sheet
 * open to anyone with payroll:read must not become a wider PII leak than
 * the table row already is. Everything shown below is operational payroll
 * data already visible in some form on the row/table.
 */
export function EmployeeDetail({ employee }: EmployeeDetailProps) {
  const totalAllowances = employee.standardAllowances.reduce((sum, a) => sum + a.amount, 0);
  const totalDeductions = employee.standardDeductions.reduce((sum, d) => sum + d.amount, 0);

  return (
    <>
      <SectionCard title={`${employee.firstName} ${employee.lastName}`} description={EMPLOYMENT_TYPE_LABELS[employee.employmentType]}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <FigureBlock label="Basic salary" value={formatCurrency(employee.basicSalary)} />
          <FigureBlock label="Pay frequency" value={PAY_FREQUENCY_LABELS[employee.payFrequency]} />
          <FigureBlock label="Started" value={formatDate(employee.startDate)} />
          {employee.terminationDate && <FigureBlock label="Terminated" value={formatDate(employee.terminationDate)} />}
        </div>
      </SectionCard>

      {(employee.standardAllowances.length > 0 || employee.standardDeductions.length > 0) && (
        <SectionCard title="Standard allowances & deductions">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {employee.standardAllowances.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Allowances</p>
                <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                  {employee.standardAllowances.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span>{a.label}</span>
                      <Amount value={a.amount} plain />
                    </li>
                  ))}
                  <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm font-medium">
                    <span>Total</span>
                    <Amount value={totalAllowances} plain />
                  </li>
                </ul>
              </div>
            )}
            {employee.standardDeductions.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Deductions</p>
                <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                  {employee.standardDeductions.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span>{d.label}</span>
                      <Amount value={-d.amount} plain />
                    </li>
                  ))}
                  <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm font-medium">
                    <span>Total</span>
                    <Amount value={-totalDeductions} plain />
                  </li>
                </ul>
              </div>
            )}
          </div>
        </SectionCard>
      )}
    </>
  );
}
