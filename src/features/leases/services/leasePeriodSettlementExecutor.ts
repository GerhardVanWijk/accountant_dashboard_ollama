import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID } from '@/types';
import { KeyedMutex } from '@/lib/keyedMutex';

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * One logical "settle (part of) ONE lease amortization period's Lease
 * Payment Clearing obligation" operation — FINAL HARDENING PART A
 * (database-level over-settlement protection) + PART B (a lease's clearing
 * balance is tracked per amortization PERIOD, not one cumulative figure
 * per lease — `sourceId` here is a `LeaseAmortizationEntry` id, not a
 * `LeaseContract` id).
 *
 * The real executor is the atomic Postgres RPC
 * `settle_lease_period_payment` (migration 0097): locks the specific
 * `lease_amortization_entries` row FOR UPDATE, derives the original
 * obligation directly off that row's own `interest_amount +
 * principal_amount` (the exact figures `post_lease_amortization_period`
 * already posted), derives already-settled from `subledger_settlements`
 * scoped to that SAME entry id, rejects an amount that would exceed
 * outstanding, and — only if that passes — posts the DR 2460 Lease Payment
 * Clearing / CR bank journal, the `bank_transactions` row, and the
 * settlement ledger row, all in the SAME transaction. Never touches acc_1700
 * (Right-of-Use Asset) or acc_2450 (Lease Liability). `RealLeasePeriodSettlementExecutor`
 * calls it; `FakeLeasePeriodSettlementExecutor` mirrors its exact contract
 * (including the FOR UPDATE lock's serialising effect, via `KeyedMutex`
 * keyed on the entry id) for tests.
 */
export interface SettleLeasePeriodPaymentInput {
  settlementId: ID;
  leaseAmortizationEntryId: ID;
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

export interface SettleLeasePeriodPaymentResult {
  idempotent: boolean;
  settlement: SettlementRecord;
  bankTransactionId: ID;
  journalEntryId: ID;
}

export interface LeasePeriodSettlementExecutor {
  settle(input: SettleLeasePeriodPaymentInput): Promise<SettleLeasePeriodPaymentResult>;
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

/** Production: the atomic `settle_lease_period_payment` RPC (migration 0097). */
export class RealLeasePeriodSettlementExecutor implements LeasePeriodSettlementExecutor {
  constructor(private readonly client: SupabaseClient) {}

  async settle(input: SettleLeasePeriodPaymentInput): Promise<SettleLeasePeriodPaymentResult> {
    const { data, error } = await this.client.rpc('settle_lease_period_payment', {
      p_settlement_id: input.settlementId,
      p_lease_amortization_entry_id: input.leaseAmortizationEntryId,
      p_bank_account_id: input.bankAccountId,
      p_date: input.date,
      p_description: input.description ?? null,
      p_reference: input.reference ?? null,
      p_amount: input.amount,
      p_created_by: input.createdBy ?? null,
    });
    if (error) throw new Error(`settle_lease_period_payment: ${error.message}`);
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
export interface FakeLeasePeriodSettlementExecutorDeps {
  journal: {
    postJournalEntry(input: { date: string; memo?: string; source: string; lines: { accountId: ID; description?: string; debit: number; credit: number }[] }): Promise<{ id: ID }>;
  };
  amortizationEntries: {
    getById(id: ID): Promise<{ id: ID; leaseId: ID; periodEnd: string; interestAmount: number; principalAmount: number } | undefined>;
  };
  leases: {
    getById(id: ID): Promise<{ id: ID; leaseNumber: string } | undefined>;
  };
  bankAccounts: {
    getById(id: ID): Promise<{ id: ID; glAccountId: ID } | undefined>;
  };
  bankTransactions: {
    create(entity: unknown): Promise<{ id: ID }>;
  };
  /** The 2460 Lease Payment Clearing account id — resolved by code, same as post_lease_amortization_period. */
  clearingAccountId: ID;
  /** Fired after validation (including the outstanding-balance check) but BEFORE any write. */
  beforeCommit?: () => void | Promise<void>;
}

/**
 * Test double. Mirrors `settle_lease_period_payment` step for step,
 * INCLUDING the FOR UPDATE lock's real effect via `KeyedMutex` keyed on
 * `leaseAmortizationEntryId` (NOT the lease id — two concurrent
 * settlements against DIFFERENT periods of the SAME lease must NOT
 * contend, matching the RPC's per-period lock).
 */
export class FakeLeasePeriodSettlementExecutor implements LeasePeriodSettlementExecutor {
  private readonly mutex = new KeyedMutex();
  private readonly settlements: (SettlementRecord & { settlementId: ID; entryId: ID })[] = [];
  private seq = 0;

  constructor(private readonly deps: FakeLeasePeriodSettlementExecutorDeps) {}

  async settle(input: SettleLeasePeriodPaymentInput): Promise<SettleLeasePeriodPaymentResult> {
    return this.mutex.run(input.leaseAmortizationEntryId, async () => {
      const existing = this.settlements.find((s) => s.settlementId === input.settlementId);
      if (existing) {
        return { idempotent: true, settlement: existing, bankTransactionId: existing.bankTransactionId!, journalEntryId: existing.journalEntryId! };
      }

      if (input.amount == null || input.amount <= 0) {
        throw new Error('settle_lease_period_payment: amount must be greater than zero');
      }

      const entry = await this.deps.amortizationEntries.getById(input.leaseAmortizationEntryId);
      if (!entry) throw new Error(`settle_lease_period_payment: lease amortization entry ${input.leaseAmortizationEntryId} not found in company`);
      const lease = await this.deps.leases.getById(entry.leaseId);
      if (!lease) throw new Error(`settle_lease_period_payment: lease ${entry.leaseId} not found in company`);

      const originalObligation = round2(entry.interestAmount + entry.principalAmount);
      const alreadySettled = round2(this.settlements.filter((s) => s.entryId === input.leaseAmortizationEntryId).reduce((sum, s) => sum + s.amount, 0));
      const outstanding = round2(originalObligation - alreadySettled);

      if (input.amount > outstanding + 0.01) {
        throw new Error(
          `settle_lease_period_payment: requested settlement ${input.amount} exceeds outstanding ${outstanding} for lease ${lease.leaseNumber} period ending ${entry.periodEnd}`,
        );
      }

      const bankAccount = await this.deps.bankAccounts.getById(input.bankAccountId);
      if (!bankAccount) throw new Error(`settle_lease_period_payment: bank account ${input.bankAccountId} not found in company`);

      await this.deps.beforeCommit?.();

      const description = input.description ?? `Lease payment settlement - ${lease.leaseNumber} (${entry.periodEnd})`;
      const je = await this.deps.journal.postJournalEntry({
        date: input.date,
        memo: description,
        source: 'bank_transaction',
        lines: [
          { accountId: this.deps.clearingAccountId, description, debit: input.amount, credit: 0 },
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
        matchedEntityType: 'lease_amortization_entry',
        matchedEntityId: input.leaseAmortizationEntryId,
        allocations: [{ id: `stl_${++this.seq}`, glAccountId: this.deps.clearingAccountId, description, netAmount: input.amount, taxAmount: 0 }],
      });

      const settlement: SettlementRecord & { settlementId: ID; entryId: ID } = {
        id: `sst_${++this.seq}`,
        settlementId: input.settlementId,
        entryId: input.leaseAmortizationEntryId,
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
