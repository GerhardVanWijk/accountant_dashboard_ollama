import type { ID, UserRoleAssignment } from '@/types';

export interface IUserRoleRepository {
  getByCompany(companyId: ID): Promise<UserRoleAssignment[]>;
  getByUser(userId: ID, companyId: ID): Promise<UserRoleAssignment[]>;
  assign(userId: ID, roleId: ID, companyId: ID, assignedBy: ID | undefined): Promise<UserRoleAssignment>;
  unassign(userId: ID, roleId: ID, companyId: ID): Promise<void>;
}
