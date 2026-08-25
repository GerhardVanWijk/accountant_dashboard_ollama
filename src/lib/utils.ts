import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Ported verbatim from accounting-v0-frontend/lib/utils.ts. Every shadcn
 * component under src/components/ui/shadcn imports `cn` from '@/lib/utils'
 * (the ecosystem's hardcoded convention) — kept as its own file rather than
 * merged into src/utils/cn.ts, which is a different, dependency-free
 * implementation used by this app's own existing UI kit (see its comment:
 * "clsx/cva are not in the approved stack"). Both are intentional and
 * coexist; do not consolidate them.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
