import { supabase } from '@/config/supabase';
import { auditLogService } from '@/services/auditLogService';
import { SupabaseProfileRepository } from '@/repositories/auth/SupabaseProfileRepository';
import { SupabaseRoleRepository } from '@/repositories/auth/SupabaseRoleRepository';
import { SupabasePermissionRepository } from '@/repositories/auth/SupabasePermissionRepository';
import { SupabaseUserRoleRepository } from '@/repositories/auth/SupabaseUserRoleRepository';
import { SupabaseAuditLogAccessRepository } from '@/repositories/auth/SupabaseAuditLogAccessRepository';
import { ProfileService } from './profileService';
import { RoleService } from './roleService';
import { PermissionService } from './permissionService';
import { UserRoleService } from './userRoleService';
import { AuditLogAccessService } from './auditLogAccessService';

export { ProfileService } from './profileService';
export { RoleService } from './roleService';
export { PermissionService } from './permissionService';
export { UserRoleService } from './userRoleService';
export { AuditLogAccessService } from './auditLogAccessService';

export const profileService = new ProfileService(new SupabaseProfileRepository(supabase), auditLogService);
export const roleService = new RoleService(new SupabaseRoleRepository(supabase), auditLogService);
export const permissionService = new PermissionService(new SupabasePermissionRepository(supabase));
export const userRoleService = new UserRoleService(new SupabaseUserRoleRepository(supabase), auditLogService);
export const auditLogAccessService = new AuditLogAccessService(new SupabaseAuditLogAccessRepository(supabase));
