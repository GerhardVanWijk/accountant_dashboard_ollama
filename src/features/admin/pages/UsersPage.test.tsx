import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { UsersPage } from './UsersPage';
import { profileService, roleService, userRoleService, permissionService } from '@/features/auth/services';
import { useAuthStore } from '@/stores/authStore';
import { usePermissionStore } from '@/features/auth/stores/permissionStore';
import type { Permission, Profile, Role } from '@/types';

vi.mock('@/features/auth/services', () => ({
  profileService: {
    getByCompany: vi.fn(),
    changeRole: vi.fn(),
    setActive: vi.fn(),
    findUnassignedByEmail: vi.fn(),
    addExistingUserToCompany: vi.fn(),
  },
  roleService: {
    getByCompany: vi.fn(),
    createCustomRole: vi.fn(),
    deleteCustomRole: vi.fn(),
  },
  userRoleService: {
    getByCompany: vi.fn(),
    assign: vi.fn(),
    unassign: vi.fn(),
  },
  permissionService: {
    getAll: vi.fn(),
    getByRole: vi.fn(),
    setGranted: vi.fn(),
  },
}));

const mockedGetUsers = vi.mocked(profileService.getByCompany);
const mockedGetRoles = vi.mocked(roleService.getByCompany);
const mockedGetAssignments = vi.mocked(userRoleService.getByCompany);
const mockedAssign = vi.mocked(userRoleService.assign);
const mockedUnassign = vi.mocked(userRoleService.unassign);
const mockedGetAllPermissions = vi.mocked(permissionService.getAll);
const mockedGetByRole = vi.mocked(permissionService.getByRole);
const mockedSetGranted = vi.mocked(permissionService.setGranted);
const mockedDeleteRole = vi.mocked(roleService.deleteCustomRole);

function makeUser(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user_1',
    firstName: 'Thandi',
    lastName: 'Mokoena',
    email: 'thandi@example.co.za',
    role: 'admin',
    companyId: 'company_1',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeRole(overrides: Partial<Role> = {}): Role {
  return { id: 'role_1', companyId: 'company_1', name: 'Bookkeeper', isCustom: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...overrides };
}

function makePermission(overrides: Partial<Permission> = {}): Permission {
  return { id: 'perm_1', feature: 'invoicing', action: 'create', createdAt: '2026-01-01T00:00:00.000Z', ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ profile: makeUser() });
  usePermissionStore.getState().clear();
  mockedGetUsers.mockResolvedValue([makeUser()]);
  mockedGetRoles.mockResolvedValue([makeRole()]);
  mockedGetAssignments.mockResolvedValue([]);
  mockedGetAllPermissions.mockResolvedValue([makePermission()]);
  mockedGetByRole.mockResolvedValue([]);
});

describe('UsersPage', () => {
  it('assigns a real fine-grained role to a user via userRoleService.assign()', async () => {
    mockedAssign.mockResolvedValue({ userId: 'user_1', roleId: 'role_1', companyId: 'company_1', assignedAt: '2026-08-01T00:00:00.000Z' });
    render(<UsersPage />);

    await screen.findByText('Bookkeeper');
    (await screen.findByRole('button', { name: /assign role/i })).click();

    const dialog = await screen.findByRole('dialog', { name: /assign a role/i });
    fireEvent.change(within(dialog).getByLabelText(/role/i), { target: { value: 'role_1' } });
    within(dialog).getByRole('button', { name: /^assign$/i }).click();

    await waitFor(() => expect(mockedAssign).toHaveBeenCalledWith('user_1', 'user_1', 'role_1', 'company_1'));
  });

  it('unassigns a role via userRoleService.unassign()', async () => {
    mockedGetAssignments.mockResolvedValue([{ userId: 'user_1', roleId: 'role_1', companyId: 'company_1', assignedAt: '2026-08-01T00:00:00.000Z' }]);
    mockedUnassign.mockResolvedValue(undefined);
    render(<UsersPage />);

    const unassignButton = await screen.findByRole('button', { name: /unassign bookkeeper/i });
    unassignButton.click();

    await waitFor(() => expect(mockedUnassign).toHaveBeenCalledWith('user_1', 'user_1', 'role_1', 'company_1'));
  });

  it('toggles a permission grant on a custom role via permissionService.setGranted()', async () => {
    mockedSetGranted.mockResolvedValue(undefined);
    render(<UsersPage />);

    (await screen.findByRole('button', { name: /bookkeeper/i })).click();
    const checkbox = await screen.findByRole('checkbox', { name: /invoicing:create/i });
    checkbox.click();

    await waitFor(() => expect(mockedSetGranted).toHaveBeenCalledWith('role_1', 'perm_1', true));
  });

  it('deletes a custom role via roleService.deleteCustomRole()', async () => {
    mockedDeleteRole.mockResolvedValue(undefined);
    render(<UsersPage />);

    (await screen.findByRole('button', { name: /^delete$/i })).click();
    const alert = await screen.findByRole('alertdialog');
    within(alert).getByRole('button', { name: /delete role/i }).click();

    await waitFor(() => expect(mockedDeleteRole).toHaveBeenCalledWith('user_1', 'role_1'));
  });

  it('does not offer to delete or edit a system role', async () => {
    mockedGetRoles.mockResolvedValue([makeRole({ id: 'role_sys', name: 'Admin', isCustom: false })]);
    render(<UsersPage />);

    await screen.findByText('(system)');
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
  });

  it('self-lockout guard: disables the signed-in admin\'s own access-level selector and Suspend button', async () => {
    render(<UsersPage />);

    const roleSelect = await screen.findByDisplayValue('admin');
    expect(roleSelect).toBeDisabled();
    expect(screen.getByRole('button', { name: /suspend/i })).toBeDisabled();
  });

  it('allows changing another user\'s access level (not self-locked)', async () => {
    mockedGetUsers.mockResolvedValue([makeUser(), makeUser({ id: 'user_2', firstName: 'Naledi', role: 'viewer' })]);
    render(<UsersPage />);

    const otherUserSelect = await screen.findByDisplayValue('viewer');
    expect(otherUserSelect).not.toBeDisabled();
  });

  it('hides all admin actions for a user without user_management:update (non-admin, no fine-grained grant)', async () => {
    useAuthStore.setState({ profile: makeUser({ role: 'operator' }) });
    usePermissionStore.getState().setPermissions('company_1', []);
    render(<UsersPage />);

    await screen.findByText('Thandi Mokoena');
    expect(screen.queryByRole('button', { name: /add user/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /suspend|reactivate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /assign role/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create custom role/i })).not.toBeInTheDocument();
  });
});
