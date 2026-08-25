import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/shadcn/dialog';
import { TransactionForm, type TransactionFormProps } from './TransactionForm';

export interface TransactionFormModalProps extends Omit<TransactionFormProps, 'onCancel'> {
  onClose: () => void;
}

/** Modal shell hosting TransactionForm, built on the shared v0 Dialog primitive. */
export function TransactionFormModal({ onClose, ...formProps }: TransactionFormModalProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New bank transaction</DialogTitle>
        </DialogHeader>
        <TransactionForm {...formProps} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}
