import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';

export interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

/**
 * Minimal modal dialog local to the employees feature (no shared
 * src/components/ui Modal exists yet to reuse) — mirrors
 * src/features/assets/components/Modal.tsx exactly, plus an optional
 * `wide` variant for the payslip review table (more columns than a normal
 * form).
 */
export function Modal({ title, onClose, children, wide }: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-md py-2xl md:items-center"
      role="presentation"
    >
      <div className="fixed inset-0 bg-text-primary opacity-40" aria-hidden="true" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full rounded-lg border border-border bg-panel p-lg shadow-lg ${wide ? 'max-w-4xl' : 'max-w-lg'}`}
      >
        <div className="mb-md flex items-center justify-between gap-md">
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-md p-xs text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
