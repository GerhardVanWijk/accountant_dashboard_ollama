import type { ExchangeRate } from '@/types/foreignExchange';
import type { IExchangeRateRepository } from './IExchangeRateRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `fx_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * A handful of illustrative seed rates so the FX Calculator page
 * (src/features/foreignExchange/pages/FxCalculatorPage.tsx) has something
 * to auto-fill from out of the box. Every `sourceReference` says plainly
 * that these are placeholder, manually-entered figures — NOT a verified
 * market feed — per SA_ACCOUNTING_MASTER_SPEC.md §110/§111. A real
 * bookkeeper replaces/supersedes these via the Exchange Rates page before
 * relying on them for anything.
 */
const seedExchangeRates: ExchangeRate[] = [
  {
    id: 'fx_seed_usd_1',
    fromCurrency: 'USD',
    toCurrency: 'ZAR',
    rate: 18.0,
    rateDate: '2026-07-01T00:00:00.000Z',
    sourceReference: 'Illustrative seed data only — manually entered placeholder, not a verified market rate.',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
  {
    id: 'fx_seed_usd_2',
    fromCurrency: 'USD',
    toCurrency: 'ZAR',
    rate: 18.5,
    rateDate: '2026-08-01T00:00:00.000Z',
    sourceReference: 'Illustrative seed data only — manually entered placeholder, not a verified market rate.',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'fx_seed_eur_1',
    fromCurrency: 'EUR',
    toCurrency: 'ZAR',
    rate: 19.75,
    rateDate: '2026-08-01T00:00:00.000Z',
    sourceReference: 'Illustrative seed data only — manually entered placeholder, not a verified market rate.',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'fx_seed_gbp_1',
    fromCurrency: 'GBP',
    toCurrency: 'ZAR',
    rate: 23.1,
    rateDate: '2026-08-01T00:00:00.000Z',
    sourceReference: 'Illustrative seed data only — manually entered placeholder, not a verified market rate.',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
];

/** In-memory implementation of IExchangeRateRepository, mirroring MockFixedAssetRepository.ts's shape. */
export class MockExchangeRateRepository implements IExchangeRateRepository {
  private rates: ExchangeRate[];

  constructor(initialData: ExchangeRate[] = seedExchangeRates) {
    this.rates = initialData.map((r) => ({ ...r }));
  }

  async getAll(): Promise<ExchangeRate[]> {
    return this.rates.map((r) => ({ ...r }));
  }

  async getById(id: string): Promise<ExchangeRate | undefined> {
    const found = this.rates.find((r) => r.id === id);
    return found ? { ...found } : undefined;
  }

  async create(entity: ExchangeRate): Promise<ExchangeRate> {
    const now = nowISO();
    const record: ExchangeRate = { ...entity, id: entity.id || generateId(), createdAt: now, updatedAt: now };
    this.rates.push(record);
    return { ...record };
  }

  async update(id: string, patch: Partial<ExchangeRate>): Promise<ExchangeRate> {
    const index = this.rates.findIndex((r) => r.id === id);
    if (index === -1) {
      throw new Error(`MockExchangeRateRepository: exchange rate "${id}" not found`);
    }
    const updated: ExchangeRate = { ...this.rates[index], ...patch, id: this.rates[index].id, updatedAt: nowISO() };
    this.rates[index] = updated;
    return { ...updated };
  }

  async delete(id: string): Promise<void> {
    const index = this.rates.findIndex((r) => r.id === id);
    if (index === -1) {
      throw new Error(`MockExchangeRateRepository: exchange rate "${id}" not found`);
    }
    this.rates.splice(index, 1);
  }
}
