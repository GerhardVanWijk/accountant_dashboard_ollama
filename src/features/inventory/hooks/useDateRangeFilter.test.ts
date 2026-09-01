import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDateRangeFilter } from './useDateRangeFilter';

const ref = new Date(Date.UTC(2026, 8, 15)); // 15 Sep 2026

describe('useDateRangeFilter', () => {
  it('defaults to this_month, resolved', () => {
    const { result } = renderHook(() => useDateRangeFilter([], ref));
    expect(result.current.preset).toBe('this_month');
    expect(result.current.range).toEqual({ start: '2026-09-01', end: '2026-09-30' });
  });

  it('re-resolves the range when the preset changes', () => {
    const { result } = renderHook(() => useDateRangeFilter([], ref));
    act(() => result.current.setPreset('last_month'));
    expect(result.current.range).toEqual({ start: '2026-08-01', end: '2026-08-31' });
  });

  it('seeds custom start/end from the previously resolved range when switching to custom', () => {
    const { result } = renderHook(() => useDateRangeFilter([], ref));
    act(() => result.current.setPreset('custom'));
    expect(result.current.customStart).toBe('2026-09-01');
    expect(result.current.customEnd).toBe('2026-09-30');
    expect(result.current.range).toEqual({ start: '2026-09-01', end: '2026-09-30' });
  });

  it('reflects edits to the custom range once in custom mode', () => {
    const { result } = renderHook(() => useDateRangeFilter([], ref));
    act(() => result.current.setPreset('custom'));
    act(() => result.current.setCustom({ start: '2026-01-01', end: '2026-01-31' }));
    expect(result.current.range).toEqual({ start: '2026-01-01', end: '2026-01-31' });
  });

  it('returns a null range for custom until both dates are filled in', () => {
    const { result } = renderHook(() => useDateRangeFilter([], ref));
    act(() => result.current.setPreset('custom'));
    act(() => result.current.setCustom({ start: '', end: '' }));
    expect(result.current.range).toBeNull();
  });
});
