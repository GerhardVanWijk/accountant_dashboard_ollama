import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SettingsPage } from './SettingsPage';
import { profileService } from '@/features/auth/services';
import { companyService } from '@/features/admin/services';
import { supabase } from '@/config/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import type { Company, Profile } from '@/types';

vi.mock('@/features/auth/services', () => ({
  profileService: { updateOwnProfile: vi.fn(), getById: vi.fn() },
}));
vi.mock('@/features/admin/services', () => ({
  companyService: { getCompanies: vi.fn() },
}));
vi.mock('@/config/supabase', () => ({
  supabase: { auth: { updateUser: vi.fn() } },
}));

const mockedUpdateOwnProfile = vi.mocked(profileService.updateOwnProfile);
const mockedGetById = vi.mocked(profileService.getById);
const mockedGetCompanies = vi.mocked(companyService.getCompanies);
const mockedUpdateUser = vi.mocked(supabase.auth.updateUser);

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

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: 'company_1',
    name: 'Acme (Pty) Ltd',
    legalEntityType: 'private_company',
    isPublicCompany: false,
    isListed: false,
    hasPublicAccountability: false,
    reportingFramework: 'not_yet_determined',
    financialYearEndMonth: 2,
    financialYearEndDay: 28,
    accountingBasis: 'accrual',
    functionalCurrency: 'ZAR',
    presentationCurrency: 'ZAR',
    isVatRegistered: false,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ profile: makeProfile() });
  useThemeStore.setState({ theme: 'light' });
  mockedGetCompanies.mockResolvedValue([makeCompany()]);
});

describe('SettingsPage', () => {
  it('saves real profile edits through profileService.updateOwnProfile()', async () => {
    mockedUpdateOwnProfile.mockResolvedValue(undefined);
    mockedGetById.mockResolvedValue(makeProfile({ firstName: 'Naledi' }));
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Naledi' } });
    screen.getByRole('button', { name: /save changes/i }).click();

    await waitFor(() => expect(mockedUpdateOwnProfile).toHaveBeenCalledWith('user_1', { firstName: 'Naledi', lastName: 'Mokoena' }));
  });

  it('never shows an editable email field — no email-change capability exists', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText(/email address/i)).toBeDisabled();
  });

  it('changes the real password through supabase.auth.updateUser()', async () => {
    mockedUpdateUser.mockResolvedValue({ data: { user: null }, error: null } as never);
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('tab', { name: /password/i }));
    fireEvent.change(await screen.findByLabelText(/new password/i), { target: { value: 'Str0ngPassw0rd' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'Str0ngPassw0rd' } });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => expect(mockedUpdateUser).toHaveBeenCalledWith({ password: 'Str0ngPassw0rd' }));
  });

  it('persists the real theme preference through useThemeStore', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('tab', { name: /preferences/i }));
    fireEvent.change(await screen.findByLabelText(/theme/i), { target: { value: 'dark' } });

    expect(useThemeStore.getState().theme).toBe('dark');
  });

  it('links to the real Companies page instead of duplicating CompanyForm', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('tab', { name: /^company$/i }));
    expect(await screen.findByRole('link', { name: /manage company details/i })).toHaveAttribute('href', '/companies');
    // No inline company-name input — the real CompanyForm is not duplicated here.
    expect(screen.queryByLabelText(/registered name/i)).not.toBeInTheDocument();
  });
});
