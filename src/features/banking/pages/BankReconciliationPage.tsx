import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { BankAccount, ID } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/shadcn/tabs';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/shadcn/select';
import { formatDate } from '@/lib/app/format';
import { useTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useBankAccounts } from '../hooks/useBankAccounts';
import { useBankReconciliation } from '../hooks/useBankReconciliation';
import { useBankTransactions } from '../hooks/useBankTransactions';
import { useBankTransactionMutations } from '../hooks/useBankTransactionMutations';
import { useGlAccounts } from '../hooks/useGlAccounts';
import { useJournalIndex } from '../hooks/useJournalIndex';
import { useBankStatements, useReconciliationStatement } from '../hooks/useBankStatements';
import { ReconciliationWorkspace, type MissingInBooksAction } from '../components/ReconciliationWorkspace';
import { ReconciliationHistory } from '../components/ReconciliationHistory';
import { AllocateTransactionFormModal } from '../components/AllocateTransactionFormModal';
import type { BankTransactionWithAllocations } from '../types';
import { DifferenceInvestigatorPanel } from '@/features/reconciliationIntelligence/components/DifferenceInvestigatorPanel';
import { BooksIntegrityPanel } from '@/features/reconciliationIntelligence/components/BooksIntegrityPanel';
import { WholePeriodProofPanel } from '@/features/reconciliationIntelligence/components/WholePeriodProofPanel';
import { useBooksIntegrity } from '@/features/reconciliationIntelligence/hooks/useBooksIntegrity';
import { useDifferenceInvestigator } from '@/features/reconciliationIntelligence/hooks/useDifferenceInvestigator';
import { useWholePeriodProof } from '@/features/reconciliationIntelligence/hooks/useWholePeriodProof';

/**
 * Bank Reconciliation — route `/banking/reconciliation`.
 *
 * The workspace is a side-by-side proof-reading surface (docs/CURRENT_TASKS.md
 * PART B–I): the chosen `bank_statement`'s lines on the left, the accounting
 * counterpart Vertex believes matches each line on the right, a comparison
 * block between them, and the Difference Investigator's structured evidence
 * per line. ONE `useBankReconciliation` and ONE `useDifferenceInvestigator`
 * are lifted here so the workspace, the investigator tab and the whole-period
 * proof all read the same statement date / balance / cleared selection /
 * investigation result (the "two disconnected singletons" bug class).
 */
export function BankReconciliationPage() {
  const { bankAccounts, isLoading } = useBankAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  useEffect(() => {
    if (!selectedAccountId && bankAccounts.length > 0) {
      setSelectedAccountId(bankAccounts.find((a) => a.status === 'active')?.id ?? bankAccounts[0].id);
    }
  }, [bankAccounts, selectedAccountId]);

  const selectedAccount = useMemo(() => bankAccounts.find((a) => a.id === selectedAccountId), [bankAccounts, selectedAccountId]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Bank reconciliation"
        description="Read the bank statement against the general-ledger cashbook line by line, prove each line against its accounting entry, and finalize once the difference is zero."
      />

      <SectionCard>
        <Select
          items={bankAccounts.map((a) => ({ value: a.id, label: `${a.name} (${a.bankName})` }))}
          value={selectedAccountId}
          onValueChange={(value) => setSelectedAccountId(String(value))}
        >
          <SelectTrigger className="h-9 w-full sm:w-auto sm:min-w-64" aria-label="Select bank account to reconcile">
            <SelectValue placeholder="Select a bank account" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {bankAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} ({a.bankName})
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </SectionCard>

      {isLoading && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading bank accounts…</p>
        </div>
      )}

      {!isLoading && bankAccounts.length === 0 && (
        <SectionCard>
          <p className="py-8 text-center text-sm text-muted-foreground">
            Set up a bank account on the Cash &amp; Bank Accounts page before reconciling.
          </p>
        </SectionCard>
      )}

      {!isLoading && selectedAccount && <ReconciliationSection key={selectedAccount.id} account={selectedAccount} />}
    </div>
  );
}

