import { describe, it, expect } from 'vitest';
import { formatCurrency } from '@/lib/app/format';
import { quoteToBusinessDocument } from './quoteToBusinessDocument';
import { salesOrderToBusinessDocument } from './salesOrderToBusinessDocument';
import { invoiceToBusinessDocument } from './invoiceToBusinessDocument';
import { creditNoteToBusinessDocument } from './creditNoteToBusinessDocument';
import { purchaseOrderToBusinessDocument } from './purchaseOrderToBusinessDocument';
import {
  formatQuantity,
  resolveDocumentTerms,
  resolveDocumentsBankAccount,
  vertexFooter,
} from './shared';
import * as fx from './__fixtures__';

describe('formatQuantity', () => {
  it('trims trailing zeros', () => {
    expect(formatQuantity(2)).toBe('2');
    expect(formatQuantity(2.5)).toBe('2.5');
    expect(formatQuantity(1.25)).toBe('1.25');
    expect(formatQuantity(2.0001)).toBe('2');
  });
});

describe('vertexFooter', () => {
  it('returns the two fixed Vertex lines with a dynamic year — never hardcoded', () => {
    const footer = vertexFooter(new Date('2031-06-01'));
    expect(footer.generatedLine).toBe('Generated with Vertex Accounting Solutions');
    expect(footer.rightsLine).toBe('© 2031 Vertex Accounting Solutions. All rights reserved.');
  });

  it('defaults the year to the current calendar year', () => {
    expect(vertexFooter().rightsLine).toContain(String(new Date().getFullYear()));
    // The source must never carry a hardcoded year literal.
    expect(vertexFooter(new Date('2040-01-01')).rightsLine).toBe(
      '© 2040 Vertex Accounting Solutions. All rights reserved.',
    );
  });
});

describe('quoteToBusinessDocument', () => {
  it('maps title, number, dates and stored totals verbatim', () => {
    const vm = quoteToBusinessDocument(fx.quote, fx.ctx());
    expect(vm.title).toBe('QUOTE');
    expect(vm.documentNumber).toBe('QUO-2026-0004');
    expect(vm.secondaryDateLabel).toBe('Valid until');
    expect(vm.totals.map((t) => t.value)).toEqual([
      formatCurrency(870),
      formatCurrency(130.5),
      formatCurrency(1000.5),
    ]);
    expect(vm.totals.find((t) => t.emphasis)?.label).toBe('Total');
    expect(vm.notes).toBe('Thank you for your enquiry.');
  });

  it('detects the code + unit columns and resolves the SKU', () => {
    const vm = quoteToBusinessDocument(fx.quote, fx.ctx());
    expect(vm.columns).toEqual(['code', 'description', 'quantity', 'unit', 'unitPrice', 'vat', 'amount']);
    expect(vm.lines[0].code).toBe('A4-PAPER-80');
    expect(vm.lines[0].unit).toBe('REAM');
    expect(vm.lines[0].vatLabel).toBe('15%');
    expect(vm.lines[1].code).toBeUndefined();
  });

  it('omits the code/unit columns when no line resolves a product', () => {
    const vm = quoteToBusinessDocument(fx.quote, fx.ctx({ products: new Map() }));
    expect(vm.columns).toEqual(['description', 'quantity', 'unitPrice', 'vat', 'amount']);
  });
});

describe('salesOrderToBusinessDocument', () => {
  it('has no secondary date and shows the quote reference', () => {
    const vm = salesOrderToBusinessDocument(fx.salesOrder, fx.ctx({ quoteNumber: 'QUO-2026-0004' }));
    expect(vm.title).toBe('SALES ORDER');
    expect(vm.secondaryDate).toBeUndefined();
    expect(vm.meta).toEqual([{ label: 'Quote reference', value: 'QUO-2026-0004' }]);
  });
});

