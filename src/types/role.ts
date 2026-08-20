import type { BaseEntity } from './common';

/** A named permission grant, e.g. "customers:write", "reports:read". */
export type Permission = string;

export interface Role extends BaseEntity {
  name: string;
  description?: string;
  permissions: Permission[];
}
