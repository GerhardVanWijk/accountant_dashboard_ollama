import './businessDocuments.css';

export type {
  BusinessDocumentKind,
  BusinessDocumentViewModel,
  BusinessDocumentParty,
  BusinessDocumentLine,
  BusinessDocumentLineColumn,
  BusinessDocumentTotalRow,
  BusinessDocumentPaymentInfo,
  BusinessDocumentBranding,
  BusinessDocumentMetaField,
} from './types';

export { BusinessDocument } from './components/BusinessDocument';
export { BusinessDocumentPreviewModal } from './components/BusinessDocumentPreviewModal';
export { printBusinessDocument } from './components/printBusinessDocument';
export {
  useBusinessDocument,
  type BusinessDocumentInput,
  type BusinessDocumentRecordKind,
  type UseBusinessDocumentResult,
} from './hooks/useBusinessDocument';

export { quoteToBusinessDocument } from './adapters/quoteToBusinessDocument';
export { salesOrderToBusinessDocument } from './adapters/salesOrderToBusinessDocument';
export { invoiceToBusinessDocument } from './adapters/invoiceToBusinessDocument';
export { creditNoteToBusinessDocument } from './adapters/creditNoteToBusinessDocument';
export { purchaseOrderToBusinessDocument } from './adapters/purchaseOrderToBusinessDocument';
export {
  businessDocumentFooterText,
  resolveDocumentTerms,
  resolveDocumentsBankAccount,
  type AdapterContext,
} from './adapters/shared';
