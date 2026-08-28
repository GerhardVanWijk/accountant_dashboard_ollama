import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/shadcn/dialog';
import { wideFormDialogClass } from '@/components/app/form-surface';
import { AllocateTransactionForm, type AllocateTransactionFormProps } from './AllocateTransactionForm';

export interface AllocateTransactionFormModalProps extends Omit<AllocateTransactionFormProps, 'onCancel'> {
  onClose: () => void;
}

/** Modal shell hosting AllocateTransactionForm, built on the shared v0 Dialog primitive. */
export function AllocateTransactionFormModal({ onClose, ...formProps }: AllocateTransactionFormModalProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className={wideFormDialogClass}>
        <DialogHeader>
          <DialogTitle>Allocate transaction</DialogTitle>
        </DialogHeader>
        <AllocateTransactionForm {...formProps} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}
