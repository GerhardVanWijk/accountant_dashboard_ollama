import type { Employee } from '@/types';
import { seedEmployees } from '@/mock-data/employees';
import type { IEmployeeRepository } from './IEmployeeRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `emp_${Math.random().toString(36).slice(2, 10)}`;
}

/** In-memory implementation of IEmployeeRepository, mirroring MockFixedAssetRepository.ts. */
export class MockEmployeeRepository implements IEmployeeRepository {
  private employees: Employee[];

  constructor(initialData: Employee[] = seedEmployees) {
    this.employees = initialData.map((e) => ({ ...e }));
  }

  async getAll(): Promise<Employee[]> {
    return [...this.employees];
  }

  async getById(id: string): Promise<Employee | undefined> {
    return this.employees.find((e) => e.id === id);
  }

  async create(entity: Employee): Promise<Employee> {
    const record: Employee = { ...entity, id: entity.id || generateId(), createdAt: nowISO(), updatedAt: nowISO() };
    this.employees.push(record);
    return record;
  }

  async update(id: string, patch: Partial<Employee>): Promise<Employee> {
    const index = this.employees.findIndex((e) => e.id === id);
    if (index === -1) {
      throw new Error(`MockEmployeeRepository: employee "${id}" not found`);
    }
    const updated: Employee = { ...this.employees[index], ...patch, id: this.employees[index].id, updatedAt: nowISO() };
    this.employees[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.employees = this.employees.filter((e) => e.id !== id);
  }
}
