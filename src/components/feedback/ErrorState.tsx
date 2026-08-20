import { AlertTriangle } from 'lucide-react';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

/**
 * Base error indicator. Every feature component's "error" state
 * (docs/ARCHITECTURE.md § Component State) should render this.
 */
export function ErrorState({
  title = 'Something went wrong',
  message = 'The data could not be loaded. Please try again.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-sm rounded-md border border-border bg-panel p-lg text-center"
    >
      <AlertTriangle className="text-danger" size={24} aria-hidden="true" />
      <p className="text-sm font-semibold text-text-primary">{title}</p>
      <p className="text-sm text-text-secondary">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-sm rounded-md border border-border px-md py-xs text-sm text-text-primary hover:border-primary hover:text-primary"
        >
          Retry
        </button>
      )}
    </div>
  );
}
