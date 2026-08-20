import { Loader2 } from 'lucide-react';

export interface SpinnerProps {
  label?: string;
  size?: number;
}

/**
 * Base loading indicator. Every feature component's "loading" state
 * (docs/ARCHITECTURE.md § Component State) should render this rather
 * than a bespoke spinner.
 */
export function Spinner({ label = 'Loading…', size = 20 }: SpinnerProps) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-sm p-lg text-text-secondary"
    >
      <Loader2 className="animate-spin" size={size} aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
