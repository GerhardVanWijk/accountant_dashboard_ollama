import type { ID } from '@/types/common';
import type { LeaseContract } from '@/types/lease';
import type { ILeaseRepository } from '../repositories/ILeaseRepository';
import type { AccountMapper } from '@/features/accounting/services';
import { calculateLeaseLiabilityPresentValue } from './leaseCalculations';
import type { LeaseCommencementExecutor } from './leaseCommencementExecutor';
import { newUuid } from '@/lib/uuid';

export type CreateLeaseDTO = Pick<
  LeaseContract,
  'lessorName' | 'assetDescription' | 'commencementDate' | 'leaseTermMonths' | 'monthlyPayment' | 'discountRatePercent'
>;
export type UpdateLeaseDTO = Partial<CreateLeaseDTO>;

/** Shared economics validation for both createLease() and updateLease() — one lease, two entry points, must agree on what's a valid lease. */
function validateLeaseEconomics(data: { leaseTermMonths: number; monthlyPayment: number; discountRatePercent: number }): void {
  if (data.leaseTermMonths <= 0) {
    throw new Error('Lease term must be greater than zero months.');
  }
  if (data.monthlyPayment <= 0) {
    throw new Error('Monthly payment must be greater than zero.');
  }
  if (data.discountRatePercent < 0) {
    throw new Error('Discount rate cannot be negative.');
  }
}

/**
 * Business-logic layer for the Lease Register (lessee accounting only —
 * SA_ACCOUNTING_MASTER_SPEC.md §32, §47/IFRS 16). Mirrors
 * fixedAssetService.ts's draft-then-post lifecycle: a lease is registered
 * as a 'draft' with its present-value liability/ROU asset already computed
 * (so the user can review the figures before anything hits the GL), and
 * only becomes real, immutable accounting history once postCommencement()
 * posts the capitalization entry.
 */
export class LeaseService {
  constructor(
    private readonly repository: ILeaseRepository,
    private readonly commencementExecutor: LeaseCommencementExecutor,
    private readonly accounts: AccountMapper,
  ) {}

  async getLeases(): Promise<LeaseContract[]> {
    return this.repository.getAll();
  }

  async getLease(id: ID): Promise<LeaseContract | undefined> {
    return this.repository.getById(id);
  }