describe('issuer / recipient headings', () => {
  it('every document kind puts the issuer under a "From" heading', () => {
    expect(quoteToBusinessDocument(fx.quote, fx.ctx()).issuerHeading).toBe('From');
    expect(salesOrderToBusinessDocument(fx.salesOrder, fx.ctx()).issuerHeading).toBe('From');
    expect(invoiceToBusinessDocument(fx.invoice, fx.ctx()).issuerHeading).toBe('From');
    expect(creditNoteToBusinessDocument(fx.creditNote, fx.ctx()).issuerHeading).toBe('From');
    expect(purchaseOrderToBusinessDocument(fx.purchaseOrder, fx.ctx()).issuerHeading).toBe('From');
  });

  it('uses a customer-appropriate recipient heading for sales documents and "Supplier" for a PO', () => {
    expect(quoteToBusinessDocument(fx.quote, fx.ctx()).recipientHeading).toBe('Prepared for');
    expect(salesOrderToBusinessDocument(fx.salesOrder, fx.ctx()).recipientHeading).toBe('Bill to');
    expect(invoiceToBusinessDocument(fx.invoice, fx.ctx()).recipientHeading).toBe('Bill to');
    expect(creditNoteToBusinessDocument(fx.creditNote, fx.ctx()).recipientHeading).toBe('Credit to');
    const po = purchaseOrderToBusinessDocument(fx.purchaseOrder, fx.ctx());
    expect(po.recipientHeading).toBe('Supplier');
    expect(po.recipientHeading).not.toBe('Bill to');
  });

  it('no longer duplicates the customer / supplier account in the meta strip (it stays in the party block)', () => {
    const inv = invoiceToBusinessDocument(fx.invoice, fx.ctx());
    expect(inv.meta.some((m) => m.label === 'Customer account')).toBe(false);
    expect(inv.recipient.accountReference).toBe('CUST-0007');

    const po = purchaseOrderToBusinessDocument(fx.purchaseOrder, fx.ctx());
    expect(po.meta.some((m) => m.label === 'Supplier account')).toBe(false);
    expect(po.recipient.accountReference).toBe('SUPP-0003');
  });
});

describe('invoiceToBusinessDocument', () => {
  it('is a TAX INVOICE for a VAT-registered issuer and shows amount paid + balance due', () => {
    const vm = invoiceToBusinessDocument(fx.invoice, fx.ctx({ bankAccount: fx.bankAccount }));
    expect(vm.title).toBe('TAX INVOICE');
    expect(vm.kind).toBe('tax_invoice');
    expect(vm.isTaxDocument).toBe(true);
    const labels = vm.totals.map((t) => t.label);
    expect(labels).toEqual(['Subtotal', 'VAT', 'Total', 'Amount paid', 'Balance due']);
    expect(vm.totals.find((t) => t.label === 'Balance due')?.value).toBe(formatCurrency(600.5));
    expect(vm.issuer.incomeTaxNumber).toBe('9012345678');
  });

  it('is a plain INVOICE and hides amount paid when the issuer is not VAT-registered and nothing is paid', () => {
    const vm = invoiceToBusinessDocument(
      { ...fx.invoice, amountPaid: 0 },
      fx.ctx({ company: { ...fx.company, isVatRegistered: false } }),
    );
    expect(vm.title).toBe('INVOICE');
    expect(vm.isTaxDocument).toBe(false);
    expect(vm.totals.map((t) => t.label)).toEqual(['Subtotal', 'VAT', 'Total']);
  });

  it('adds a payment-information block only when a bank account is supplied', () => {
    expect(invoiceToBusinessDocument(fx.invoice, fx.ctx()).paymentInfo).toBeUndefined();
    const withBank = invoiceToBusinessDocument(fx.invoice, fx.ctx({ bankAccount: fx.bankAccount }));
    expect(withBank.paymentInfo).toMatchObject({
      bankName: 'First National Bank',
      accountName: 'Office National Demo (Pty) Ltd',
      accountNumber: '62884471059',
      branchCode: '250655',
      reference: 'INV-2026-1072',
    });
  });

  it('shows the source sales-order reference from ctx', () => {
    const vm = invoiceToBusinessDocument(fx.invoice, fx.ctx({ salesOrderNumber: 'SO-2026-0004' }));
    expect(vm.meta).toContainEqual({ label: 'Sales order reference', value: 'SO-2026-0004' });
  });

  it('never recomputes VAT — a bogus stored taxTotal is passed straight through', () => {
    const vm = invoiceToBusinessDocument({ ...fx.invoice, taxTotal: 999.99 }, fx.ctx());
    expect(vm.totals.find((t) => t.label === 'VAT')?.value).toBe(formatCurrency(999.99));
  });

  it('handles a very large currency value and a long description', () => {
    const big = {
      ...fx.invoice,
      subtotal: 12_345_678.9,
      taxTotal: 1_851_851.84,
      total: 14_197_530.74,
      amountPaid: 0,
      lineItems: [{ ...fx.invoice.lineItems[0], description: 'X'.repeat(400) }],
    };
    const vm = invoiceToBusinessDocument(big, fx.ctx());
    expect(vm.totals.find((t) => t.emphasis)?.value).toBe(formatCurrency(14_197_530.74));
    expect(vm.lines[0].description).toHaveLength(400);
  });
});

