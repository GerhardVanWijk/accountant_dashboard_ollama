import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/**
 * Accent-filled variants (primary/secondary/danger) use `text-on-accent`,
 * never a raw light/white text color — the six accent tokens are
 * pastel/light-toned in both themes, so white text would be unreadable.
 * See docs/DESIGN_SYSTEM.md § Accent Contrast Rule.
 */
const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-accent hover:opacity-90',
  secondary: 'bg-secondary text-on-accent hover:opacity-90',
  ghost: 'bg-transparent text-text-primary border border-border hover:border-primary',
  danger: 'bg-danger text-on-accent hover:opacity-90',
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
        'inline-flex items-center justify-center gap-xs rounded-md px-md py-sm text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
