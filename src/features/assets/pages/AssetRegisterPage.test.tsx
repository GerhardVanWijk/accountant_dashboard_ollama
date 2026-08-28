import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Account, FixedAsset } from '@/types';
import { AssetRegisterPage } from './AssetRegisterPage';
import { fixedAssetService } from '../services';
import { accountService } from '@/features/accounting/services';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/assets/register']}>
      <AssetRegisterPage />
    </MemoryRouter>,
  );
}

vi.mock('../services', () => ({
  fixedAssetService: {
    getFixedAssets: vi.fn(),
    getFixedAsset: vi.fn(),
    createFixedAsset: vi.fn(),
    updateFixedAsset: vi.fn(),
    deleteFixedAsset: vi.fn(),
    postAcquisition: vi.fn(),
  },
  depreciationService: {
    getDepreciationHistory: vi.fn().mockResolvedValue([]),
    runDepreciation: vi.fn(),
  },
  assetDisposalService: {
    getDisposals: vi.fn().mockResolvedValue([]),
    disposeAsset: vi.fn(),
  },
}));

vi.mock('@/features/accounting/services', () => ({
  accountService: {
    getAccounts: vi.fn().mockResolvedValue([]),
    hasPostings: vi.fn().mockResolvedValue(false),
    getAccountIdsWithPostings: vi.fn().mockResolvedValue(new Set()),
  },
}));

const mockedGetFixedAssets = fixedAssetService.getFixedAssets as unknown as ReturnType<typeof vi.fn>;
const mockedCreateFixedAsset = fixedAssetService.createFixedAsset as unknown as ReturnType<typeof vi.fn>;
const mockedPostAcquisition = fixedAssetService.postAcquisition as unknown as ReturnType<typeof vi.fn>;
const mockedGetAccounts = accountService.getAccounts as unknown as ReturnType<typeof vi.fn>;

function makeAsset(overrides: Partial<FixedAsset> = {}): FixedAsset {
  return {
    id: 'fa_1',
    assetNumber: 'FA-0001',
    name: 'Test Forklift',
    category: 'plant_and_machinery',
    acquisitionDate: '2026-06-01',
    cost: 100000,
    residualValue: 10000,
    usefulLifeYears: 5,
    depreciationMethod: 'straight_line',
    glAssetAccountId: 'acc_1500',
    glAccumulatedDepreciationAccountId: 'acc_1590',
    glDepreciationExpenseAccountId: 'acc_5200',
    accumulatedDepreciation: 0,
    status: 'draft',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc_2000',
    code: '2000',
    name: 'Accounts Payable',
    type: 'liability',
    normalBalance: 'credit',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('AssetRegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetAccounts.mockResolvedValue([makeAccount()]);
  });

  it('shows a loading state while assets are being fetched', () => {
    mockedGetFixedAssets.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading fixed assets/i)).toBeInTheDocument();
  });

  it('shows an error state when the fetch fails', async () => {
    mockedGetFixedAssets.mockRejectedValue(new Error('Network unreachable'));
    renderPage();
    expect(await screen.findByText(/network unreachable/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no assets', async () => {
    mockedGetFixedAssets.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/no fixed assets yet/i)).toBeInTheDocument();
  });

  it('renders asset rows once data loads', async () => {
    mockedGetFixedAssets.mockResolvedValue([makeAsset()]);
    renderPage();
    expect(await screen.findByText('FA-0001')).toBeInTheDocument();
    expect(screen.getByText('Test Forklift')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('creates a new draft asset through the form', async () => {
    mockedGetFixedAssets.mockResolvedValue([]);
    mockedCreateFixedAsset.mockResolvedValue(makeAsset());
    renderPage();
    await screen.findByText(/no fixed assets yet/i);

    fireEvent.click(screen.getAllByRole('button', { name: /new asset/i })[0]);
    fireEvent.change(screen.getByLabelText(/asset number/i), { target: { value: 'FA-0002' } });
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'New Laptop' } });
    fireEvent.change(screen.getByLabelText(/^cost/i), { target: { value: '15000' } });

    mockedGetFixedAssets.mockResolvedValue([makeAsset({ id: 'fa_2', assetNumber: 'FA-0002', name: 'New Laptop' })]);
    fireEvent.click(screen.getByRole('button', { name: /add asset/i }));

    await waitFor(() => expect(mockedCreateFixedAsset).toHaveBeenCalledTimes(1));
    expect(mockedCreateFixedAsset.mock.calls[0][0]).toMatchObject({ assetNumber: 'FA-0002', name: 'New Laptop', cost: 15000 });
  });

  it('posts an acquisition for a draft asset', async () => {
    mockedGetFixedAssets.mockResolvedValue([makeAsset()]);
    mockedPostAcquisition.mockResolvedValue(makeAsset({ status: 'active', journalEntryId: 'je_1' }));
    renderPage();
    await screen.findByText('FA-0001');

    fireEvent.click(screen.getByRole('button', { name: /post acquisition/i }));
    const dialog = await screen.findByRole('dialog', { name: /post acquisition/i });

    fireEvent.click(within(dialog).getByRole('button', { name: /post acquisition/i }));
    await waitFor(() => expect(mockedPostAcquisition).toHaveBeenCalledWith('fa_1', 'acc_2000'));
  });
});