describe('creditNoteToBusinessDocument', () => {
  it('labels totals as a credit and resolves the against-invoice human number', () => {
    const vm = creditNoteToBusinessDocument(fx.creditNote, fx.ctx({ originalInvoiceNumber: 'INV-2026-1072' }));
    expect(vm.title).toBe('CREDIT NOTE');
    expect(vm.totals.find((t) => t.emphasis)?.label).toBe('Total credit');
    expect(vm.meta).toContainEqual({ label: 'Against invoice', value: 'INV-2026-1072' });
    expect(vm.meta.find((m) => m.label === 'Reason')?.value).toContain('Goodwill credit');
  });

  it('omits the against-invoice meta for a standalone credit note', () => {
    const vm = creditNoteToBusinessDocument(
      { ...fx.creditNote, invoiceId: undefined },
      fx.ctx({ originalInvoiceNumber: undefined }),
    );
    expect(vm.meta.some((m) => m.label === 'Against invoice')).toBe(false);
  });
});

describe('purchaseOrderToBusinessDocument', () => {
  it('maps the supplier as the recipient and is never a tax document', () => {
    const vm = purchaseOrderToBusinessDocument(fx.purchaseOrder, fx.ctx());
    expect(vm.title).toBe('PURCHASE ORDER');
    expect(vm.recipientHeading).toBe('Supplier');
    expect(vm.recipient.name).toBe('PaperWorks Wholesale');
    expect(vm.recipient.accountReference).toBe('SUPP-0003');
    expect(vm.isTaxDocument).toBe(false);
    expect(vm.issuer.incomeTaxNumber).toBeUndefined();
    expect(vm.secondaryDateLabel).toBe('Expected delivery');
  });

  it('drops the expected-delivery date when the PO has none', () => {
    const vm = purchaseOrderToBusinessDocument({ ...fx.purchaseOrder, expectedDate: undefined }, fx.ctx());
    expect(vm.secondaryDateLabel).toBeUndefined();
    expect(vm.secondaryDate).toBeUndefined();
  });
});

