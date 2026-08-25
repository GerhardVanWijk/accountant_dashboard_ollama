import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useVisibleNavGroups } from './useVisibleNavGroups';
import { useAuthStore } from '@/stores/authStore';
import { usePermissionStore } from '../stores/permissionStore';
import type { Permission, Profile } from '@/types';

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user_1',
    role: 'viewer',
    companyId: 'company_1',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePermission(overrides: Partial<Permission> = {}): Permission {
  return { id: 'perm_1', feature: 'invoicing', action: 'read', createdAt: '2026-01-01T00:00:00.000Z', ...overrides };
}

describe('useVisibleNavGroups', () => {
  beforeEach(() => {
    usePermissionStore.getState().clear();
  });

  it('hides a nav item mapped to a permission the user lacks', () => {
    useAuthStore.setState({ profile: makeProfile() });
    usePermissionStore.getState().setPermissions('company_1', []);

    const { result } = renderHook(() => useVisibleNavGroups());
    const allItems = result.current.flatMap((g) => g.items);
    expect(allItems.some((item) => item.href === '/sales/invoices')).toBe(false);
  });

  it('shows a nav item once the user holds the matching permission', () => {
    useAuthStore.setState({ profile: makeProfile() });
    usePermissionStore.getState().setPermissions('company_1', [makePermission({ feature: 'invoicing', action: 'read' })]);

    const { result } = renderHook(() => useVisibleNavGroups());
    const allItems = result.current.flatMap((g) => g.items);
    expect(allItems.some((item) => item.href === '/sales/invoices')).toBe(true);
  });

  it('never hides an item with no permission mapping (e.g. Companies)', () => {
    useAuthStore.setState({ profile: makeProfile() });
    usePermissionStore.getState().setPermissions('company_1', []);

    const { result } = renderHook(() => useVisibleNavGroups());
    const allItems = result.current.flatMap((g) => g.items);
    expect(allItems.some((item) => item.href === '/companies')).toBe(true);
  });

  it('shows every permission-mapped item for an admin, regardless of assignments', () => {
    useAuthStore.setState({ profile: makeProfile({ role: 'admin' }) });
    usePermissionStore.getState().setPermissions('company_1', []);

    const { result } = renderHook(() => useVisibleNavGroups());
    const allItems = result.current.flatMap((g) => g.items);
    expect(allItems.some((item) => item.href === '/sales/invoices')).toBe(true);
    expect(allItems.some((item) => item.href === '/admin/users')).toBe(true);
  });
});
