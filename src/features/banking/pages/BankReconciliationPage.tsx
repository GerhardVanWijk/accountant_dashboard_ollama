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
import { useBankAccounts } from '../hooks/useBankAccounts';
import { useBankReconciliation } from '../hooks/useBankReconciliation';
import { useBankTransactions } from '../hooks/useBankTransactions';
import { ReconciliationWorkspace } from '../components/ReconciliationWorkspace';
import { ReconciliationHistory } from '../components/ReconciliationHistory';
import { DifferenceInvestigatorPanel } from '@/features/reconciliationIntelligence/components/DifferenceInvestigatorPanel';
import { BooksIntegrityPanel } from '@/features/reconciliationIntelligence/components/BooksIntegrityPanel';
import { useBooksIntegrity } from '@/features/reconciliationIntelligence/hooks/useBooksIntegrity';

/**
 * Bank Reconciliation — route `/banking/reconciliation`. Real
 * useBankAccounts()/useBankReconciliation()/BankReconciliationService
 * data. v0's own reconciliation page shows every account's latest
 * reconciliation as a flat list of cards with an "in-progress"/"balanced"/
 * "not-started" status — but a `BankReconciliation` only ever exists as a
 * finalized, immutable snapshot in the real domain (no persisted
 * "in-progress" state; that's exactly what the live workspace below is).
 * The real app already resolved this with a per-account Workspace/History
 * split — kept unchanged, just re-skinned with v0's account-selector and
 * card language, since replacing it with v0's flat multi-account view
 * would mean inventing a reconciliation lifecycle state the backend
 * doesn't have.
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
        description="Match the bank statement against the GL cashbook, clear outstanding items, and finalize once the variance is zero."
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
            Set up a bank account on the Cash & Bank Accounts page before reconciling.
          </p>
        </SectionCard>
      )}

      {!isLoading && selectedAccount && <ReconciliationSection account={selectedAccount} />}
    </div>
  );
}

function ReconciliationSection({ account }: { account: BankAccount }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'workspace' | 'investigator' | 'integrity' | 'history'>('workspace');
  const { history, refetchHistory, statementDate, statementBalance, clearedIds, summary } = useBankReconciliation(account.id);
  const booksIntegrity = useBooksIntegrity(tab === 'integrity' ? account.id : undefined);
  const { transactions } = useBankTransactions(account.id);
  const transactionsById = useMemo(() => new Map(transactions.map((t) => [t.id, t])), [transactions]);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
      <TabsList variant="line" className="w-full justify-start border-b border-border">
        <TabsTrigger value="workspace">Reconcile {account.name}</TabsTrigger>
        <TabsTrigger value="investigator">Difference Investigator</TabsTrigger>
        <TabsTrigger value="integrity">Books Integrity</TabsTrigger>
        <TabsTrigger value="history">History ({history.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="workspace" className="pt-4">
        <ReconciliationWorkspace bankAccount={account} onFinalized={() => void refetchHistory()} />
      </TabsContent>
      <TabsContent value="investigator" className="pt-4">
        <DifferenceInvestigatorPanel
          bankAccountId={account.id}
          statementDate={new Date(statementDate).toISOString()}
          statementBalance={statementBalance}
          clearedTransactionIds={Array.from(clearedIds)}
          variance={summary?.variance ?? 0}
        />
      </TabsContent>
      <TabsContent value="integrity" className="pt-4">
        {booksIntegrity.isLoading && <p className="text-sm text-muted-foreground">Checking…</p>}
        {booksIntegrity.error && <p className="text-sm text-status-negative">{booksIntegrity.error.message}</p>}
        {!booksIntegrity.isLoading && !booksIntegrity.error && <BooksIntegrityPanel results={booksIntegrity.results} />}
      </TabsContent>
      <TabsContent value="history" className="pt-4">
        <ReconciliationHistory
          history={history}
          transactionsById={transactionsById}
          onSelectTransaction={(id) => navigate(`/banking/transactions?record=${id}`)}
        />
      </TabsContent>
    </Tabs>
  );
}
