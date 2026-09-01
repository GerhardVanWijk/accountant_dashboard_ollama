import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImportWizard } from './ImportWizard';
import { productImportAdapter } from '../adapters/productImportAdapter';
import { customerImportAdapter } from '../adapters/customerImportAdapter';
import { productService } from '@/features/inventory/services/productService';
import { productCategoryService } from '@/features/inventory/services/productCategoryService';
import { supplierService } from '@/features/suppliers/services/supplierService';
import { taxRateService } from '@/features/tax/services';
import { customerService } from '@/features/customers/services/customerService';
import { auditLogService } from '@/services/auditLogService';

vi.mock('@/features/auth/hooks/useCanAccess', () => ({ useCanAccess: vi.fn(() => true) }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: vi.fn(() => 'user_1') }));

vi.mock('@/features/inventory/services/productService', () => ({
  productService: { getProducts: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn() },
}));
vi.mock('@/features/inventory/services/productCategoryService', () => ({
  productCategoryService: { getCategories: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/features/suppliers/services/supplierService', () => ({
  supplierService: { getSuppliers: vi.fn().mockResolvedValue([]), createSupplier: vi.fn(), updateSupplier: vi.fn() },
}));
vi.mock('@/features/tax/services', () => ({
  taxRateService: { getCurrentlyEffectiveRates: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/features/customers/services/customerService', () => ({
  customerService: { getCustomers: vi.fn().mockResolvedValue([]), createCustomer: vi.fn(), updateCustomer: vi.fn() },
}));
vi.mock('@/services/auditLogService', () => ({
  auditLogService: { log: vi.fn().mockResolvedValue(undefined) },
}));

const mockedGetProducts = productService.getProducts as unknown as ReturnType<typeof vi.fn>;
const mockedCreateProduct = productService.createProduct as unknown as ReturnType<typeof vi.fn>;

/** A real `File` (so `fireEvent.change`'s `target.files` assignment is accepted by jsdom) with `.text()` patched on — jsdom's own `File` doesn't implement it (same gap `banking/hooks/useStatementImport.test.ts`'s plain-object fake works around differently, by never exercising real file reading). */
function fakeCsvFile(name: string, content: string): File {
  const file = new File([content], name, { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: async () => content });
  return file;
}

describe('ImportWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetProducts.mockResolvedValue([]);
    (productCategoryService.getCategories as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (supplierService.getSuppliers as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (taxRateService.getCurrentlyEffectiveRates as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (customerService.getCustomers as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it('drives a single adapter straight to the File step (no type chooser for one adapter)', () => {
    render(<ImportWizard adapters={[productImportAdapter]} onClose={vi.fn()} onImported={vi.fn()} />);
    expect(screen.getByText(/choose a file/i)).toBeInTheDocument();
  });

  it('offers an Import type chooser when given more than one adapter, filtered by permission', () => {
    render(<ImportWizard adapters={[productImportAdapter, customerImportAdapter]} onClose={vi.fn()} onImported={vi.fn()} />);
    expect(screen.getByText('Products')).toBeInTheDocument();
    expect(screen.getByText('Customers')).toBeInTheDocument();
  });

  it('runs the full pipeline for a valid product CSV: file → mapping → review → import → result', async () => {
    mockedCreateProduct.mockResolvedValue({ id: 'prod_1', sku: 'PEN-1', name: 'Blue Pen', type: 'good', unitPrice: 5, costPrice: 2, trackInventory: true, quantityOnHand: 0, status: 'active', createdAt: '', updatedAt: '' });
    const onImported = vi.fn();
    render(<ImportWizard adapters={[productImportAdapter]} onClose={vi.fn()} onImported={onImported} />);

    const file = fakeCsvFile('products.csv', 'SKU,Name,Cost,Selling Price\nPEN-1,Blue Pen,2,5');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    // Mapping step — SKU/Name/Cost/Selling Price all auto-map via aliases.
    await screen.findByText(/match each spreadsheet column/i);
    fireEvent.click(screen.getByRole('button', { name: /preview & validate/i }));

    // Review step
    await screen.findByText('Rows read');
    fireEvent.click(screen.getByRole('button', { name: /^import$/i }));

    await waitFor(() => expect(mockedCreateProduct).toHaveBeenCalledWith(expect.objectContaining({ sku: 'PEN-1', name: 'Blue Pen', costPrice: 2, unitPrice: 5 })));
    await screen.findByText(/import finished/i);
    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'data_imported' }));

    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(onImported).toHaveBeenCalled();
  });

  it('rejects an unsupported file type with a visible error', async () => {
    render(<ImportWizard adapters={[productImportAdapter]} onClose={vi.fn()} onImported={vi.fn()} />);
    const file = fakeCsvFile('products.pdf', 'irrelevant');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/\.csv, \.xls or \.xlsx/i);
  });
});
