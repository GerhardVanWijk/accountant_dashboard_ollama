import { useCallback, useEffect, useState } from 'react';
import type { Employee } from '@/types';
import { employeeService, type CreateEmployeeDTO, type UpdateEmployeeDTO } from '../services';

export interface UseEmployeesResult {
  employees: Employee[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createEmployee: (data: CreateEmployeeDTO) => Promise<Employee>;
  updateEmployee: (id: string, patch: UpdateEmployeeDTO) => Promise<Employee>;
  deleteEmployee: (id: string) => Promise<void>;
}

/** Component -> Hook -> Service -> Repository chain for Employee master data (docs/ARCHITECTURE.md). */
export function useEmployees(): UseEmployeesResult {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEmployees(await employeeService.getEmployees());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load employees'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createEmployee = useCallback(
    async (data: CreateEmployeeDTO) => {
      const created = await employeeService.createEmployee(data);
      await refetch();
      return created;
    },
    [refetch],
  );

  const updateEmployee = useCallback(
    async (id: string, patch: UpdateEmployeeDTO) => {
      const updated = await employeeService.updateEmployee(id, patch);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const deleteEmployee = useCallback(
    async (id: string) => {
      await employeeService.deleteEmployee(id);
      await refetch();
    },
    [refetch],
  );

  return { employees, loading, error, refetch, createEmployee, updateEmployee, deleteEmployee };
}
