import type { ID, TaxRate } from '@/types';
import type { ITaxRateRepository } from '@/repositories/ITaxRateRepository';
import type { AuditLogService } from '@/services/auditLogService';

export type CreateTaxRateDTO = Omit<TaxRate, 'id' | 'createdAt' | 'updatedAt'>;

/** Fields that define a new *version* of an existing rate code — see supersede(). */
export type SupersedeTaxRateInput = Pick<
  TaxRate,
  'rate' | 'effectiveFrom' | 'sourceReference' | 'treatment' | 'appliesTo' | 'jurisdiction' | 'name'
>;

/**
 * VAT/tax rate configuration engine (SA_ACCOUNTING_MASTER_SPEC.md §9/§12/
 * §82/§113). A `TaxRate` record is immutable once created — `rate` is
 * never edited in place on an existing record. Changing a rate means
 * `supersede()`: close the currently-effective version's `effectiveTo`
 * and create a new version sharing the same `code`, so every historical
 * `DocumentLineItem.taxRateId` still points at the exact version that was
 * in effect when it was posted (§83).
 */
export class TaxRateService {
  constructor(
    private readonly repository: ITaxRateRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  async getTaxRates(): Promise<TaxRate[]> {
    return this.repository.getAll();
  }

  async getActiveTaxRates(): Promise<TaxRate[]> {
    const all = await this.repository.getAll();
    return all.filter((t) => t.isActive);
  }

  /**
   * The one currently-effective version of every active code — what a
   * "pick a tax rate" dropdown for a NEW transaction should offer.
   * Deliberately excludes superseded historical versions (still
   * queryable via getRateHistory()/getEffectiveRate()) so a code with 3
   * versions over time doesn't show up 3 times in a select.
   */
  async getCurrentlyEffectiveRates(asOf: Date = new Date()): Promise<TaxRate[]> {
    const active = await this.getActiveTaxRates();
    const asOfIso = asOf.toISOString();
    return active.filter((t) => {
      if (t.effectiveFrom > asOfIso) return false;
      if (t.effectiveTo && t.effectiveTo < asOfIso) return false;
      return true;
    });
  }

  async getTaxRate(id: ID): Promise<TaxRate | undefined> {
    return this.repository.getById(id);
  }

  /** Every version of a rate code, oldest first — the "rate history" view. */
  async getRateHistory(code: string): Promise<TaxRate[]> {
    const all = await this.repository.getAll();
    return all
      .filter((t) => t.code === code)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  }

  /**
   * Whichever version of `code` was in effect on `asOf` (defaults to
   * now) — the historically-correct lookup for reproducing a past
   * transaction's tax treatment (§83, §112). Returns undefined if no
   * version of this code covers that date.
   */
  async getEffectiveRate(code: string, asOf: Date = new Date()): Promise<TaxRate | undefined> {
    const history = await this.getRateHistory(code);
    const asOfIso = asOf.toISOString();
    return history.find((t) => {
      if (t.effectiveFrom > asOfIso) return false;
      if (t.effectiveTo && t.effectiveTo < asOfIso) return false;
      return true;
    });
  }

  /** The rate a NEW transaction today should use — getEffectiveRate() as of now. */
  async getCurrentRate(code: string): Promise<TaxRate | undefined> {
    return this.getEffectiveRate(code, new Date());
  }

  /** Registers a brand-new tax code (one that has never existed before). */
  async createTaxRate(data: CreateTaxRateDTO): Promise<TaxRate> {
    return this.repository.create({ ...data, id: '', createdAt: '', updatedAt: '' });
  }

  /**
   * Changes a rate code's rate/treatment/etc. going forward WITHOUT
   * touching any existing version — creates a new `TaxRate` row and, if
   * a version of this code is currently open-ended, closes it the day
   * before the new version's `effectiveFrom`. A reason is mandatory
   * (mirrors CompanyService.setReportingFramework()) and the change is
   * audit-logged, since a tax rate change is a control-sensitive action
   * every prior posting must remain unaffected by.
   */
  async supersede(code: string, input: SupersedeTaxRateInput, userId: ID, reason: string): Promise<TaxRate> {
    if (!reason || !reason.trim()) {
      throw new Error('Superseding a tax rate requires a reason.');
    }
    const history = await this.getRateHistory(code);
    const currentlyOpen = history.find((t) => !t.effectiveTo);

    if (currentlyOpen) {
      const dayBefore = new Date(input.effectiveFrom);
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
      if (dayBefore.toISOString() < currentlyOpen.effectiveFrom) {
        throw new Error(
          `Cannot supersede "${code}": new effectiveFrom (${input.effectiveFrom}) is not after the current version's effectiveFrom (${currentlyOpen.effectiveFrom}).`,
        );
      }
      await this.repository.update(currentlyOpen.id, { effectiveTo: dayBefore.toISOString() });
    }

    const created = await this.repository.create({
      id: '',
      code,
      isActive: true,
      ...input,
      createdAt: '',
      updatedAt: '',
    });

    await this.auditLog.log({
      userId,
      action: 'tax_rate_superseded',
      module: 'tax',
      recordType: 'TaxRate',
      recordId: created.id,
      previousValue: currentlyOpen ? { rate: currentlyOpen.rate, effectiveFrom: currentlyOpen.effectiveFrom } : null,
      newValue: { rate: created.rate, effectiveFrom: created.effectiveFrom },
      reason,
    });

    return created;
  }

  /** Deactivates a rate code entirely (e.g. a repealed tax treatment) — existing postings are unaffected. */
  async deactivate(id: ID): Promise<TaxRate> {
    return this.repository.update(id, { isActive: false });
  }
}
