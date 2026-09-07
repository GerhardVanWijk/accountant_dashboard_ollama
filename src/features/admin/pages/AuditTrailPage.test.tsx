import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AuditLogEntry, Profile } from '@/types';

vi.mock('@/services/auditLogService', () => ({
  auditLogService: { getPage: vi.fn(), getKpis: vi.fn() },
}));
vi.mock('@/features/auth/services', () => ({
  profileService: { getByCompany: vi.fn() },
  auditLogAccessService: { logSensitiveView: vi.fn(), logDenied: vi.fn(), logEvent: vi.fn() },
}));

import { AuditTrailPage } from './AuditTrailPage';
import { auditLogService } from '@/services/auditLogService';
import { profileService, auditLogAccessService } from '@/features/auth/services';
import { useAuthStore } from '@/stores/authStore';

const mockedGetPage = vi.mocked(auditLogService.getPage);
const mockedGetKpis = vi.mocked(auditLogService.getKpis);
const mockedGetByCompany = vi.mocked(profileService.getByCompany);

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 'log_1',
    userId: 'user_1',
    action: 'edited',
    module: 'admin',
    recordType: 'Profile',
    recordId: 'user_2',
    reason: 'Suspended',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
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

describe('AuditTrailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ profile: makeProfile(), status: 'authenticated' });
    mockedGetKpis.mockResolvedValue({ events: 3, financialPostings: 1, securityAdmin: 2, reversals: 0 });
  });

  it('renders one server page of audit events, resolving the acting user against real profile data', async () => {
    mockedGetPage.mockResolvedValue({ rows: [makeEntry()], total: 1 });
    mockedGetByCompany.mockResolvedValue([makeProfile()]);

    render(
      <MemoryRouter>
        <AuditTrailPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Thandi Mokoena')).toBeInTheDocument());
    expect(screen.getByText('Suspended')).toBeInTheDocument();
    expect(mockedGetPage).toHaveBeenCalled();
    expect(mockedGetPage.mock.calls[0][0]).toMatchObject({ page: 0, pageSize: 25 });
  });

  it('logs a sensitive-area access event on mount', async () => {
    mockedGetPage.mockResolvedValue({ rows: [], total: 0 });
    mockedGetByCompany.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <AuditTrailPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(auditLogAccessService.logSensitiveView).toHaveBeenCalledWith('Audit trail', undefined));
  });

  it('falls back to "System" for the system sentinel actor', async () => {
    mockedGetPage.mockResolvedValue({ rows: [makeEntry({ userId: 'system' })], total: 1 });
    mockedGetByCompany.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <AuditTrailPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('System')).toBeInTheDocument());
  });

  it('shows an empty state when the filtered query returns nothing', async () => {
    mockedGetPage.mockResolvedValue({ rows: [], total: 0 });
    mockedGetByCompany.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <AuditTrailPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('No matching events')).toBeInTheDocument();
  });
});
