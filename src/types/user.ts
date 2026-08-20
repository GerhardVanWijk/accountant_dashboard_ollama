import type { BaseEntity, ID, ISODateString } from './common';

export type UserStatus = 'active' | 'invited' | 'suspended';

export interface User extends BaseEntity {
  firstName: string;
  lastName: string;
  email: string;
  roleId: ID;
  status: UserStatus;
  avatarUrl?: string;
  lastLoginAt?: ISODateString;
}
