import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/shadcn/dialog';
import { wideFormDialogClass } from '@/components/app/form-surface';
import { StatementImportPanel, type StatementImportPanelProps } from './StatementImportPanel';

export interface StatementImportModalProps extends Omit<StatementImportPanelProps, 'onCancel'> {
  onClose: () => void;
}

/** Modal shell hosting StatementImportPanel, built on the shared v0 Dialog primitive. */
export function StatementImportModal({ onClose, ...panelProps }: StatementImportModalProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className={wideFormDialogClass}>
        <DialogHeader>
          <DialogTitle>Import bank statement</DialogTitle>
        </DialogHeader>
        <StatementImportPanel {...panelProps} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}
