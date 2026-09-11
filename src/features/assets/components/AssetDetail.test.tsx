import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Account, DepreciationEntry, FixedAsset } from '@/types';
import { AssetDetail } from './AssetDetail';

vi.mock('@/components/app/record-audit-history', () => ({
  RecordAuditHistorySection: () => <div>audit history</div>,
}));

const accounts: Account[] = [
  { id: 'acc_1500', code: '1500', name: 'Fixed Assets', type: 'asset', normalBalance: 'debit', isActive: true, createdAt: '', updatedAt: '' },
  { id: 'acc_1590', code: '1590', name: 'Accumulated Depreciation', type: 'asset', normalBalance: 'credit', isActive: true, createdAt: '', updatedAt: '' },
  { id: 'acc_5200', code: '5200', name: 'Depreciation Expense', type: 'expense', normalBalance: 'debit', isActive: true, createdAt: '', updatedAt: '' },
];

const asset: FixedAsset = {
  id: 'fa_1', assetNumber: 'FA-0001', name: 'Delivery Vehicle', category: 'motor_vehicles',
  acquisitionDate: '2026-01-01', cost: 320000, residualValue: 20000, usefulLifeYears: 5,
  depreciationMethod: 'straight_line',
  glAssetAccountId: 'acc_1500', glAccumulatedDepreciationAccountId: 'acc_1590', glDepreciationExpenseAccountId: 'acc_5200',
  accumulatedDepreciation: 48000, status: 'active', journalEntryId: 'je_cap',
  createdAt: '', updatedAt: '',
};

const history: DepreciationEntry[] = [
  { id: 'd1', assetId: 'fa_1', periodEnd: '2026-01-31', amount: 24000, accumulatedDepreciationAfter: 24000, carryingValueAfter: 296000, journalEntryId: 'je_dep1', createdAt: '', updatedAt: '' },
  { id: 'd2', assetId: 'fa_1', periodEnd: '2026-02-28', amount: 24000, accumulatedDepreciationAfter: 48000, carryingValueAfter: 272000, journalEntryId: 'je_dep1', createdAt: '', updatedAt: '' },
];

function renderDetail() {
  const onOpenJournal = vi.fn();
  render(
    <MemoryRouter>
      <AssetDetail asset={asset} depreciationHistory={history} accounts={accounts} onOpenJournal={onOpenJournal} />
    </MemoryRouter>,
  );
  return { onOpenJournal };
}

describe('AssetDetail', () => {
  it('shows the primary KPI strip with whole, un-split labels and R-formatted money', () => {
    renderDetail();
    expect(screen.getAllByText('Cost').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Accumulated depreciation').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Carrying value').length).toBeGreaterThan(0);
    // en-ZA currency, R not ZAR
    expect(screen.getAllByText((t) => t.includes('R') && t.includes('320') && t.includes('000')).length).toBeGreaterThan(0);
    expect(screen.queryByText((t) => t.includes('ZAR'))).toBeNull();
  });

  it('renders the tab strip and switches to the depreciation ledger', () => {
    const { onOpenJournal } = renderDetail();
    const tablist = screen.getByRole('tablist', { name: /FA-0001 sections/i });
    for (const label of ['Overview', 'Depreciation', 'Accounting', 'Documents', 'Activity']) {
      expect(within(tablist).getByRole('tab', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
    fireEvent.click(within(tablist).getByRole('tab', { name: /Depreciation/i }));
    // the depreciation ledger table header
    expect(screen.getByRole('columnheader', { name: /carrying value/i })).toBeInTheDocument();
    // journal drill-through
    fireEvent.click(screen.getAllByRole('button', { name: /^view$/i })[0]);
    expect(onOpenJournal).toHaveBeenCalledWith('je_dep1');
  });

  it('lists the GL account mappings on the accounting tab', () => {
    renderDetail();
    fireEvent.click(screen.getByRole('tab', { name: /Accounting/i }));
    expect(screen.getByText(/1500 · Fixed Assets/)).toBeInTheDocument();
    expect(screen.getByText(/1590 · Accumulated Depreciation/)).toBeInTheDocument();
    expect(screen.getByText(/5200 · Depreciation Expense/)).toBeInTheDocument();
  });
});
