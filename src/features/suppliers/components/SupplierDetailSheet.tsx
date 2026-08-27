import { RecordDetailSheet } from '@/components/app/record-detail-sheet';
import type { UseSuppliersResult } from '../hooks/useSuppliers';
import { SupplierDetailPage } from '../pages/SupplierDetailPage';

export interface SupplierDetailSheetProps {
  supplierId: string | undefined;
  suppliersState: UseSuppliersResult;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}

/** Wide variant, same reasoning as CustomerDetailSheet — SupplierDetailPage is a rich tabbed profile, not a compact document. */
export function SupplierDetailSheet({ supplierId, suppliersState, open, onOpenChange, onEdit }: SupplierDetailSheetProps) {
  return (
    <RecordDetailSheet open={open} onOpenChange={onOpenChange} title="Supplier" state={supplierId ? 'ready' : 'not-found'} className="sm:max-w-3xl">
      {supplierId && <SupplierDetailPage supplierId={supplierId} suppliersState={suppliersState} onBack={() => onOpenChange(false)} onEdit={onEdit} />}
    </RecordDetailSheet>
  );
}
