import { useState } from 'react';
import type { Employee } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useEmployees } from '../hooks/useEmployees';
import { EmployeeForm } from '../components/EmployeeForm';
import { EmployeesTable } from '../components/EmployeesTable';
import { Modal } from '../components/Modal';
import type { CreateEmployeeDTO, UpdateEmployeeDTO } from '../services';

type DialogState = { mode: 'create' } | { mode: 'edit'; employee: Employee } | null;

/** Employee Directory — route `/payroll/employees` (docs/ROUTES.md). */
export function EmployeesPage() {
  const { employees, loading, error, refetch, createEmployee, updateEmployee, deleteEmployee } = useEmployees();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Employee Directory</h1>
          <p className="mt-xs text-sm text-text-secondary">Employee master data feeding payroll runs. /payroll/employees</p>
        </div>
        <Button onClick={() => setDialog({ mode: 'create' })}>New Employee</Button>
      </div>

      {actionError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-md py-sm text-sm text-danger">
          {actionError}
        </p>
      )}

      {loading && <Spinner label="Loading employees…" />}
      {!loading && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!loading && !error && (
        <Card>
          {employees.length === 0 ? (
            <EmptyState
              title="No employees yet"
              message="Add an employee to start running payroll."
              action={<Button onClick={() => setDialog({ mode: 'create' })}>New Employee</Button>}
            />
          ) : (
            <EmployeesTable employees={employees} onEdit={(employee) => setDialog({ mode: 'edit', employee })} onDelete={handleDelete} />
          )}
        </Card>
      )}

      {(dialog?.mode === 'create' || dialog?.mode === 'edit') && (
        <Modal title={dialog.mode === 'edit' ? 'Edit Employee' : 'New Employee'} onClose={() => setDialog(null)} wide>
          <EmployeeForm employee={dialog.mode === 'edit' ? dialog.employee : undefined} onSubmit={handleFormSubmit} onCancel={() => setDialog(null)} />
        </Modal>
      )}
    </div>
  );
}
