import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { BankAccount } from '@/types';
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
import { useTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useBankAccounts } from '../hooks/useBankAccounts';
import { useBankReconciliation } from '../hooks/useBankReconciliation';
import { useBankTransactions } from '../hooks/useBankTransactions';
import { useBankTransactionMutations } from '../hooks/useBankTransactionMutations';
import { useGlAccounts } from '../hooks/useGlAccounts';
import { ReconciliationWorkspace } from '../components/ReconciliationWorkspace';
import { ReconciliationHistory } from '../components/ReconciliationHistory';
import { AllocateTransactionFormModal } from '../components/AllocateTransactionFormModal';
import type { BankTransactionWithAllocations } from '../types';
import { DifferenceInvestigatorPanel } from '@/features/reconciliationIntelligence/components/DifferenceInvestigatorPanel';
import { BooksIntegrityPanel } from '@/features/reconciliationIntelligence/components/BooksIntegrityPanel';
import { useBooksIntegrity } from '@/features/reconciliationIntelligence/hooks/useBooksIntegrity';

/**
 * Bank Reconciliation — route `/banking/reconciliation`.
 *
 * The workspace is a two-pane accountant surface (docs/CURRENT_TASKS.md
 * #14–#17): statement lines on the left, per-line actions on the right,
 * with the Difference Investigator reachable from the header and running
 * against the SAME statement date / balance / cleared selection the
 * workspace holds (previously the investigator tab had its own disconnected
 * copy of that state and always saw the defaults). Reconciliation
 * lifecycle state is still the real "immutable finalized snapshot" model —
 * there is no persisted "in progress" reconciliation; the workspace IS the
 * in-progress state.
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
        description="Match the bank statement against the GL cashbook line by line, clear outstanding items, and finalize once the variance is zero."
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
  const [tab, setTab] = useState<'workspace' | 'investigator' | 'integrity' | 'history'>('workspace');
  const [investigateSignal, setInvestigateSignal] = useState(0);
  const [allocating, setAllocating] = useState<BankTransactionWithAllocations | null>(null);

  const recon = useBankReconciliation(account.id);
  const { transactions, refetch: refetchTransactions } = useBankTransactions(account.id);
  const { taxRates } = useTaxRates();
  const { accounts: glAccounts } = useGlAccounts();
  const { allocateTransaction } = useBankTransactionMutations({
    onSuccess: () => {
      void refetchTransactions();
      void recon.refetch();
    },
  });

  const transactionsById = useMemo(() => new Map(transactions.map((t) => [t.id, t])), [transactions]);
  const booksIntegrity = useBooksIntegrity(tab === 'integrity' ? account.id : undefined);

  function handleInvestigate() {
    setTab('investigator');
    setInvestigateSignal((n) => n + 1);
  }

  return (
    <>
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList variant="line" className="w-full justify-start border-b border-border">
          <TabsTrigger value="workspace">Reconcile {account.name}</TabsTrigger>
          <TabsTrigger value="investigator">Difference Investigator</TabsTrigger>
          <TabsTrigger value="integrity">Books Integrity</TabsTrigger>
          <TabsTrigger value="history">History ({recon.history.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="workspace" className="pt-4">
          <ReconciliationWorkspace
            bankAccount={account}
            transactions={transactions}
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
            onAllocate={(txn) => setAllocating(txn)}
            onViewRecord={(id) => navigate(`/banking/transactions?record=${id}`)}
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
          />
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
