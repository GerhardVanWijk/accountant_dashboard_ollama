import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/shadcn/dialog';
import { AllocationForm, type AllocationFormProps, type OpenInvoiceOption } from './AllocationForm';

export type { OpenInvoiceOption };

export interface AllocationFormModalProps extends Omit<AllocationFormProps, 'onCancel'> {
  title: string;
  onClose: () => void;
}

/** Modal shell hosting AllocationForm, built on the shared v0 Dialog primitive. */
export function AllocationFormModal({ title, onClose, ...formProps }: AllocationFormModalProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <AllocationForm {...formProps} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}
