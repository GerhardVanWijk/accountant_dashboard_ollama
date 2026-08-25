import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, UserPlus } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { StatusBadge } from '@/components/app/status-badge';
import { Avatar, AvatarFallback } from '@/components/ui/shadcn/avatar';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Checkbox } from '@/components/ui/shadcn/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/shadcn/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/shadcn/alert-dialog';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { useAuthStore } from '@/stores/authStore';
import type { Permission, Profile, ProfileRole, Role, UserRoleAssignment } from '@/types';
import { profileService, roleService, userRoleService, permissionService } from '@/features/auth/services';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';

const PROFILE_ROLES: ProfileRole[] = ['admin', 'accountant', 'manager', 'operator', 'viewer'];
const selectClassName = 'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

function initialsFor(user: Profile): string {
  const initials = [user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join('');
  return initials || (user.email?.[0]?.toUpperCase() ?? '?');
}

/**
 * "Add an existing user" — this app's real substitute for an email
 * invitation flow: it has no invite-delivery mechanism, so a colleague
 * signs up themselves first (at /signup), and a company admin adds them
 * here by their exact email (profileService.findUnassignedByEmail /
 * addExistingUserToCompany — both real, both audited). Re-skinned onto
 * v0's Dialog (M10); the honest copy about no email delivery is preserved
 * rather than replaced with v0's own "This is a UI demonstration — no
 * invitation is sent" fake-invite dialog, since this app's version
 * actually works.
 */
function AddExistingUserDialog({ companyId, actorId, canCreate, onAdded }: { companyId: string; actorId: string; canCreate: boolean; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [found, setFound] = useState<Profile | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    setError(null);
    setBusy(true);
    try {
      const profile = await profileService.findUnassignedByEmail(email.trim());
      setFound(profile ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!found) return;
    setBusy(true);
    setError(null);
    try {
      await profileService.addExistingUserToCompany(actorId, found.id, companyId);
      setOpen(false);
      setFound(undefined);
      setEmail('');
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!canCreate) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setEmail('');
          setFound(undefined);
          setError(null);
        }
      }}
    >
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus data-icon="inline-start" />
        Add user
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add an existing user</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            This app has no email-invite delivery — a colleague must sign up themselves first (at /signup), then you add them here by their exact email.
          </p>
          <Field>
            <FieldLabel htmlFor="add-user-email">Email address</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="add-user-email"
                type="email"
                placeholder="colleague@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFound(undefined);
                }}
              />
              <Button type="button" variant="outline" onClick={() => void search()} disabled={busy || !email.trim()}>
                Look up
              </Button>
            </div>
          </Field>
          {found === null && <p className="text-sm text-muted-foreground">No unassigned signup with that email.</p>}
          {found && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
              <span>
                {[found.firstName, found.lastName].filter(Boolean).join(' ') || found.email} ({found.email})
              </span>
              <Button size="sm" onClick={() => void add()} disabled={busy}>
                Add to company
              </Button>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Assigns one of the company's fine-grained Roles (src/types/role.ts) to a user — userRoleService.assign(), real and previously unwired to any UI (M10). Gated by user_management:update (M11) — role assignment is an access-control change, the same category of action that permission key already covers. */
function AssignRoleDialog({ companyId, actorId, userId, roles, alreadyAssignedRoleIds, canAssign, onAssigned }: { companyId: string; actorId: string; userId: string; roles: Role[]; alreadyAssignedRoleIds: string[]; canAssign: boolean; onAssigned: () => void }) {
  const [open, setOpen] = useState(false);
  const [roleId, setRoleId] = useState('');
  const [busy, setBusy] = useState(false);
  const assignable = roles.filter((r) => !alreadyAssignedRoleIds.includes(r.id));

  if (!canAssign) return null;

  const assign = async () => {
    if (!roleId) return;
    setBusy(true);
    try {
      await userRoleService.assign(actorId, userId, roleId, companyId);
      setOpen(false);
      setRoleId('');
      onAssigned();
    } finally {
      setBusy(false);
    }
  };

  if (assignable.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        Assign role
      </Button>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign a role</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="assign-role-select">Role</FieldLabel>
            <select id="assign-role-select" className={selectClassName + ' w-full'} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              <option value="">Select a role…</option>
              {assignable.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy || !roleId} onClick={() => void assign()}>
              Assign
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface UsersTableProps {
  companyId: string;
  actorId: string;
  users: Profile[];
  roles: Role[];
  assignments: UserRoleAssignment[];
  busyId: string | null;
  canUpdate: boolean;
  onChangeRole: (userId: string, role: ProfileRole) => void;
  onToggleActive: (user: Profile) => void;
  onAssignmentsChanged: () => void;
}

function UsersTable({ companyId, actorId, users, roles, assignments, busyId, canUpdate, onChangeRole, onToggleActive, onAssignmentsChanged }: UsersTableProps) {
  const rolesById = new Map(roles.map((r) => [r.id, r]));

  const unassign = async (userId: string, roleId: string) => {
    await userRoleService.unassign(actorId, userId, roleId, companyId);
    onAssignmentsChanged();
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[820px] border-collapse text-left text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">User</th>
            <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Access level</th>
            <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Roles</th>
            <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Status</th>
            <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground" />
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const userAssignments = assignments.filter((a) => a.userId === user.id);
            return (
              <tr key={user.id} className="border-t border-border">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initialsFor(user)}</AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium text-foreground">
                        {[user.firstName, user.lastName].filter(Boolean).join(' ') || '—'}
                        {user.id === actorId && <span className="ml-1.5 text-muted-foreground">(you)</span>}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{user.email ?? '—'}</span>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  {canUpdate ? (
                    <select
                      className={selectClassName}
                      value={user.role}
                      disabled={busyId === user.id || user.id === actorId}
                      title={user.id === actorId ? "You can't change your own access level — ask another admin to do it, to avoid locking yourself out." : undefined}
                      onChange={(e) => onChangeRole(user.id, e.target.value as ProfileRole)}
                    >
                      {PROFILE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="capitalize">{user.role}</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {userAssignments.map((a) => {
                      const role = rolesById.get(a.roleId);
                      return (
                        <Badge key={a.roleId} variant="outline" className="gap-1">
                          {role?.name ?? a.roleId}
                          {canUpdate && (
                            <button type="button" aria-label={`Unassign ${role?.name ?? a.roleId}`} className="text-muted-foreground hover:text-destructive" onClick={() => void unassign(a.userId, a.roleId)}>
                              ×
                            </button>
                          )}
                        </Badge>
                      );
                    })}
                    <AssignRoleDialog companyId={companyId} actorId={actorId} userId={user.id} roles={roles} alreadyAssignedRoleIds={userAssignments.map((a) => a.roleId)} canAssign={canUpdate} onAssigned={onAssignmentsChanged} />
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  <StatusBadge status={user.isActive ? 'active' : 'suspended'} />
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right">
                  {canUpdate && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyId === user.id || user.id === actorId}
                      title={user.id === actorId ? "You can't suspend your own account." : undefined}
                      onClick={() => onToggleActive(user)}
                    >
                      {user.isActive ? 'Suspend' : 'Reactivate'}
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
          {users.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                No users yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Roles + Permissions administration: browses the real Role/Permission
 * catalog (system roles are seeded, read-only; custom roles are
 * company-owned and editable), toggles individual permission grants on a
 * custom role (permissionService.setGranted() — real, previously unwired),
 * creates a custom role, and deletes one (roleService.deleteCustomRole() —
 * real, previously unwired). System roles can't be edited or deleted here:
 * they're shared across every tenant and seeded only via migration.
 */
function RolesPanel({ companyId, actorId, roles, assignments, canCreate, canUpdate, onRolesChanged }: { companyId: string; actorId: string; roles: Role[]; assignments: UserRoleAssignment[]; canCreate: boolean; canUpdate: boolean; onRolesChanged: () => void }) {
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  /** roleId -> currently-granted permission ids for that role (permissionService.getByRole only ever returns the granted subset — see SupabasePermissionRepository.getByRole). */
  const [grantedByRole, setGrantedByRole] = useState<Record<string, Set<string>>>({});
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDialogOpen, setNewRoleDialogOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    permissionService.getAll().then(setAllPermissions);
  }, []);

  const loadGranted = useCallback(async (roleId: string) => {
    const granted = await permissionService.getByRole(roleId);
    setGrantedByRole((prev) => ({ ...prev, [roleId]: new Set(granted.map((p) => p.id)) }));
  }, []);

  const expand = async (roleId: string) => {
    if (expandedRoleId === roleId) {
      setExpandedRoleId(null);
      return;
    }
    setExpandedRoleId(roleId);
    if (!grantedByRole[roleId]) await loadGranted(roleId);
  };

  const togglePermission = async (roleId: string, permissionId: string, granted: boolean) => {
    setTogglingId(permissionId);
    try {
      await permissionService.setGranted(roleId, permissionId, granted);
      await loadGranted(roleId);
    } finally {
      setTogglingId(null);
    }
  };

  const createRole = async () => {
    if (!newRoleName.trim()) return;
    await roleService.createCustomRole(actorId, companyId, newRoleName.trim(), undefined);
    setNewRoleName('');
    setNewRoleDialogOpen(false);
    onRolesChanged();
  };

  const deleteRole = async () => {
    if (!roleToDelete) return;
    await roleService.deleteCustomRole(actorId, roleToDelete.id);
    setRoleToDelete(null);
    onRolesChanged();
  };

  const assignedCount = (roleId: string) => assignments.filter((a) => a.roleId === roleId).length;

  return (
    <SectionCard
      title="Roles & permissions"
      description="These drive which buttons/pages a user sees (usePermission()) — they do not change what the underlying database allows, which is still controlled by each user's access level above."
      actions={
        canCreate ? (
          <Dialog open={newRoleDialogOpen} onOpenChange={setNewRoleDialogOpen}>
            <Button size="sm" variant="outline" onClick={() => setNewRoleDialogOpen(true)}>
              <Plus data-icon="inline-start" />
              Create custom role
            </Button>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Create a custom role</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <Field>
                  <FieldLabel htmlFor="new-role-name">Role name</FieldLabel>
                  <Input id="new-role-name" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="e.g. Bookkeeper" />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setNewRoleDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="button" disabled={!newRoleName.trim()} onClick={() => void createRole()}>
                    Create
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        ) : undefined
      }
    >
      <ul className="flex flex-col gap-2">
        {roles.map((role) => (
          <li key={role.id} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => void expand(role.id)} className="flex flex-1 items-center justify-between gap-2 text-left text-sm">
                <span className="font-medium text-foreground">
                  {role.name} {!role.isCustom && <span className="text-muted-foreground">(system)</span>}
                </span>
                <span className="text-muted-foreground">{assignedCount(role.id)} user(s)</span>
              </button>
              {role.isCustom && canUpdate && (
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setRoleToDelete(role)}>
                  Delete
                </Button>
              )}
            </div>
            {expandedRoleId === role.id && (
              <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
                {role.isCustom ? (
                  allPermissions.map((permission) => {
                    const granted = grantedByRole[role.id]?.has(permission.id) ?? false;
                    return (
                      <label key={permission.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox checked={granted} disabled={!canUpdate || togglingId === permission.id} onCheckedChange={(value) => void togglePermission(role.id, permission.id, value === true)} />
                        {permission.feature}:{permission.action}
                      </label>
                    );
                  })
                ) : (
                  <>
                    {allPermissions
                      .filter((p) => grantedByRole[role.id]?.has(p.id))
                      .map((permission) => (
                        <span key={permission.id} className="text-xs text-muted-foreground">
                          {permission.feature}:{permission.action}
                        </span>
                      ))}
                    {(grantedByRole[role.id]?.size ?? 0) === 0 && <p className="text-xs text-muted-foreground">No permissions granted.</p>}
                    <p className="mt-1 text-xs text-muted-foreground/70">System roles are shared across every company and can't be edited here.</p>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      <AlertDialog open={roleToDelete !== null} onOpenChange={(open) => !open && setRoleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{roleToDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>Users holding this role will lose the permissions it granted. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void deleteRole()}>Delete role</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}

/**
 * Company-admin User & Role Management — route `/admin/users`. Assumes the
 * signed-in user has a company (RouteGuard already redirects anyone without
 * one to /onboarding). Re-skinned onto v0's PageHeader/SectionCard/DataTable
 * language (M10); every action still goes through the same real, audited
 * services as before — role assignment, permission grants and custom-role
 * deletion are newly wired to their existing-but-previously-unused service
 * methods, not new capabilities invented for this pass.
 */
export function UsersPage() {
  const companyId = useAuthStore((s) => s.profile?.companyId);
  const actorId = useAuthStore((s) => s.profile?.id);

  const [users, setUsers] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [assignments, setAssignments] = useState<UserRoleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const canCreate = useCanAccess('user_management', 'create');
  const canUpdate = useCanAccess('user_management', 'update');

  const reload = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [userList, roleList, assignmentList] = await Promise.all([profileService.getByCompany(companyId), roleService.getByCompany(companyId), userRoleService.getByCompany(companyId)]);
      setUsers(userList);
      setRoles(roleList);
      setAssignments(assignmentList);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!companyId || !actorId) return null;

  const changeRole = async (userId: string, role: ProfileRole) => {
    setBusyId(userId);
    try {
      await profileService.changeRole(actorId, userId, role);
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (user: Profile) => {
    setBusyId(user.id);
    try {
      await profileService.setActive(actorId, user.id, !user.isActive);
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  const activeCount = users.filter((u) => u.isActive).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="User & role management" description="Everyone with access to this workspace, their access level and role assignments." actions={<AddExistingUserDialog companyId={companyId} actorId={actorId} canCreate={canCreate} onAdded={() => void reload()} />} />

      {loading && (
        <div role="status" className="flex min-h-[30vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading users…</p>
        </div>
      )}

      {!loading && (
        <>
          <SectionCard>
            <div className="grid gap-6 sm:grid-cols-3">
              <FigureBlock label="Total users" value={String(users.length)} />
              <FigureBlock label="Active" value={String(activeCount)} tone="positive" />
              <FigureBlock label="Custom roles" value={String(roles.filter((r) => r.isCustom).length)} />
            </div>
          </SectionCard>

          <SectionCard title="Users">
            <UsersTable
              companyId={companyId}
              actorId={actorId}
              users={users}
              roles={roles}
              assignments={assignments}
              busyId={busyId}
              canUpdate={canUpdate}
              onChangeRole={(id, role) => void changeRole(id, role)}
              onToggleActive={(u) => void toggleActive(u)}
              onAssignmentsChanged={() => void reload()}
            />
          </SectionCard>

          <RolesPanel companyId={companyId} actorId={actorId} roles={roles} assignments={assignments} canCreate={canCreate} canUpdate={canUpdate} onRolesChanged={() => void reload()} />
        </>
      )}
    </div>
  );
}
