import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuditTrailPage } from './AuditTrailPage';
import { auditLogService } from '@/services/auditLogService';
import { profileService } from '@/features/auth/services';
import { useAuthStore } from '@/stores/authStore';
import type { AuditLogEntry, Profile } from '@/types';

vi.mock('@/services/auditLogService', () => ({
  auditLogService: { getAll: vi.fn() },
}));
vi.mock('@/features/auth/services', () => ({
  profileService: { getByCompany: vi.fn() },
}));

const mockedGetAll = vi.mocked(auditLogService.getAll);
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
    useAuthStore.setState({ profile: makeProfile() });
  });

  it('renders the real audit log, resolving the acting user against real profile data', async () => {
    mockedGetAll.mockResolvedValue([makeEntry()]);
    mockedGetByCompany.mockResolvedValue([makeProfile()]);

    render(
      <MemoryRouter>
        <AuditTrailPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Thandi Mokoena')).toBeInTheDocument());
    expect(screen.getByText('Suspended')).toBeInTheDocument();
    expect(mockedGetAll).toHaveBeenCalledTimes(1);
  });

  it('falls back to the raw userId when no matching profile is found, rather than inventing a name', async () => {
    mockedGetAll.mockResolvedValue([makeEntry({ userId: 'system' })]);
    mockedGetByCompany.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <AuditTrailPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('System')).toBeInTheDocument());
  });

  it('shows an honest empty state when nothing has been logged yet', async () => {
    mockedGetAll.mockResolvedValue([]);
    mockedGetByCompany.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <AuditTrailPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('No audit events yet')).toBeInTheDocument();
  });
});
