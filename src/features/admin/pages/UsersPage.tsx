import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import type { Permission, Profile, ProfileRole, Role, UserRoleAssignment } from '@/types';
import { profileService, roleService, userRoleService, permissionService } from '@/features/auth/services';

const PROFILE_ROLES: ProfileRole[] = ['admin', 'accountant', 'manager', 'operator', 'viewer'];

const inputClasses =
  'rounded-md border border-border bg-background px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

function AddExistingUser({ companyId, actorId, onAdded }: { companyId: string; actorId: string; onAdded: () => void }) {
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
      setFound(undefined);
      setEmail('');
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="text-base font-semibold text-text-primary">Add an existing user</h2>
      <p className="mt-xs text-sm text-text-secondary">
        This app has no email-invite delivery — a colleague must sign up themselves first (at /signup), then you add
        them here by their exact email.
      </p>
      <div className="mt-md flex flex-wrap items-center gap-sm">
        <input
          type="email"
          placeholder="colleague@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setFound(undefined);
          }}
          className={inputClasses}
        />
        <Button variant="secondary" onClick={search} disabled={busy || !email.trim()}>
          Look up
        </Button>
      </div>
      {found === null && <p className="mt-sm text-sm text-text-secondary">No unassigned signup with that email.</p>}
      {found && (
        <div className="mt-sm flex items-center gap-sm text-sm text-text-primary">
          <span>
            {[found.firstName, found.lastName].filter(Boolean).join(' ') || found.email} ({found.email})
          </span>
          <Button onClick={add} disabled={busy}>
            Add to company
          </Button>
        </div>
      )}
      {error && <p className="mt-sm text-sm text-danger">{error}</p>}
    </Card>
  );
}

