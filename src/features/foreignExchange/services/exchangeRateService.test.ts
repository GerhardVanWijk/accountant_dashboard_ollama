import { beforeEach, describe, expect, it } from 'vitest';
import { ExchangeRateService } from './exchangeRateService';
import { MockExchangeRateRepository } from '../repositories/MockExchangeRateRepository';

describe('ExchangeRateService', () => {
  let service: ExchangeRateService;

  beforeEach(() => {
    // Empty repository — no seed data — so every test controls its own fixtures.
    service = new ExchangeRateService(new MockExchangeRateRepository([]));
  });

  describe('getRateForDate', () => {
    it('resolves the most recent rate on or before the given date', async () => {
      await service.createRate({ fromCurrency: 'USD', toCurrency: 'ZAR', rate: 18.0, rateDate: '2026-07-01T00:00:00.000Z', sourceReference: 'a' });
      await service.createRate({ fromCurrency: 'USD', toCurrency: 'ZAR', rate: 18.5, rateDate: '2026-08-01T00:00:00.000Z', sourceReference: 'b' });
      await service.createRate({ fromCurrency: 'USD', toCurrency: 'ZAR', rate: 19.0, rateDate: '2026-09-01T00:00:00.000Z', sourceReference: 'c' });

      const found = await service.getRateForDate('USD', 'ZAR', '2026-08-15T00:00:00.000Z');
      expect(found?.rate).toBe(18.5);
    });

    it('resolves the exact rate when the date matches a rateDate exactly', async () => {
      await service.createRate({ fromCurrency: 'USD', toCurrency: 'ZAR', rate: 18.5, rateDate: '2026-08-01T00:00:00.000Z', sourceReference: 'b' });
      const found = await service.getRateForDate('USD', 'ZAR', '2026-08-01T00:00:00.000Z');
      expect(found?.rate).toBe(18.5);
    });

    it('never picks a rate dated AFTER the requested date', async () => {
      await service.createRate({ fromCurrency: 'USD', toCurrency: 'ZAR', rate: 19.0, rateDate: '2026-09-01T00:00:00.000Z', sourceReference: 'future' });
      const found = await service.getRateForDate('USD', 'ZAR', '2026-08-15T00:00:00.000Z');
      expect(found).toBeUndefined();
    });

    it('returns undefined when no rate exists at all for the pair', async () => {
      const found = await service.getRateForDate('GBP', 'ZAR', '2026-08-15T00:00:00.000Z');
      expect(found).toBeUndefined();
    });

    it('never guesses across currency pairs — a EUR/ZAR rate does not satisfy a USD/ZAR lookup', async () => {
      await service.createRate({ fromCurrency: 'EUR', toCurrency: 'ZAR', rate: 19.75, rateDate: '2026-08-01T00:00:00.000Z', sourceReference: 'eur' });
      const found = await service.getRateForDate('USD', 'ZAR', '2026-08-15T00:00:00.000Z');
      expect(found).toBeUndefined();
    });
  });

  describe('getRatesForPair', () => {
    it('returns every rate for the pair, most recent rateDate first', async () => {
      await service.createRate({ fromCurrency: 'USD', toCurrency: 'ZAR', rate: 18.0, rateDate: '2026-07-01T00:00:00.000Z', sourceReference: 'a' });
      await service.createRate({ fromCurrency: 'USD', toCurrency: 'ZAR', rate: 18.5, rateDate: '2026-08-01T00:00:00.000Z', sourceReference: 'b' });

      const rates = await service.getRatesForPair('USD', 'ZAR');
      expect(rates.map((r) => r.rate)).toEqual([18.5, 18.0]);
    });
  });

  describe('createRate / updateRate / deleteRate', () => {
    it('creates, updates, and deletes a rate', async () => {
      const created = await service.createRate({ fromCurrency: 'GBP', toCurrency: 'ZAR', rate: 23.1, rateDate: '2026-08-01T00:00:00.000Z', sourceReference: 'seed' });
      expect(created.id).toBeTruthy();

      const updated = await service.updateRate(created.id, { rate: 23.5 });
      expect(updated.rate).toBe(23.5);

      await service.deleteRate(created.id);
      expect(await service.getRate(created.id)).toBeUndefined();
    });
  });
});
