import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PermissionRoute } from './PermissionRoute';
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

describe('PermissionRoute', () => {
  beforeEach(() => {
    usePermissionStore.getState().clear();
  });

  it('renders the protected content when the user holds the required fine-grained permission', () => {
    useAuthStore.setState({ profile: makeProfile() });
    usePermissionStore.getState().setPermissions('company_1', [makePermission()]);

    render(
      <MemoryRouter>
        <PermissionRoute feature="invoicing" action="read">
          <p>Invoices content</p>
        </PermissionRoute>
      </MemoryRouter>,
    );

    expect(screen.getByText('Invoices content')).toBeInTheDocument();
  });

  it('renders Access Denied instead of the protected content when the permission is missing', () => {
    useAuthStore.setState({ profile: makeProfile() });
    usePermissionStore.getState().setPermissions('company_1', []);

    render(
      <MemoryRouter>
        <PermissionRoute feature="invoicing" action="read">
          <p>Invoices content</p>
        </PermissionRoute>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Invoices content')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/access/i);
  });

  it('an admin always passes, even with zero fine-grained permission assignments', () => {
    useAuthStore.setState({ profile: makeProfile({ role: 'admin' }) });
    usePermissionStore.getState().setPermissions('company_1', []);

    render(
      <MemoryRouter>
        <PermissionRoute feature="invoicing" action="read">
          <p>Invoices content</p>
        </PermissionRoute>
      </MemoryRouter>,
    );

    expect(screen.getByText('Invoices content')).toBeInTheDocument();
  });

  it('a superuser always passes too, for the same reason as admin', () => {
    useAuthStore.setState({ profile: makeProfile({ role: 'superuser', companyId: undefined }) });
    usePermissionStore.getState().setPermissions('company_1', []);

    render(
      <MemoryRouter>
        <PermissionRoute feature="user_management" action="read">
          <p>Admin content</p>
        </PermissionRoute>
      </MemoryRouter>,
    );

    expect(screen.getByText('Admin content')).toBeInTheDocument();
  });

  it('an authenticated-but-unauthorized user sees Access Denied, not a login redirect (they ARE signed in)', () => {
    useAuthStore.setState({ profile: makeProfile({ role: 'operator' }) });
    usePermissionStore.getState().setPermissions('company_1', [makePermission({ feature: 'inventory' })]);

    render(
      <MemoryRouter>
        <PermissionRoute feature="invoicing" action="read">
          <p>Invoices content</p>
        </PermissionRoute>
      </MemoryRouter>,
    );

    expect(screen.getByText(/you don't have access/i)).toBeInTheDocument();
  });
});
