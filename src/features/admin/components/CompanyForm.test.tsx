import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import type { BankAccount, Company } from '@/types';
import { CompanyForm } from './CompanyForm';
import {
  companyFormSchema,
  companyToFormValues,
  formValuesToCompanyPatch,
  LOGO_MAX_BYTES,
} from '../utils/companyFormSchema';

afterEach(cleanup);

const company: Company = {
  id: 'comp_001',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  name: 'Demo Trading (Pty) Ltd',
  registrationNumber: '2020/123456/07',
  legalEntityType: 'private_company',
  isPublicCompany: false,
  isListed: false,
  hasPublicAccountability: false,
  reportingFramework: 'not_yet_determined',
  financialYearEndMonth: 12,
  financialYearEndDay: 31,
  accountingBasis: 'accrual',
  functionalCurrency: 'ZAR',
  presentationCurrency: 'ZAR',
  isVatRegistered: true,
  vatRegistrationNumber: '4123456789',
  incomeTaxNumber: '9123456789',
  isActive: true,
};

const bankAccounts: BankAccount[] = [
  {
    id: 'bank-active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    name: 'Business Cheque',
    bankName: 'FNB',
    accountNumber: '62888000111',
    accountType: 'checking',
    currency: 'ZAR',
    openingBalance: 0,
    currentBalance: 0,
    glAccountId: 'gl-1000',
    status: 'active',
  },
  {
    id: 'bank-old',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    name: 'Old Savings',
    bankName: 'Nedbank',
    accountNumber: '11122233344',
    accountType: 'savings',
    currency: 'ZAR',
    openingBalance: 0,
    currentBalance: 0,
    glAccountId: 'gl-1001',
    status: 'inactive',
  },
];

function renderForm(overrides: Partial<Company> = {}) {
  const onSubmit = vi.fn();
  render(
    <CompanyForm
      company={{ ...company, ...overrides }}
      bankAccounts={bankAccounts}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  );
  return { onSubmit };
}

describe('CompanyForm — Document & branding', () => {
  it('lists the company bank accounts plus a "None" option', () => {
    renderForm();
    const select = screen.getByLabelText('Bank account shown on documents') as HTMLSelectElement;
    const options = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(options[0]).toMatch(/None/);
    expect(options.some((o) => o?.includes('Business Cheque'))).toBe(true);
    expect(options.some((o) => o?.includes('Old Savings') && o?.includes('inactive'))).toBe(true);
  });

  it('rejects a wrong-type logo file with a clear message and stores nothing', async () => {
    renderForm();
    const input = screen.getByLabelText('Logo') as HTMLInputElement;
    const badFile = new File(['<svg/>'], 'logo.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [badFile] } });
    expect(await screen.findByText(/must be a PNG, JPEG, WebP or SVG image/i)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /logo preview/i })).toBeNull();
  });

  it('rejects a logo over 512 KB', async () => {
    renderForm();
    const input = screen.getByLabelText('Logo') as HTMLInputElement;
    const bigFile = new File([new Uint8Array(LOGO_MAX_BYTES + 1)], 'logo.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [bigFile] } });
    expect(await screen.findByText(/512 KB or smaller/i)).toBeInTheDocument();
  });

  it('accepts a small PNG and shows it as a preview image', async () => {
    renderForm();
    const input = screen.getByLabelText('Logo') as HTMLInputElement;
    const okFile = new File([new Uint8Array([1, 2, 3, 4])], 'logo.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [okFile] } });
    await waitFor(() =>
      expect(screen.getByRole('img', { name: /logo preview/i })).toHaveAttribute(
        'src',
        expect.stringMatching(/^data:/),
      ),
    );
  });

  it('pre-fills an existing logo and lets it be removed', () => {
    renderForm({ logo: 'data:image/png;base64,AAAA' });
    expect(screen.getByRole('img', { name: /logo preview/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByRole('img', { name: /logo preview/i })).toBeNull();
  });
});

describe('companyFormSchema mapping', () => {
  it('round-trips the document profile fields', () => {
    const values = companyToFormValues({
      ...company,
      tradingName: 'Demo Trading',
      documentAddress: { line1: '1 Main Rd', city: 'Cape Town', country: 'South Africa' },
      phone: '021 555 0000',
      email: 'hi@demo.example',
      website: 'demo.example',
      documentTerms: 'Net 30.',
      documentsBankAccountId: 'bank-active',
    });
    expect(values.tradingName).toBe('Demo Trading');
    expect(values.documentAddress.line1).toBe('1 Main Rd');

    const patch = formValuesToCompanyPatch(values);
    expect(patch.tradingName).toBe('Demo Trading');
    expect(patch.documentAddress).toEqual({
      line1: '1 Main Rd',
      line2: undefined,
      city: 'Cape Town',
      state: undefined,
      postalCode: undefined,
      country: 'South Africa',
    });
    expect(patch.documentsBankAccountId).toBe('bank-active');
  });

  it('maps an all-blank document address to undefined and an empty bank selection to undefined', () => {
    const patch = formValuesToCompanyPatch(companyToFormValues(company));
    expect(patch.documentAddress).toBeUndefined();
    expect(patch.documentsBankAccountId).toBeUndefined();
    expect(patch.tradingName).toBeUndefined();
    // The keys are still present so the repository writes SQL NULL (clear), not skip.
    expect('documentAddress' in patch).toBe(true);
    expect('documentsBankAccountId' in patch).toBe(true);
  });

  it('rejects an invalid document email via the schema', () => {
    const result = companyFormSchema.safeParse({
      ...companyToFormValues(company),
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });
});
