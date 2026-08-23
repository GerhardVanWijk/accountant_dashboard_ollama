import type { ID, ISODateString } from './common';

/**
 * Phase T fine-grained RBAC — mirrors `roles`/`permissions`/
 * `role_permissions`/`user_roles` (migration 0010). This is a UI
 * feature-gating layer (drives usePermission() and the Users & Roles admin
 * UI), added ON TOP OF the pre-existing `profiles.role` enum
 * (src/types/user.ts's ProfileRole) rather than replacing it — the ~45
 * already-shipped tables' RLS still only checks ProfileRole. Replaces the
 * old Phase-0 `Role`/`Permission` stub (a flat `permissions: string[]`
 * shape that never matched any real schema).
 */

/** A feature/action pair, e.g. { feature: 'invoicing', action: 'create' }. System-managed catalog, seeded via migration only. */
export interface Permission {
  id: ID;
  feature: string;
  action: string;
  description?: string;
  createdAt: ISODateString;
}

/** `companyId` undefined = a system role, shared by every tenant (seeded once, never editable via the client). Defined = a company's own custom role. */
export interface Role {
  id: ID;
  companyId?: ID;
  name: string;
  description?: string;
  isCustom: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface RolePermission {
  roleId: ID;
  permissionId: ID;
  granted: boolean;
}

/** A user's role assignment within one company. Composite key (userId, roleId, companyId) — a user can hold more than one role. */
export interface UserRoleAssignment {
  userId: ID;
  roleId: ID;
  companyId: ID;
  assignedAt: ISODateString;
  assignedBy?: ID;
}
