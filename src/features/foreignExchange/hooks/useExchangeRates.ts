import { useCallback, useEffect, useState } from 'react';
import type { ExchangeRate } from '@/types/foreignExchange';
import { exchangeRateService, type CreateExchangeRateDTO, type UpdateExchangeRateDTO } from '../services';

/**
 * Drives the Exchange Rates settings page: every rate ever recorded, plus
 * create/update/delete actions. Thin Component→Hook→Service chain, mirrors
 * src/features/tax/hooks/useTaxRateManagement.ts.
 */
export function useExchangeRates() {
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    exchangeRateService
      .getRates()
      .then((data) => {
        if (!cancelled) setRates(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to load exchange rates'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  async function createRate(data: CreateExchangeRateDTO): Promise<ExchangeRate> {
    const created = await exchangeRateService.createRate(data);
    refetch();
    return created;
  }

  async function updateRate(id: string, patch: UpdateExchangeRateDTO): Promise<ExchangeRate> {
    const updated = await exchangeRateService.updateRate(id, patch);
    refetch();
    return updated;
  }

  async function deleteRate(id: string): Promise<void> {
    await exchangeRateService.deleteRate(id);
    refetch();
  }

  return { rates, loading, error, refetch, createRate, updateRate, deleteRate };
}