function UsersList({ companyId, actorId }: { companyId: string; actorId: string }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    profileService
      .getByCompany(companyId)
      .then(setUsers)
      .finally(() => setLoading(false));
  }, [companyId]);

  useEffect(() => reload(), [reload]);

  const changeRole = async (userId: string, role: ProfileRole) => {
    setBusyId(userId);
    try {
      await profileService.changeRole(actorId, userId, role);
      reload();
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (user: Profile) => {
    setBusyId(user.id);
    try {
      await profileService.setActive(actorId, user.id, !user.isActive);
      reload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <h2 className="text-base font-semibold text-text-primary">Users</h2>
      {loading ? (
        <p className="mt-md text-sm text-text-secondary">Loading…</p>
      ) : (
        <div className="mt-md overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary">
                <th className="py-xs pr-md font-medium">Name</th>
                <th className="py-xs pr-md font-medium">Email</th>
                <th className="py-xs pr-md font-medium">Access level</th>
                <th className="py-xs pr-md font-medium">Status</th>
                <th className="py-xs pr-md font-medium" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border last:border-0">
                  <td className="py-sm pr-md text-text-primary">
                    {[user.firstName, user.lastName].filter(Boolean).join(' ') || '—'}
                    {user.id === actorId && <span className="ml-xs text-text-muted">(you)</span>}
                  </td>
                  <td className="py-sm pr-md text-text-secondary">{user.email ?? '—'}</td>
                  <td className="py-sm pr-md">
                    <select
                      className={inputClasses}
                      value={user.role}
                      disabled={busyId === user.id}
                      onChange={(e) => changeRole(user.id, e.target.value as ProfileRole)}
                    >
                      {PROFILE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-sm pr-md">
                    <span className={user.isActive ? 'text-positive' : 'text-danger'}>
                      {user.isActive ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td className="py-sm pr-md">
                    <Button variant="ghost" disabled={busyId === user.id} onClick={() => toggleActive(user)}>
                      {user.isActive ? 'Suspend' : 'Reactivate'}
                    </Button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-md text-center text-text-secondary">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function RolesAndPermissions({ companyId, actorId }: { companyId: string; actorId: string }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [assignments, setAssignments] = useState<UserRoleAssignment[]>([]);
  const [rolePermissions, setRolePermissions] = useState<Record<string, Permission[]>>({});
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([roleService.getByCompany(companyId), userRoleService.getByCompany(companyId)])
      .then(([r, a]) => {
        setRoles(r);
        setAssignments(a);
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  useEffect(() => reload(), [reload]);

  const expand = async (roleId: string) => {
    if (expandedRoleId === roleId) {
      setExpandedRoleId(null);
      return;
    }
    setExpandedRoleId(roleId);
    if (!rolePermissions[roleId]) {
      const permissions = await permissionService.getByRole(roleId);
      setRolePermissions((prev) => ({ ...prev, [roleId]: permissions }));
    }
  };

  const createRole = async () => {
    if (!newRoleName.trim()) return;
    await roleService.createCustomRole(actorId, companyId, newRoleName.trim(), undefined);
    setNewRoleName('');
    reload();
  };

  const assignedCount = (roleId: string) => assignments.filter((a) => a.roleId === roleId).length;

  return (
    <Card>
      <h2 className="text-base font-semibold text-text-primary">Roles</h2>
      <p className="mt-xs text-sm text-text-secondary">
        These drive which buttons/pages a user sees (usePermission()) — they do not change what the underlying
        database allows, which is still controlled by each user's Access level above.
      </p>

      {loading ? (
        <p className="mt-md text-sm text-text-secondary">Loading…</p>
      ) : (
        <ul className="mt-md flex flex-col gap-xs">
          {roles.map((role) => (
            <li key={role.id} className="rounded-md border border-border p-sm">
              <button
                type="button"
                onClick={() => expand(role.id)}
                className="flex w-full items-center justify-between text-left text-sm"
              >
                <span className="font-medium text-text-primary">
                  {role.name} {!role.isCustom && <span className="text-text-muted">(system)</span>}
                </span>
                <span className="text-text-secondary">{assignedCount(role.id)} user(s)</span>
              </button>
              {expandedRoleId === role.id && (
                <ul className="mt-sm flex flex-wrap gap-xs">
                  {(rolePermissions[role.id] ?? []).map((permission) => (
                    <li
                      key={permission.id}
                      className="rounded-full border border-border bg-background px-sm py-xs text-xs text-text-secondary"
                    >
                      {permission.feature}:{permission.action}
                    </li>
                  ))}
                  {rolePermissions[role.id]?.length === 0 && (
                    <li className="text-xs text-text-muted">No permissions granted.</li>
                  )}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-md flex items-center gap-sm border-t border-border pt-md">
        <input
          type="text"
          placeholder="New custom role name"
          value={newRoleName}
          onChange={(e) => setNewRoleName(e.target.value)}
          className={inputClasses}
        />
        <Button variant="secondary" onClick={createRole} disabled={!newRoleName.trim()}>
          Create custom role
        </Button>
      </div>
    </Card>
  );
}

/**
 * Company-admin User & Role Management (Phase T). Real content replacing
 * the old placeholder. Assumes the signed-in user has a company — RouteGuard
 * already redirects anyone without one to /onboarding before this can render.
 */
export function UsersPage() {
  const companyId = useAuthStore((s) => s.profile?.companyId);
  const actorId = useAuthStore((s) => s.profile?.id);
  const [usersVersion, setUsersVersion] = useState(0);

  if (!companyId || !actorId) return null;

  return (
    <div className="flex flex-col gap-lg">
      <h1 className="text-xl font-semibold text-text-primary">User & Role Management</h1>
      <AddExistingUser companyId={companyId} actorId={actorId} onAdded={() => setUsersVersion((v) => v + 1)} />
      <UsersList key={usersVersion} companyId={companyId} actorId={actorId} />
      <RolesAndPermissions companyId={companyId} actorId={actorId} />
    </div>
  );
}
