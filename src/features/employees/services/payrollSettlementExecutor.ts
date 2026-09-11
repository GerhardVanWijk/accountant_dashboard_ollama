import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID } from '@/types';
import { KeyedMutex } from '@/lib/keyedMutex';

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * One logical "settle (part of) a posted payroll run's Net Pay Payable
 * balance" operation — the database-level over-settlement protection the
 * prior pass's `bankTransactionService.recordSubledgerSettlement()` did
 * NOT have (its outstanding-balance cap lived only in the React form).
 *
 * The real executor is the atomic Postgres RPC `settle_payroll_net_pay`
 * (migration 0096): locks the `payroll_runs` row FOR UPDATE, derives the
 * original obligation from the run's OWN posted journal (never the
 * `payslips` rollup, never trusted from the caller), derives already-
 * settled from `subledger_settlements`, rejects an amount that would
 * exceed outstanding, and — only if that passes — posts the DR clearing/
 * CR bank journal, the `bank_transactions` row, and the settlement ledger
 * row, all in the SAME transaction. `RealPayrollSettlementExecutor` calls
 * it; `FakePayrollSettlementExecutor` mirrors its exact contract
 * (including the FOR UPDATE lock's serialising effect, via `KeyedMutex`)
 * for tests.
 */
export interface SettlePayrollNetPayInput {
  settlementId: ID;
  payrollRunId: ID;
  bankAccountId: ID;
  date: string;
  description?: string;
  reference?: string;
  amount: number;
  createdBy?: ID;
}

export interface SettlementRecord {
  id: ID;
  amount: number;
  bankAccountId: ID;
  bankTransactionId?: ID;
  journalEntryId?: ID;
  createdAt: string;
}

export interface SettlePayrollNetPayResult {
  idempotent: boolean;
  settlement: SettlementRecord;
  bankTransactionId: ID;
  journalEntryId: ID;
}

export interface PayrollSettlementExecutor {
  settle(input: SettlePayrollNetPayInput): Promise<SettlePayrollNetPayResult>;
}

interface SettlementRow {
  id: string;
  amount: number | string;
  bank_account_id: string;
  bank_transaction_id: string | null;
  journal_entry_id: string | null;
  created_at: string;
}

function rowToSettlement(row: SettlementRow): SettlementRecord {
  return {
    id: row.id,
    amount: Number(row.amount),
    bankAccountId: row.bank_account_id,
    bankTransactionId: row.bank_transaction_id ?? undefined,
    journalEntryId: row.journal_entry_id ?? undefined,
    createdAt: row.created_at,
  };
}

/** Production: the atomic `settle_payroll_net_pay` RPC (migration 0096). */
export class RealPayrollSettlementExecutor implements PayrollSettlementExecutor {
  constructor(private readonly client: SupabaseClient) {}

  async settle(input: SettlePayrollNetPayInput): Promise<SettlePayrollNetPayResult> {
    const { data, error } = await this.client.rpc('settle_payroll_net_pay', {
      p_settlement_id: input.settlementId,
      p_payroll_run_id: input.payrollRunId,
      p_bank_account_id: input.bankAccountId,
      p_date: input.date,
      p_description: input.description ?? null,
      p_reference: input.reference ?? null,
      p_amount: input.amount,
      p_created_by: input.createdBy ?? null,
    });
    if (error) throw new Error(`settle_payroll_net_pay: ${error.message}`);
    const row = data as { idempotent: boolean; settlement: SettlementRow; bank_transaction_id: string; journal_entry_id: string };
    return {
      idempotent: row.idempotent,
      settlement: rowToSettlement(row.settlement),
      bankTransactionId: row.bank_transaction_id,
      journalEntryId: row.journal_entry_id,
    };
  }
}

/** Minimal surfaces the fake executor needs. */
export interface FakePayrollSettlementExecutorDeps {
  journal: {
    getEntry(id: ID): Promise<{ lines: { accountId: ID; debit: number; credit: number }[] } | undefined>;
    postJournalEntry(input: { date: string; memo?: string; source: string; lines: { accountId: ID; description?: string; debit: number; credit: number }[] }): Promise<{ id: ID }>;
  };
  runs: {
    getById(id: ID): Promise<{ id: ID; runNumber: string; status: string; reversedAt?: string; journalEntryId?: ID; contraAccountId?: ID } | undefined>;
  };
  bankAccounts: {
    getById(id: ID): Promise<{ id: ID; glAccountId: ID } | undefined>;
  };
  bankTransactions: {
    create(entity: unknown): Promise<{ id: ID }>;
  };
  /** Fired after validation (including the outstanding-balance check) but BEFORE any write — proves "no partial state on failure" exactly like a mid-transaction Postgres error would. */
  beforeCommit?: () => void | Promise<void>;
}

/**
 * Test double. Mirrors `settle_payroll_net_pay` step for step, INCLUDING
 * the FOR UPDATE lock's real effect via `KeyedMutex` keyed on
 * `payrollRunId` — two "concurrent" `settle()` calls for the SAME run
 * genuinely serialise here (the second's idempotency-check/outstanding
 * read only runs after the first's write has completed), the same
 * observable guarantee the real row lock provides. Two calls for
 * DIFFERENT runs run fully in parallel, matching the RPC.
 */
export class FakePayrollSettlementExecutor implements PayrollSettlementExecutor {
  private readonly mutex = new KeyedMutex();
  private readonly settlements: (SettlementRecord & { settlementId: ID; payrollRunId: ID })[] = [];
  private seq = 0;

  constructor(private readonly deps: FakePayrollSettlementExecutorDeps) {}

  async settle(input: SettlePayrollNetPayInput): Promise<SettlePayrollNetPayResult> {
    return this.mutex.run(input.payrollRunId, async () => {
      const existing = this.settlements.find((s) => s.settlementId === input.settlementId);
      if (existing) {
        return { idempotent: true, settlement: existing, bankTransactionId: existing.bankTransactionId!, journalEntryId: existing.journalEntryId! };
      }

      if (input.amount == null || input.amount <= 0) {
        throw new Error('settle_payroll_net_pay: amount must be greater than zero');
      }

      const run = await this.deps.runs.getById(input.payrollRunId);
      if (!run) throw new Error(`settle_payroll_net_pay: payroll run ${input.payrollRunId} not found in company`);
      if (run.status !== 'posted') {
        throw new Error(`settle_payroll_net_pay: payroll run ${run.runNumber} is not posted (status: ${run.status}) — nothing to settle`);
      }
      if (run.reversedAt) {
        throw new Error(`settle_payroll_net_pay: payroll run ${run.runNumber} has been reversed — its net pay was never disbursed and cannot be settled`);
      }
      if (!run.journalEntryId || !run.contraAccountId) {
        throw new Error(`settle_payroll_net_pay: payroll run ${run.runNumber} has no posted clearing obligation`);
      }

      const entry = await this.deps.journal.getEntry(run.journalEntryId);
      const originalObligation = round2(
        (entry?.lines ?? []).filter((l) => l.accountId === run.contraAccountId).reduce((sum, l) => sum + (l.credit - l.debit), 0),
      );
      const alreadySettled = round2(this.settlements.filter((s) => s.payrollRunId === input.payrollRunId).reduce((sum, s) => sum + s.amount, 0));
      const outstanding = round2(originalObligation - alreadySettled);

      if (input.amount > outstanding + 0.01) {
        throw new Error(`settle_payroll_net_pay: requested settlement ${input.amount} exceeds outstanding ${outstanding} for payroll run ${run.runNumber}`);
      }

      const bankAccount = await this.deps.bankAccounts.getById(input.bankAccountId);
      if (!bankAccount) throw new Error(`settle_payroll_net_pay: bank account ${input.bankAccountId} not found in company`);

      await this.deps.beforeCommit?.();

      const description = input.description ?? `Net pay settlement - ${run.runNumber}`;
      const je = await this.deps.journal.postJournalEntry({
        date: input.date,
        memo: description,
        source: 'bank_transaction',
        lines: [
          { accountId: run.contraAccountId, description, debit: input.amount, credit: 0 },
          { accountId: bankAccount.glAccountId, description, debit: 0, credit: input.amount },
        ],
      });

      const bankTxn = await this.deps.bankTransactions.create({
        bankAccountId: input.bankAccountId,
        date: input.date,
        description,
        reference: input.reference,
        amount: input.amount,
        direction: 'credit',
        status: 'matched',
        source: 'manual',
        journalEntryId: je.id,
        matchedEntityType: 'payroll_run',
        matchedEntityId: input.payrollRunId,
        allocations: [{ id: `stl_${++this.seq}`, glAccountId: run.contraAccountId, description, netAmount: input.amount, taxAmount: 0 }],
      });

      const settlement: SettlementRecord & { settlementId: ID; payrollRunId: ID } = {
        id: `sst_${++this.seq}`,
        settlementId: input.settlementId,
        payrollRunId: input.payrollRunId,
        amount: input.amount,
        bankAccountId: input.bankAccountId,
        bankTransactionId: bankTxn.id,
        journalEntryId: je.id,
        createdAt: new Date().toISOString(),
      };
      this.settlements.push(settlement);

      return { idempotent: false, settlement, bankTransactionId: bankTxn.id, journalEntryId: je.id };
    });
  }
}
