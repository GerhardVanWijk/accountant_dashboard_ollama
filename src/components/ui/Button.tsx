import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-background hover:opacity-90',
  secondary: 'bg-secondary text-background hover:opacity-90',
  ghost: 'bg-transparent text-text-primary border border-border hover:border-primary',
  danger: 'bg-danger text-background hover:opacity-90',
};

/**
 * Base button primitive wired to the design-system color tokens.
 * Feature modules compose this rather than hand-rolling button styles.
 */
export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center gap-xs rounded-md px-md py-sm text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
