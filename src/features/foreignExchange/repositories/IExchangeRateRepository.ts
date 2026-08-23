import type { ExchangeRate } from '@/types/foreignExchange';
import type { IRepository } from '@/repositories/IRepository';

/**
 * Exchange rate storage contract. A plain `IRepository<ExchangeRate>` —
 * update/delete are both allowed here, unlike `ITaxRateRepository`'s
 * effective-dated immutability, because an `ExchangeRate` in this pass
 * drives nothing posted (see exchangeRateService.ts's doc comment). This
 * is a much lower-stakes record than a posted GL entry, so there's no need
 * to over-engineer append-only immutability for it yet.
 */
export type IExchangeRateRepository = IRepository<ExchangeRate>;
