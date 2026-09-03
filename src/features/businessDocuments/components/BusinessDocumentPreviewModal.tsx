import { PrinterIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/shadcn/dialog';
import { Button } from '@/components/ui/shadcn/button';
import type { BusinessDocumentViewModel } from '../types';
import { BusinessDocument } from './BusinessDocument';
import { printBusinessDocument } from './printBusinessDocument';

export interface BusinessDocumentPreviewModalProps {
  open: boolean;
  onClose: () => void;
  viewModel: BusinessDocumentViewModel | null;
  loading?: boolean;
  error?: string | null;
}

export function BusinessDocumentPreviewModal({
  open,
  onClose,
  viewModel,
  loading,
  error,
}: BusinessDocumentPreviewModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100%-2rem)] sm:max-w-[900px]" showCloseButton={false}>
        <div className="business-document-modal__toolbar flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
          <div className="min-w-0">
            <DialogTitle>Document preview</DialogTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              For a clean PDF, turn off &ldquo;Headers and footers&rdquo; in your browser&rsquo;s
              print dialog.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              onClick={() => printBusinessDocument(viewModel?.documentNumber)}
              disabled={!viewModel || Boolean(loading)}
            >
              <PrinterIcon data-icon="inline-start" />
              Print / Save PDF
            </Button>
            <Button size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        {loading ? (
          <div role="status" className="py-20 text-center text-sm text-muted-foreground">
            Preparing document…
          </div>
        ) : error ? (
          <div role="alert" className="py-20 text-center text-sm text-destructive">
            {error}
          </div>
        ) : viewModel ? (
          <div className="business-document-print-root">
            <BusinessDocument viewModel={viewModel} />
          </div>
        ) : (
          <div role="status" className="py-20 text-center text-sm text-muted-foreground">
            This document could not be prepared for printing.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
