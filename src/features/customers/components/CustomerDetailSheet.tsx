import type { Customer } from '@/types';
import { RecordDetailSheet } from '@/components/app/record-detail-sheet';
import { CustomerDetailPage } from '../pages/CustomerDetailPage';

export interface CustomerDetailSheetProps {
  customerId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (customer: Customer) => void;
}

/**
 * Wide variant of the shared RecordDetailSheet — CustomerDetailPage is a
 * genuinely rich, tabbed profile (financial summary, aging, transaction
 * history, statements), not a compact document like an invoice. A narrow
 * sheet would degrade it; a wide overlay keeps the audit's "don't lose
 * list context" requirement while giving the content room to breathe.
 * CustomerDetailPage already self-fetches (useCustomer(customerId)) and
 * has its own loading/error/not-found states, so this wrapper doesn't
 * duplicate them — it only supplies "not-found" for a genuinely missing id.
 */
export function CustomerDetailSheet({ customerId, open, onOpenChange, onEdit }: CustomerDetailSheetProps) {
  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Customer"
      state={customerId ? 'ready' : 'not-found'}
      className="sm:max-w-3xl"
    >
      {customerId && <CustomerDetailPage customerId={customerId} onBack={() => onOpenChange(false)} onEdit={onEdit} />}
    </RecordDetailSheet>
  );
}
