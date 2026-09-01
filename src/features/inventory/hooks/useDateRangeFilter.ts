import { useMemo, useState } from 'react';
import type { FinancialYear } from '@/types';
import { resolveDateRangePreset, type DateRange, type DateRangePreset } from '../reports/dateRange';

export interface UseDateRangeFilterResult {
  preset: DateRangePreset;
  setPreset: (preset: DateRangePreset) => void;
  /** The resolved, effective range — `null` only for `'this_financial_year'` when the company has no financial years yet. */
  range: DateRange | null;
  customStart: string;
  customEnd: string;
  setCustom: (range: { start: string; end: string }) => void;
}

/**
 * Shared preset+custom date-range state for report pages (spec §18) —
 * defaults to `'this_month'`. Switching TO `'custom'` seeds the custom
 * inputs from whatever range was last resolved, so the user edits from a
 * sensible starting point instead of two empty fields.
 */
export function useDateRangeFilter(financialYears: FinancialYear[] = [], referenceDate: Date = new Date()): UseDateRangeFilterResult {
  const [preset, setPresetState] = useState<DateRangePreset>('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const presetRange = useMemo(() => resolveDateRangePreset(preset, referenceDate, financialYears), [preset, referenceDate, financialYears]);

  const range: DateRange | null = preset === 'custom' ? (customStart && customEnd ? { start: customStart, end: customEnd } : null) : presetRange;

  function setPreset(next: DateRangePreset) {
    if (next === 'custom' && preset !== 'custom') {
      const seed = presetRange ?? resolveDateRangePreset('this_month', referenceDate, financialYears);
      setCustomStart(seed?.start ?? '');
      setCustomEnd(seed?.end ?? '');
    }
    setPresetState(next);
  }

  return {
    preset,
    setPreset,
    range,
    customStart: preset === 'custom' ? customStart : (range?.start ?? ''),
    customEnd: preset === 'custom' ? customEnd : (range?.end ?? ''),
    setCustom: ({ start, end }) => {
      setCustomStart(start);
      setCustomEnd(end);
    },
  };
}
