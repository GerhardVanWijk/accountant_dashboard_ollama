import type { ID, Role } from '@/types';

export type CreateRoleDTO = { name: string; description?: string; companyId: ID };

export interface IRoleRepository {
  getById(id: ID): Promise<Role | undefined>;
  /** company_id IS NULL rows — the 6 seeded system roles, shared by every tenant. */
  getSystemRoles(): Promise<Role[]>;
  /** System roles plus this company's own custom roles — what every role-picker UI actually wants. */
  getByCompany(companyId: ID): Promise<Role[]>;
  create(dto: CreateRoleDTO): Promise<Role>;
  update(id: ID, patch: Partial<Pick<Role, 'name' | 'description'>>): Promise<Role>;
  delete(id: ID): Promise<void>;
}
