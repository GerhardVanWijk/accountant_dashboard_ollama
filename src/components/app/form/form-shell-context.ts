import { createContext, useContext, type ElementType } from 'react';

import type { FormSize } from '@/components/app/form-surface';

export type FormMode = 'create' | 'edit' | 'detail';

/**
 * Wiring `FormShell` exposes to the header/body/footer/tabs primitives
 * rendered inside it. Consumers never touch this directly — they compose
 * `<FormShell><FormHeader/><FormBody/|FormTabs/><FormFooter/></FormShell>`
 * and each child reads what it needs from here.
 */
export interface FormShellContextValue {
  surface: 'dialog' | 'sheet';
  size: FormSize;
  mode: FormMode;
  /** `true` while a submit is in flight — footer disables its actions. */
  pending: boolean;
  /** base-ui Title/Description for the surface (a11y labelling). */
  Title: ElementType;
  Description: ElementType;
  /**
   * Ask to close the surface. Honours the unsaved-changes guard: on a dirty
   * create/edit form it opens the discard prompt instead of closing; on a
   * detail form (or a clean form) it closes immediately.
   */
  requestClose: () => void;
}

export const FormShellContext = createContext<FormShellContextValue | null>(null);

/** `null` when a form primitive is rendered outside a `FormShell` (it then falls back to plain markup). */
export function useFormShell(): FormShellContextValue | null {
  return useContext(FormShellContext);
}
