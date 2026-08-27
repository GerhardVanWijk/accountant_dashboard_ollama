import type { Employee } from '@/types';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import { EMPLOYMENT_TYPE_LABELS, PAY_FREQUENCY_LABELS } from '../constants';

export interface EmployeesTableProps {
  employees: Employee[];
  /** Omit either (gated by payroll:update / payroll:delete) to hide that row action. */
  onEdit?: (employee: Employee) => void;
  onDelete?: (employee: Employee) => void;
  onSelect?: (employee: Employee) => void;
}

/** Employee master directory, re-skinned onto v0's DataTable (M13) — real Employee fields only, no payroll math performed here. */
export function EmployeesTable({ employees, onEdit, onDelete, onSelect }: EmployeesTableProps) {
  const columns: DataTableColumn<Employee>[] = [
    {
      key: 'name',
      header: 'Employee',
      sortValue: (e) => `${e.firstName} ${e.lastName}`,
      cell: (e) => (
        <div className="flex flex-col">
          {onSelect ? (
            <RecordLink onClick={() => onSelect(e)} className="font-medium">
              {e.firstName} {e.lastName}
            </RecordLink>
          ) : (
            <span className="font-medium text-foreground">
              {e.firstName} {e.lastName}
            </span>
          )}
          <span className="figure text-xs text-muted-foreground tabular-nums">{e.employeeNumber}</span>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Employment type',
      hideBelowMd: true,
      sortValue: (e) => e.employmentType,
      cell: (e) => <span className="text-xs">{EMPLOYMENT_TYPE_LABELS[e.employmentType]}</span>,
    },
    {
      key: 'frequency',
      header: 'Pay frequency',
      hideBelowMd: true,
      sortValue: (e) => e.payFrequency,
      cell: (e) => <span className="text-xs text-muted-foreground">{PAY_FREQUENCY_LABELS[e.payFrequency]}</span>,
    },
    {
      key: 'salary',
      header: 'Basic salary',
      align: 'right',
      sortValue: (e) => e.basicSalary,
      cell: (e) => <Amount value={e.basicSalary} plain className="text-sm font-medium" />,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (e) => e.status,
      cell: (e) => <StatusBadge status={e.status} />,
    },
    {
      key: 'actions',
      header: '',
      cell: (e) =>
        onEdit || onDelete ? (
          <div className="flex justify-end gap-1">
            {onEdit && (
              <Button variant="ghost" size="sm" onClick={() => onEdit(e)}>
                Edit
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(e)}>
                Delete
              </Button>
            )}
          </div>
        ) : null,
    },
  ];

  return (
    <DataTable
      rows={employees}
      columns={columns}
      getRowKey={(e) => e.id}
      searchable={(e) => [e.employeeNumber, e.firstName, e.lastName, e.idNumber ?? '', e.taxNumber ?? ''].join(' ')}
      searchPlaceholder="Search by number or name"
      initialSortKey="name"
      filters={[
        {
          key: 'status',
          label: 'All statuses',
          options: [
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
            { value: 'terminated', label: 'Terminated' },
          ],
          match: (e, value) => e.status === value,
        },
      ]}
      emptyTitle="No employees yet"
      emptyDescription="Add an employee to start running payroll."
      onRowClick={onSelect}
      getRowAriaLabel={(e) => `Open employee ${e.firstName} ${e.lastName}`}
    />
  );
}
