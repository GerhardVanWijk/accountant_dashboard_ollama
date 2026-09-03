import type { ReactNode } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/shadcn/select';
import { cn } from '@/lib/utils';

export interface EnumOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface EnumSelectProps {
  options: EnumOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  name?: string;
  'aria-label'?: string;
  /** Width override for the trigger (defaults to full width). */
  className?: string;
}

/**
 * The Vertex replacement for a short-fixed-enum `<select>` — statuses,
 * methods, scopes, reasons, a single-warehouse picker. Renders a themed
 * dark popup (the base-ui Select), never the browser's native white/blue
 * option menu that `<option>` can't be styled past. Prefers opening
 * downward, constrains to the viewport with an internal scroll, and keeps
 * full keyboard navigation. For a list the user should be able to *search*
 * (products, customers, GL accounts) use SearchableSelect instead.
 */
export function EnumSelect({
  options,
  value,
  onValueChange,
  placeholder = 'Select…',
  disabled,
  invalid,
  id,
  name,
  className,
  'aria-label': ariaLabel,
}: EnumSelectProps) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(v) => onValueChange(String(v ?? ''))}
      name={name}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className={cn('h-8 w-full', className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent side="bottom" sideOffset={4} align="start" alignItemWithTrigger={false}>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