function ReconciliationSection({ account }: { account: BankAccount }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'workspace' | 'investigator' | 'wholePeriod' | 'integrity' | 'history'>('workspace');
  const [investigateSignal, setInvestigateSignal] = useState(0);
  const [allocating, setAllocating] = useState<BankTransactionWithAllocations | null>(null);
  const [statementId, setStatementId] = useState<string>('');
  const [missingInBooksNotice, setMissingInBooksNotice] = useState<string | null>(null);

  const recon = useBankReconciliation(account.id);
  const investigator = useDifferenceInvestigator(account.id);
  const { transactions, refetch: refetchTransactions } = useBankTransactions(account.id);
  const { statements } = useBankStatements(account.id);
  const { statement, lines, isLoading: statementLoading } = useReconciliationStatement(statementId || undefined);
  const { taxRates } = useTaxRates();
  const { accounts: glAccounts } = useGlAccounts();
  const journalIndex = useJournalIndex();
  const { allocateTransaction } = useBankTransactionMutations({
    onSuccess: () => {
      void refetchTransactions();
      void recon.refetch();
    },
  });

  // Default to the most recent statement and adopt its period end + closing balance.
  useEffect(() => {
    if (!statementId && statements.length > 0) setStatementId(statements[0].id);
  }, [statements, statementId]);
  useEffect(() => {
    if (statement) {
      recon.setStatementDate(statement.periodEnd.slice(0, 10));
      recon.setStatementBalance(statement.closingBalance);
    }
    // Only when the chosen statement changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statement?.id]);

  const glAccountName = useMemo(() => {
    const byId = new Map(glAccounts.map((a) => [a.id, `${a.code} ${a.name}`]));
    return (id: ID) => byId.get(id) ?? id;
  }, [glAccounts]);

  const transactionsById = useMemo(() => new Map(transactions.map((t) => [t.id, t])), [transactions]);
  const booksIntegrity = useBooksIntegrity(tab === 'integrity' ? account.id : undefined);
  const wholePeriod = useWholePeriodProof({
    bankAccountId: account.id,
    bankGlAccountId: account.glAccountId,
    windowStart: statement?.periodStart?.slice(0, 10),
    windowEnd: statement?.periodEnd?.slice(0, 10),
    enabled: tab === 'wholePeriod' && Boolean(statement),
  });

  function handleInvestigate() {
    setTab('investigator');
    setInvestigateSignal((n) => n + 1);
  }

  const MISSING_IN_BOOKS_STUB_LABEL: Record<Exclude<MissingInBooksAction, 'search_existing'>, string> = {
    bank_charge: 'Create bank charge',
    interest_income: 'Create interest income',
    expense: 'Create expense',
    allocate_payment: 'Allocate to a payment',
    transfer: 'Create transfer',
  };

  function handleMissingInBooks(action: MissingInBooksAction) {
    // PART D — these OPEN real flows. Today only "search existing" has a
    // destination that takes a bare statement line; the create-*/allocate/
    // transfer flows all require a BankTransaction first. Wired as `// P2`
    // until a "record this statement line" entry point exists — and, so the
    // stub is honest rather than silent, the user is told exactly that.
    if (action === 'search_existing') {
      navigate('/banking/transactions');
      return;
    }
    setMissingInBooksNotice(
      `"${MISSING_IN_BOOKS_STUB_LABEL[action]}" straight from a statement line is coming in a later release. ` +
        'For now, capture it on the Bank Transactions page, then return here to match it.',
    );
  }

  return (
    <>
      <SectionCard>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Statement</span>
          {statements.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No imported statement for this account yet — import one from Bank Transactions.
            </p>
          ) : (
            <Select
              items={statements.map((s) => ({ value: s.id, label: s.sourceFilename ?? `${s.periodStart} – ${s.periodEnd}` }))}
              value={statementId}
              onValueChange={(v) => setStatementId(String(v))}
            >
              <SelectTrigger className="h-9 w-full sm:w-auto sm:min-w-72" aria-label="Select statement to reconcile">
                <SelectValue placeholder="Select a statement" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {statements.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {formatDate(s.periodStart)} – {formatDate(s.periodEnd)}
                      {s.sourceFilename ? ` · ${s.sourceFilename}` : ''} ({s.lineCount} lines)
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        </div>
      </SectionCard>

      {missingInBooksNotice && (
        <SectionCard>
          <div role="status" className="flex items-start justify-between gap-3 text-sm">
            <p className="text-muted-foreground">{missingInBooksNotice}</p>
            <button
              type="button"
              onClick={() => setMissingInBooksNotice(null)}
              className="shrink-0 text-xs font-medium text-brand hover:underline"
            >
              Dismiss
            </button>
          </div>
        </SectionCard>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList variant="line" className="w-full justify-start border-b border-border">
          <TabsTrigger value="workspace">Reconcile {account.name}</TabsTrigger>
          <TabsTrigger value="investigator">Difference Investigator</TabsTrigger>
          <TabsTrigger value="wholePeriod">Whole-period proof</TabsTrigger>
          <TabsTrigger value="integrity">Books Integrity</TabsTrigger>
          <TabsTrigger value="history">History ({recon.history.length})</TabsTrigger>
        </TabsList>

        {/* keepMounted: the workspace holds the selected line, the line filters
            and any open trace sheet in local state — a tab switch to the
            investigator / whole-period proof and back must not reset them. */}
        <TabsContent value="workspace" className="pt-4" keepMounted>
          <ReconciliationWorkspace
            bankAccount={account}
            transactions={transactions}
            statement={statement}
            lines={lines}
            statementLoading={statementLoading}
            investigation={investigator.result}
            glAccountName={glAccountName}
            journalNumberFor={journalIndex.numberFor}
            journalBalancedFor={journalIndex.balancedFor}
            statementDate={recon.statementDate}
            setStatementDate={recon.setStatementDate}
            statementBalance={recon.statementBalance}
            setStatementBalance={recon.setStatementBalance}
            clearedIds={recon.clearedIds}
            toggleCleared={recon.toggleCleared}
            summary={recon.summary}
            isLoading={recon.isLoading}
            isFinalizing={recon.isFinalizing}
            error={recon.error}
            finalize={recon.finalize}
            onFinalized={() => {
              void recon.refetchHistory();
              void refetchTransactions();
            }}
            onInvestigate={handleInvestigate}
            onInvestigateLine={() => handleInvestigate()}
            onAllocate={(txn) => setAllocating(txn)}
            onViewRecord={(id) => navigate(`/banking/transactions?record=${id}`)}
            onMissingInBooksAction={(action) => handleMissingInBooks(action)}
          />
        </TabsContent>

        <TabsContent value="investigator" className="pt-4">
          <DifferenceInvestigatorPanel
            bankAccountId={account.id}
            statementDate={new Date(recon.statementDate).toISOString()}
            statementBalance={recon.statementBalance}
            clearedTransactionIds={Array.from(recon.clearedIds)}
            variance={recon.summary?.variance ?? 0}
            runSignal={investigateSignal}
            controller={investigator}
          />
        </TabsContent>

        <TabsContent value="wholePeriod" className="pt-4">
          {wholePeriod.isLoading && <p className="text-sm text-muted-foreground">Checking both sides of the statement…</p>}
          {wholePeriod.error && <p className="text-sm text-status-negative">{wholePeriod.error.message}</p>}
          {!wholePeriod.isLoading && !wholePeriod.error && <WholePeriodProofPanel proof={wholePeriod.proof} />}
        </TabsContent>

        <TabsContent value="integrity" className="pt-4">
          {booksIntegrity.isLoading && <p className="text-sm text-muted-foreground">Checking…</p>}
          {booksIntegrity.error && <p className="text-sm text-status-negative">{booksIntegrity.error.message}</p>}
          {!booksIntegrity.isLoading && !booksIntegrity.error && <BooksIntegrityPanel results={booksIntegrity.results} />}
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <ReconciliationHistory
            history={recon.history}
            transactionsById={transactionsById}
            onSelectTransaction={(id) => navigate(`/banking/transactions?record=${id}`)}
          />
        </TabsContent>
      </Tabs>

      {allocating && (
        <AllocateTransactionFormModal
          transaction={allocating}
          glAccounts={glAccounts}
          taxRates={taxRates}
          onSubmit={async (allocations) => {
            await allocateTransaction(allocating.id, allocations);
            setAllocating(null);
          }}
          onClose={() => setAllocating(null)}
        />
      )}
    </>
  );
}
