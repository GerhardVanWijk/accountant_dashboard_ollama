import { RecordDetailSheet } from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { StatusBadge } from '@/components/app/status-badge';
import type { Employee } from '@/types';
import { EmployeeDetail } from './EmployeeDetail';

export interface EmployeeDetailSheetProps {
  employee: Employee | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmployeeDetailSheet({ employee, open, onOpenChange }: EmployeeDetailSheetProps) {
  const state = employee ? 'ready' : 'not-found';

  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={employee?.employeeNumber ?? 'Employee'}
      titleAdornment={employee ? <StatusBadge status={employee.status} /> : undefined}
      state={state}
      notFoundMessage="This employee could not be found — they may have been deleted."
      className="sm:max-w-xl"
    >
      {employee && (
        <div className="flex flex-col gap-6">
          <EmployeeDetail employee={employee} />
          <RecordAuditHistorySection recordType="Employee" recordId={employee.id} />
        </div>
      )}
    </RecordDetailSheet>
  );
}