  /**
   * Registers a new draft lease. `initialLeaseLiability`/
   * `initialRightOfUseAsset` are computed here from the payment annuity's
   * present value (calculateLeaseLiabilityPresentValue()) and never
   * recomputed except by a later updateLease() while still a draft.
   * `outstandingLeaseLiability` starts at 0, NOT at the computed PV — it
   * only becomes the real running balance once postCommencement() posts
   * the capitalization entry, mirroring FixedAsset's "no GL history, no
   * derived running totals until capitalized" discipline exactly.
   */
  async createLease(data: CreateLeaseDTO): Promise<LeaseContract> {
    validateLeaseEconomics(data);

    const leaseNumber = await this.nextLeaseNumber();
    const pv = calculateLeaseLiabilityPresentValue(data.monthlyPayment, data.leaseTermMonths, data.discountRatePercent);
    const now = new Date().toISOString();

    return this.repository.create({
      id: '',
      leaseNumber,
      lessorName: data.lessorName,
      assetDescription: data.assetDescription,
      commencementDate: data.commencementDate,
      leaseTermMonths: data.leaseTermMonths,
      monthlyPayment: data.monthlyPayment,
      discountRatePercent: data.discountRatePercent,
      status: 'draft',
      initialLeaseLiability: pv,
      initialRightOfUseAsset: pv,
      accumulatedDepreciation: 0,
      outstandingLeaseLiability: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Only a 'draft' lease can be edited — once postCommencement() has
   * posted the capitalization entry, the lease's economics are real GL
   * history and editing them here would silently desync the register from
   * what was actually posted, same class of guard as
   * fixedAssetService.updateFixedAsset()'s locked-field guard (applied
   * here to the whole record, not just a subset of fields, since a draft
   * lease has no posted history at all to protect). Any change to
   * term/payment/rate recomputes the present value so the draft always
   * reflects what would actually be posted.
   */
  async updateLease(id: ID, patch: UpdateLeaseDTO): Promise<LeaseContract> {
    const lease = await this.repository.getById(id);
    if (!lease) {
      throw new Error(`Lease "${id}" not found.`);
    }
    if (lease.status !== 'draft') {
      throw new Error(
        `Cannot edit lease "${lease.leaseNumber}": it has already commenced (status: ${lease.status}). Only a draft lease can be edited.`,
      );
    }

    const merged = {
      leaseTermMonths: patch.leaseTermMonths ?? lease.leaseTermMonths,
      monthlyPayment: patch.monthlyPayment ?? lease.monthlyPayment,
      discountRatePercent: patch.discountRatePercent ?? lease.discountRatePercent,
    };
    validateLeaseEconomics(merged);
    const pv = calculateLeaseLiabilityPresentValue(merged.monthlyPayment, merged.leaseTermMonths, merged.discountRatePercent);

    return this.repository.update(id, {
      ...patch,
      initialLeaseLiability: pv,
      initialRightOfUseAsset: pv,
    });
  }

  /**
   * Permanently removes a draft lease. Anything past 'draft' has real
   * posted GL history behind it and must never be deleted
   * (SA_ACCOUNTING_MASTER_SPEC.md §14/§36/§72/§79), same rule as every
   * other posted-document delete guard in this codebase.
   */
  async deleteLease(id: ID): Promise<void> {
    const lease = await this.repository.getById(id);
    if (!lease) {
      throw new Error(`Lease "${id}" not found.`);
    }
    if (lease.status !== 'draft') {
      throw new Error(`Cannot delete "${lease.leaseNumber}": only a draft (not yet commenced) lease can be deleted (current status: ${lease.status}).`);
    }
    return this.repository.delete(id);
  }

  /**
   * Commences a draft lease: posts DR Right-of-Use Assets (acc_1700) / CR
   * Lease Liability (acc_2450) for the full `initialLeaseLiability`, then
   * flips the lease to 'active' and records the journal entry id. Unlike
   * fixedAssetService.postAcquisition(), there is no funding-account
   * choice here — the credit side is always the Lease Liability itself
   * (the payable created by the lease contract), not a bank/AP account the
   * user selects, so this takes no contra-account parameter.
   *
   * Posts through `commencementExecutor` — one atomic RPC call
   * (`post_lease_commencement`, migration 0088) that posts the journal AND
   * flips the lease to 'active' in the SAME database transaction (Leases +
   * Payroll integrity audit, PART 1). Before this, the journal post and the
   * lease status update were two independent Supabase calls; a failure
   * between them could leave a posted capitalization journal with the
   * lease still showing 'draft', and a retry would double-capitalize it.
   * The `commencementId` is a fresh client-generated token per call — a
   * genuine retry of the SAME logical commencement should re-use it (this
   * method does not itself retry, so each call gets a fresh one; a caller
   * that wraps this in its own retry logic should generate the id once,
   * outside the retry loop).
   */
  async postCommencement(id: ID, postedByUserId?: ID): Promise<LeaseContract> {
    const lease = await this.repository.getById(id);
    if (!lease) {
      throw new Error(`Lease "${id}" not found.`);
    }
    if (lease.status !== 'draft') {
      throw new Error(`Lease "${lease.leaseNumber}" has already commenced (status: ${lease.status}).`);
    }

    const memo = `Commence lease ${lease.leaseNumber} - ${lease.assetDescription}`;
    const [rightOfUseAssetId, leaseLiabilityId] = await Promise.all([
      this.accounts.getAccountId('RIGHT_OF_USE_ASSET'),
      this.accounts.getAccountId('LEASE_LIABILITY'),
    ]);

    const result = await this.commencementExecutor.postCommencement({
      commencementId: newUuid(),
      leaseId: id,
      commencementDate: lease.commencementDate,
      memo,
      source: 'lease_commencement',
      rightOfUseAssetAccountId: rightOfUseAssetId,
      leaseLiabilityAccountId: leaseLiabilityId,
      createdBy: postedByUserId,
    });

    return result.lease;
  }

  /** Mirrors FixedAssetService.nextAssetNumber()'s shape — sequential, based on register size. */
  private async nextLeaseNumber(): Promise<string> {
    const leases = await this.repository.getAll();
    return `LSE-${String(leases.length + 1).padStart(4, '0')}`;
  }
}
