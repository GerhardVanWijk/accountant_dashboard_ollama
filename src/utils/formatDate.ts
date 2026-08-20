import { format, parseISO } from 'date-fns';
import type { ISODateString } from '@/types';

/** Formats an ISO date string using the given date-fns pattern (default: 20 Aug 2026). */
export function formatDate(value: ISODateString, pattern = 'd MMM yyyy'): string {
  return format(parseISO(value), pattern);
}
