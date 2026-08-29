/**
 * The Vertex Form System (docs/CURRENT_TASKS.md → P3B / P3C).
 *
 * Compose a form as:
 *
 *   <FormShell open onClose={close} size="md" mode="edit" isDirty pending onSubmit={submit}>
 *     <FormHeader title="…" recordRef="…" badge={<StatusBadge …/>} />
 *     <FormBody> … </FormBody>              // or:
 *     <FormTabs tabs={…} value={tab} onValueChange={setTab} />
 *     <FormFooter error={serverError} destructiveAction={…}>
 *       <Button variant="outline" type="button" onClick={close}>Cancel</Button>
 *       <Button type="submit">Save</Button>
 *     </FormFooter>
 *   </FormShell>
 *
 * `FormShell` owns the surface's width + height (via the `size` token) and
 * the unsaved-changes close guard; nothing inside it redefines the outer
 * dimensions.
 */
export { FormShell, type FormShellProps } from './FormShell';
export { FormHeader, type FormHeaderProps } from './FormHeader';
export {
  FormBody,
  FormSection,
  FormLoading,
  FormEmptyState,
  type FormBodyProps,
  type FormSectionProps,
} from './FormBody';
export { FormFooter, type FormFooterProps } from './FormFooter';
export { FormTabs, type FormTab, type FormTabsProps } from './FormTabs';
export { FormError, RequiredMark } from './FormError';
export { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog';
export { useUnsavedChangesPrompt } from './useUnsavedChangesPrompt';
export { useFormShell, type FormMode, type FormShellContextValue } from './form-shell-context';
export {
  type FormSize,
  FORM_SIZES,
  formSizeWidthClass,
  formSizeHeightClass,
} from '@/components/app/form-surface';
