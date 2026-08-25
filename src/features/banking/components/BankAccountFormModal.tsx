import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/shadcn/dialog';
import { BankAccountForm, type BankAccountFormProps } from './BankAccountForm';

export interface BankAccountFormModalProps extends Omit<BankAccountFormProps, 'onCancel'> {
  title: string;
  onClose: () => void;
}

/** Modal shell hosting BankAccountForm for both create and edit flows, built on the shared v0 Dialog primitive. */
export function BankAccountFormModal({ title, onClose, ...formProps }: BankAccountFormModalProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <BankAccountForm {...formProps} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}
