import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import type { Employee } from '@/types';
import { PageHeader } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/shadcn/dialog';
import { useEmployees } from '../hooks/useEmployees';
import { EmployeeForm } from '../components/EmployeeForm';
import { EmployeesTable } from '../components/EmployeesTable';
import { EmployeeDetailSheet } from '../components/EmployeeDetailSheet';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import type { CreateEmployeeDTO, UpdateEmployeeDTO } from '../services';

type DialogState = { mode: 'create' } | { mode: 'edit'; employee: Employee } | null;

/**
 * Employee Directory — route `/payroll/employees`. Real
 * useEmployees()/employeeService data throughout. Re-skinned onto v0's
 * PageHeader/SectionCard/DataTable/Dialog (M13) — the last of the
 * pre-v0-kit Payroll pages; validation, DTO shapes and mutation wiring
 * unchanged.
 */
export function EmployeesPage() {
  const { employees, loading, error, refetch, createEmployee, updateEmployee, deleteEmployee } = useEmployees();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const canCreate = useCanAccess('payroll', 'create');
  const canUpdate = useCanAccess('payroll', 'update');
  const canDelete = useCanAccess('payroll', 'delete');

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedEmployeeId = searchParams.get('record') ?? undefined;
  const detailOpen = Boolean(selectedEmployeeId);
  function openRecord(id: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('record', id);
      return next;
    });
  }
  function closeRecord() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('record');
      return next;
    });
  }
  const detailEmployee = employees.find((e) => e.id === selectedEmployeeId);

  const handleFormSubmit = async (data: CreateEmployeeDTO | UpdateEmployeeDTO) => {
    setActionError(null);
    try {
      if (dialog?.mode === 'edit') {
        await updateEmployee(dialog.employee.id, data as UpdateEmployeeDTO);
      } else {
        await createEmployee(data as CreateEmployeeDTO);
      }
      setDialog(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save the employee.');
    }
  };

  const handleDelete = async (employee: Employee) => {
    if (!window.confirm(`Delete "${employee.employeeNumber} - ${employee.firstName} ${employee.lastName}"? This cannot be undone.`)) return;
    setActionError(null);
    try {
      await deleteEmployee(employee.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete the employee.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Employee directory"
        description="Employee master data feeding payroll runs."
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setDialog({ mode: 'create' })}>
              <Plus data-icon="inline-start" />
              New employee
            </Button>
          ) : undefined
        }
      />

      {actionError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      )}

      {loading && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading employees…</p>
        </div>
      )}
      {!loading && error && (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error.message}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && (
        <EmployeesTable
          employees={employees}
          onEdit={canUpdate ? (employee) => setDialog({ mode: 'edit', employee }) : undefined}
          onDelete={canDelete ? (employee) => void handleDelete(employee) : undefined}
          onSelect={(employee) => openRecord(employee.id)}
        />
      )}

      <EmployeeDetailSheet
        employee={detailEmployee}
        open={detailOpen}
        onOpenChange={(next) => {
          if (!next) closeRecord();
        }}
      />

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === 'edit' ? 'Edit Employee' : 'New Employee'}</DialogTitle>
          </DialogHeader>
          {dialog && <EmployeeForm employee={dialog.mode === 'edit' ? dialog.employee : undefined} onSubmit={handleFormSubmit} onCancel={() => setDialog(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
