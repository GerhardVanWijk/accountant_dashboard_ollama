import { ExchangeRateService } from './exchangeRateService';
import { exchangeRateRepository } from '../repositories/instances';

export type { CreateExchangeRateDTO, UpdateExchangeRateDTO } from './exchangeRateService';
export { ExchangeRateService } from './exchangeRateService';
export type { FxPositionType } from './fxCalculations';
export {
  round2,
  convertAmount,
  calculateRealizedFxGainLoss,
  calculateUnrealizedFxGainLoss,
} from './fxCalculations';

/**
 * Wires ExchangeRateService to the shared mock repository instance. No GL
 * posting singleton is wired here — nothing posts yet, see
 * exchangeRateService.ts's scope-boundary doc comment. Hooks depend on
 * this singleton instead of importing the repository directly.
 */
export const exchangeRateService = new ExchangeRateService(exchangeRateRepository);
