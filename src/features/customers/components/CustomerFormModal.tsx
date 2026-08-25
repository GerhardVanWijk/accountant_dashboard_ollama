import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/shadcn/dialog';
import { CustomerForm, type CustomerFormProps } from './CustomerForm';

export interface CustomerFormModalProps extends Omit<CustomerFormProps, 'onCancel'> {
  title: string;
  onClose: () => void;
}

/** Modal shell hosting CustomerForm for both create and edit flows, built on the shared v0 Dialog primitive. */
export function CustomerFormModal({ title, onClose, ...formProps }: CustomerFormModalProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <CustomerForm {...formProps} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}