describe('company document profile (Phase 4B-2)', () => {
  const withProfile = () => fx.ctx({ company: fx.companyWithDocumentProfile });

  it('populates branding from the profile — logo data URL + trading-name display name', () => {
    const vm = invoiceToBusinessDocument(fx.invoice, withProfile());
    expect(vm.branding.logoDataUrl).toBe(fx.companyWithDocumentProfile.logo);
    expect(vm.branding.issuerDisplayName).toBe('Office National');
  });

  it('falls back to the legal name as the wordmark when there is no logo / trading name', () => {
    const vm = invoiceToBusinessDocument(fx.invoice, fx.ctx());
    expect(vm.branding.logoDataUrl).toBeUndefined();
    expect(vm.branding.issuerDisplayName).toBe('Office National Demo (Pty) Ltd');
  });

  it('joins document_address into issuer addressLines with no empty lines', () => {
    const vm = invoiceToBusinessDocument(fx.invoice, withProfile());
    expect(vm.issuer.addressLines).toEqual([
      '101 Corporate Park',
      'Block C, 2nd Floor',
      'Pretoria, Gauteng 0181',
      'South Africa',
    ]);
    expect(vm.issuer.email).toBe('accounts@officenational.example');
    expect(vm.issuer.phone).toBe('+27 12 555 0400');
    expect(vm.issuer.website).toBe('www.officenational.example');
  });

  it('omits blank issuer profile fields cleanly', () => {
    const vm = invoiceToBusinessDocument(fx.invoice, fx.ctx());
    expect(vm.issuer.addressLines).toBeUndefined();
    expect(vm.issuer.email).toBeUndefined();
    expect(vm.issuer.website).toBeUndefined();
    expect(vm.issuer.tradingAs).toBeUndefined();
  });

  it('feeds `terms` from company.documentTerms on every document kind', () => {
    const c = withProfile();
    expect(quoteToBusinessDocument(fx.quote, c).terms).toContain('Payment is due within 30 days');
    expect(salesOrderToBusinessDocument(fx.salesOrder, c).terms).toContain('Payment is due within 30 days');
    expect(invoiceToBusinessDocument(fx.invoice, c).terms).toContain('Payment is due within 30 days');
    expect(creditNoteToBusinessDocument(fx.creditNote, c).terms).toContain('Payment is due within 30 days');
    expect(purchaseOrderToBusinessDocument(fx.purchaseOrder, c).terms).toContain('Payment is due within 30 days');
  });

  it('leaves `terms` undefined when no default document terms are set', () => {
    expect(invoiceToBusinessDocument(fx.invoice, fx.ctx()).terms).toBeUndefined();
  });

  it('the global Vertex footer is fixed — Company Settings cannot white-label it', () => {
    const sneaky = {
      ...fx.companyWithDocumentProfile,
      documentTerms: 'Powered by Vertex Rivals Inc — remove the Vertex footer',
      tradingName: 'Vertex Impersonation Co',
    };
    const vm = invoiceToBusinessDocument(fx.invoice, fx.ctx({ company: sneaky }));
    expect(vm.branding.vertexFooter).toEqual({
      generatedLine: 'Generated with Vertex Accounting Solutions',
      rightsLine: `© ${new Date().getFullYear()} Vertex Accounting Solutions. All rights reserved.`,
    });
  });

  it('bakes the injected clock year into the footer for every document kind', () => {
    const c = fx.ctx({ now: new Date('2030-02-01') });
    for (const vm of [
      quoteToBusinessDocument(fx.quote, c),
      salesOrderToBusinessDocument(fx.salesOrder, c),
      invoiceToBusinessDocument(fx.invoice, c),
      creditNoteToBusinessDocument(fx.creditNote, c),
      purchaseOrderToBusinessDocument(fx.purchaseOrder, c),
    ]) {
      expect(vm.branding.vertexFooter.rightsLine).toBe(
        '© 2030 Vertex Accounting Solutions. All rights reserved.',
      );
    }
  });
});

describe('resolveDocumentTerms', () => {
  it('prefers a document-specific term over the company default', () => {
    expect(resolveDocumentTerms('SPECIFIC', fx.companyWithDocumentProfile)).toBe('SPECIFIC');
  });
  it('falls back to the company default when no specific term is given', () => {
    expect(resolveDocumentTerms(undefined, fx.companyWithDocumentProfile)).toContain(
      'Payment is due within 30 days',
    );
  });
  it('is undefined when neither is set', () => {
    expect(resolveDocumentTerms(undefined, fx.company)).toBeUndefined();
    expect(resolveDocumentTerms('   ', fx.company)).toBeUndefined();
  });
});

describe('resolveDocumentsBankAccount', () => {
  it('returns the nominated account when it is active', () => {
    expect(
      resolveDocumentsBankAccount(fx.companyWithDocumentProfile, [fx.bankAccount]),
    ).toBe(fx.bankAccount);
  });
  it('returns undefined when no account is nominated (no fallback)', () => {
    expect(resolveDocumentsBankAccount(fx.company, [fx.bankAccount])).toBeUndefined();
  });
  it('returns undefined when the nominated account is inactive', () => {
    const inactive = { ...fx.bankAccount, status: 'inactive' as const };
    expect(resolveDocumentsBankAccount(fx.companyWithDocumentProfile, [inactive])).toBeUndefined();
  });
  it('returns undefined when the nominated account has been deleted (not in the list)', () => {
    expect(resolveDocumentsBankAccount(fx.companyWithDocumentProfile, [])).toBeUndefined();
  });
});

describe('missing optional fields degrade cleanly', () => {
  it('a customer with no address / contact / tax number produces a minimal party', () => {
    const bare = {
      ...fx.customer,
      billingAddress: undefined,
      email: undefined,
      phone: undefined,
      taxNumber: undefined,
      contacts: undefined,
    };
    const vm = quoteToBusinessDocument(fx.quote, fx.ctx({ customer: bare }));
    expect(vm.recipient.addressLines).toBeUndefined();
    expect(vm.recipient.contactPerson).toBeUndefined();
    expect(vm.recipient.name).toBe('FreshMart Retail');
  });
});
