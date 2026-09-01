import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { InventoryOperationsPage } from './InventoryOperationsPage';
import { stockAdjustmentService } from '../services/stockAdjustmentService';
import { stockTransferService } from '../services/stockTransferService';
import { stockTakeService } from '../services/stockTakeService';
import { supplierReturnService } from '../services/supplierReturnService';
import { openingStockBatchService } from '../services/openingStockBatchService';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/inventory/operations']}>
      <InventoryOperationsPage />
    </MemoryRouter>,
  );
}

vi.mock('../services/stockAdjustmentService', () => ({
  stockAdjustmentService: { getAdjustments: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../services/stockTransferService', () => ({
  stockTransferService: { getTransfers: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../services/stockTakeService', () => ({
  stockTakeService: { getStockTakes: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../services/supplierReturnService', () => ({
  supplierReturnService: { getSupplierReturns: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../services/openingStockBatchService', () => ({
  openingStockBatchService: { getOpeningStockBatches: vi.fn().mockResolvedValue([]) },
}));

describe('InventoryOperationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (stockAdjustmentService.getAdjustments as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (stockTransferService.getTransfers as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (stockTakeService.getStockTakes as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (supplierReturnService.getSupplierReturns as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (openingStockBatchService.getOpeningStockBatches as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it('links to every stock operation register', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: /stock adjustments/i })).toHaveAttribute('href', '/inventory/adjustments');
    expect(screen.getByRole('link', { name: /stock transfers/i })).toHaveAttribute('href', '/inventory/transfers');
    expect(screen.getByRole('link', { name: /stock takes/i })).toHaveAttribute('href', '/inventory/stock-takes');
    expect(screen.getByRole('link', { name: /supplier returns/i })).toHaveAttribute('href', '/inventory/supplier-returns');
    expect(screen.getByRole('link', { name: /opening stock/i })).toHaveAttribute('href', '/inventory/opening-stock');
  });
});
