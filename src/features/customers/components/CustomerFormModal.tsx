import { Icon } from '@/components/ui/Icon';
import { Card } from '@/components/ui/Card';
import { CustomerForm, type CustomerFormProps } from './CustomerForm';

export interface CustomerFormModalProps extends Omit<CustomerFormProps, 'onCancel'> {
  title: string;
  onClose: () => void;
}

/** Modal shell hosting CustomerForm for both create and edit flows. */
export function CustomerFormModal({ title, onClose, ...formProps }: CustomerFormModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-text-primary/40 p-md sm:p-xl"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="my-lg w-full max-w-2xl">
        <div className="mb-md flex items-center justify-between">
          <h2 className="text-xl font-semibold text-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-xs text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <CustomerForm {...formProps} onCancel={onClose} />
      </Card>
    </div>
  );
}
