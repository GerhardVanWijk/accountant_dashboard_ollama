import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/shadcn/field';
import { Checkbox } from '@/components/ui/shadcn/checkbox';
import { RequiredMark } from './FormError';

/**
 * The one responsive field grid for the Vertex Form System (docs brief
 * §4). Replaces the ~80 hand-rolled `grid grid-cols-1 gap-4 md:grid-cols-2`
 * blocks scattered across the feature forms so every form breaks columns at
 * the same width and uses the same row/column rhythm.
 *
 *   <FormGrid>                         // 1 → sm:2  — the default for entity forms
 *   <FormGrid columns={3}>             // 1 → sm:2 → lg:3 — dense short-field rows
 *   <FormGrid columns={1}>             // never splits — narrow / stacked forms
 *
 * A field that needs the full width (Description, Address, Notes) sets
 * `span="full"` on its `FormField`, or `className="col-span-full"` on a
 * bare `Field`.
 *
 * `gap-x-5 gap-y-4` (20px / 16px): a touch more horizontal breathing room
 * than vertical so two-column rows read as pairs, not a wall.
 */
export interface FormGridProps {
  /** Column count at the widest breakpoint. `2` (default), `3`, or `1` (never splits). */
  columns?: 1 | 2 | 3;
  className?: string;
  children: ReactNode;
}

const columnsClass: Record<NonNullable<FormGridProps['columns']>, string> = {
  1: '',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
};

export function FormGrid({ columns = 2, className, children }: FormGridProps) {
  return (
    <div
      data-slot="form-grid"
      className={cn('grid grid-cols-1 gap-x-5 gap-y-4', columnsClass[columns], className)}
    >
      {children}
    </div>
  );
}

/**
 * One labelled control inside a `FormGrid` (or a `FormBody`). Bundles the
 * label (+ required marker), the control, an optional hint, and the field
 * error into the standard vertical stack so a form stops repeating
 *
 *   <Field><FieldLabel htmlFor="x">X</FieldLabel><Input id="x" .../><FieldError errors={[errors.x]} /></Field>
 *
 * for every single field. The control is passed as `children`; wire its
 * `id` to `htmlFor` yourself so the schema/registration stays explicit.
 */
export interface FormFieldProps {
  label?: ReactNode;
  /** `id` of the control this label points at. */
  htmlFor?: string;
  required?: boolean;
  /** Muted helper text under the control. */
  hint?: ReactNode;
  /** A single RHF `FieldError`-shaped object, or a list of them. */
  error?: { message?: string } | undefined | Array<{ message?: string } | undefined>;
  /** `full` makes the field span every column of its `FormGrid`. */
  span?: 'full';
  /** `horizontal` puts the label beside the control (checkbox / toggle rows). */
  orientation?: 'vertical' | 'horizontal';
  className?: string;
  children: ReactNode;
}

export function FormField({
  label,
  htmlFor,
  required,
  hint,
  error,
  span,
  orientation = 'vertical',
  className,
  children,
}: FormFieldProps) {
  const errors = Array.isArray(error) ? error : [error];
  return (
    <Field
      orientation={orientation}
      data-slot="form-field"
      className={cn(span === 'full' && 'col-span-full', className)}
    >
      {label ? (
        <FieldLabel htmlFor={htmlFor}>
          {label}
          {required ? <RequiredMark /> : null}
        </FieldLabel>
      ) : null}
      {children}
      {hint ? <FieldDescription>{hint}</FieldDescription> : null}
      <FieldError errors={errors} />
    </Field>
  );
}

/**
 * A boolean option rendered as a horizontal checkbox + label row, with an
 * optional description underneath — the shared shape for "Active", "VAT
 * registered", "Track inventory", "On hold" (docs brief §10). Replaces the
 * hand-rolled `<input type="checkbox" className="size-4 rounded border-input">`
 * copies. Controlled — wire it through RHF's `Controller` for a form field.
 */
export interface CheckboxFieldProps {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  /** `full` makes the row span every column of its `FormGrid`. */
  span?: 'full';
  className?: string;
}

export function CheckboxField({
  id,
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  span,
  className,
}: CheckboxFieldProps) {
  return (
    <Field
      orientation="horizontal"
      data-slot="checkbox-field"
      className={cn(span === 'full' && 'col-span-full', className)}
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        disabled={disabled}
      />
      <FieldContent>
        <FieldLabel htmlFor={id} className="font-normal">
          {label}
        </FieldLabel>
        {description ? <FieldDescription>{description}</FieldDescription> : null}
      </FieldContent>
    </Field>
  );
}
