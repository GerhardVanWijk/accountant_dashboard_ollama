import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ID } from '@/types';
import { bankAccountService, bankTransactionService } from '@/features/banking/services';
import { accountMappingService, journalEntryService } from '@/features/accounting/services';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useCreditNotes } from '@/features/sales/hooks/useCreditNotes';
import { useCustomerReceipts } from '@/features/sales/hooks/useCustomerReceipts';
import { useBills } from '@/features/purchases/hooks/useBills';
import { usePayments } from '@/features/purchases/hooks/usePayments';
import { runBooksIntegrityCheck } from '../booksIntegrity/runBooksIntegrityCheck';
import { checkOrphanedPostedDocuments, checkDuplicateGlPosting, type BooksIntegrityCheckResult, type PostableDocumentLike } from '../booksIntegrity/checks';

const INVOICE_POSTED_STATUSES = ['sent', 'partially_paid', 'paid', 'overdue'];
const BILL_POSTED_STATUSES = ['awaiting_payment', 'partially_paid', 'paid', 'overdue'];

/**
 * Drives the whole-books integrity screen. Deliberately reads Invoices/Bills
 * through the same hooks Sales/Purchases already expose (useInvoices/
 * useBills) rather than duplicating a fetch — every number shown here is
 * either a pass-through of an already-existing check
 * (reconcileAccountsReceivable/Payable, computeTrialBalance) or one of this
 * module's new checks, never re-derived from scratch in the UI layer.
 */
export function useBooksIntegrity(bankAccountId: ID | undefined, options: { editedAfterReconciliationCount?: number; openingBalanceIssueFound?: boolean } = {}) {
  const [results, setResults] = useState<BooksIntegrityCheckResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { invoices } = useInvoices();
  const { bills } = useBills();
  const { creditNotes } = useCreditNotes();
  const { receipts: customerReceipts } = useCustomerReceipts();
  const { payments: supplierPayments } = usePayments();

  const load = useCallback(async () => {
    if (!bankAccountId) {
      setResults([]);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const [bankAccount, transactions] = await Promise.all([bankAccountService.getBankAccount(bankAccountId), bankTransactionService.getTransactions(bankAccountId)]);
      if (!bankAccount) throw new Error(`Bank account "${bankAccountId}" not found.`);

      const core = await runBooksIntegrityCheck(journalEntryService, accountMappingService, {
        bankAccount,
        bankTransactions: transactions,
        invoices,
        bills,
        creditNotes,
        customerReceipts,
        supplierPayments,
        editedAfterReconciliationCount: options.editedAfterReconciliationCount ?? 0,
        openingBalanceIssueFound: options.openingBalanceIssueFound ?? false,
      });

      const invoiceDocs: PostableDocumentLike[] = invoices.map((i) => ({ id: i.id, documentNumber: i.invoiceNumber, status: i.status, journalEntryId: i.journalEntryId }));
      const billDocs: PostableDocumentLike[] = bills.map((b) => ({ id: b.id, documentNumber: b.billNumber, status: b.status, journalEntryId: b.journalEntryId }));

      setResults([
        ...core,
        checkOrphanedPostedDocuments('Invoices posted with a real GL entry', 'invoice_gl_presence', invoiceDocs, INVOICE_POSTED_STATUSES),
        checkOrphanedPostedDocuments('Bills posted with a real GL entry', 'bill_gl_presence', billDocs, BILL_POSTED_STATUSES),
        checkDuplicateGlPosting('No duplicate GL posting (Invoices)', 'invoice_duplicate_gl', invoiceDocs),
        checkDuplicateGlPosting('No duplicate GL posting (Bills)', 'bill_duplicate_gl', billDocs),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [bankAccountId, invoices, bills, creditNotes, customerReceipts, supplierPayments, options.editedAfterReconciliationCount, options.openingBalanceIssueFound]);

  useEffect(() => {
    load();
  }, [load]);

  return useMemo(() => ({ results, isLoading, error, refetch: load }), [results, isLoading, error, load]);
}
