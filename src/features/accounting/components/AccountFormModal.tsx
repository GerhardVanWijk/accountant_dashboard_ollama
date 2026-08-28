import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/shadcn/dialog';
import { standardDialogClass } from '@/components/app/form-surface';
import { AccountForm, type AccountFormProps } from './AccountForm';

export interface AccountFormModalProps extends Omit<AccountFormProps, 'onCancel'> {
  title: string;
  onClose: () => void;
}

/** Modal shell hosting AccountForm for both create and edit flows, built on the shared v0 Dialog primitive. */
export function AccountFormModal({ title, onClose, ...formProps }: AccountFormModalProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className={standardDialogClass}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <AccountForm {...formProps} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}
