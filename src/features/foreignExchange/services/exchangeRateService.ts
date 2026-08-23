import type { ExchangeRate } from '@/types/foreignExchange';
import type { ID, ISODateString, CurrencyCode } from '@/types/common';
import type { IExchangeRateRepository } from '../repositories/IExchangeRateRepository';

export type CreateExchangeRateDTO = Omit<ExchangeRate, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateExchangeRateDTO = Partial<CreateExchangeRateDTO>;

/**
 * Exchange rate engine (SA_ACCOUNTING_MASTER_SPEC.md §33). Rates are
 * point-in-time (one rate per currency pair per date) rather than
 * effective-dated ranges like `TaxRate` — see `ExchangeRate`'s doc comment
 * (src/types/foreignExchange.ts). The repository is a plain, fully mutable
 * `IRepository<ExchangeRate>` (update/delete allowed): unlike `TaxRate`,
 * which forbids in-place edits because it drives real posted tax
 * calculations, an `ExchangeRate` here drives nothing posted — see the
 * scope note below — so this codebase doesn't need to over-engineer
 * immutability for it yet. As a matter of PROCESS (not a system
 * constraint), a wrong rate should be superseded by a new rate for the
 * same date rather than edited, since a real market rate for a specific
 * date shouldn't retroactively change — but the UI/service don't enforce
 * that, they just make update/delete available like any other reference
 * record.
 *
 * SCOPE BOUNDARY: this service is a standalone rate engine plus
 * hand-computable gain/loss math (fxCalculations.ts), ready to wire into
 * real documents once foreign-currency Customers/Suppliers/Invoices/
 * Bills/BankAccounts exist. Nothing in this codebase's document types
 * carries a transaction currency distinct from the functional currency
 * (ZAR) today, so nothing here posts to the GL yet — see
 * docs/SA_SPEC_GAP_ANALYSIS.md's Phase 12 entry for the full picture.
 */
export class ExchangeRateService {
  constructor(private readonly repository: IExchangeRateRepository) {}

  async getRates(): Promise<ExchangeRate[]> {
    return this.repository.getAll();
  }

  async getRate(id: ID): Promise<ExchangeRate | undefined> {
    return this.repository.getById(id);
  }

  /** Every rate ever recorded for one currency pair, most recent `rateDate` first. */
  async getRatesForPair(fromCurrency: CurrencyCode, toCurrency: CurrencyCode): Promise<ExchangeRate[]> {
    const all = await this.repository.getAll();
    return all
      .filter((r) => r.fromCurrency === fromCurrency && r.toCurrency === toCurrency)
      .sort((a, b) => b.rateDate.localeCompare(a.rateDate));
  }

  /**
   * The rate to use for a transaction/revaluation on `date`: the MOST
   * RECENT rate for this currency pair with `rateDate <= date` — a "last
   * known rate" lookup, same idea as this codebase's other effective-dated
   * lookups (e.g. TaxRateService.getEffectiveRate()) but simpler since
   * there's no upper bound to check. Returns `undefined` if no rate for
   * this pair exists on or before `date` — callers must handle "no rate
   * available" themselves; this NEVER guesses or interpolates between
   * rates.
   */
  async getRateForDate(
    fromCurrency: CurrencyCode,
    toCurrency: CurrencyCode,
    date: ISODateString,
  ): Promise<ExchangeRate | undefined> {
    const forPair = await this.getRatesForPair(fromCurrency, toCurrency);
    const targetDate = date.slice(0, 10);
    return forPair.find((r) => r.rateDate.slice(0, 10) <= targetDate);
  }

  async createRate(data: CreateExchangeRateDTO): Promise<ExchangeRate> {
    return this.repository.create({ ...data, id: '', createdAt: '', updatedAt: '' });
  }

  async updateRate(id: ID, patch: UpdateExchangeRateDTO): Promise<ExchangeRate> {
    return this.repository.update(id, patch);
  }

  async deleteRate(id: ID): Promise<void> {
    return this.repository.delete(id);
  }
}
