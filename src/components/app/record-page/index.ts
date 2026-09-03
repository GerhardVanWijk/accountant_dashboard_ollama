export { RecordPageShell, type RecordCrumb, type RecordPageShellProps } from './RecordPageShell';
export { RecordPageHeader, RecordActionBar, type RecordAction, type RecordActionBarProps, type RecordPageHeaderProps } from './RecordPageHeader';
export { RecordSummaryGrid, RecordField } from './RecordSummaryGrid';
export {
  DocumentLineTable,
  type DocumentLineColumn,
  type DocumentLineTotal,
  type DocumentLineTableProps,
} from './DocumentLineTable';
export { useLegacyRecordRedirect } from './useLegacyRecordRedirect';
export { documentLineColumns, type DocumentLineColumnOptions } from './documentLineColumns';
export type { RecordPageProps } from './recordPageProps';
export {
  resolveSourceDocument,
  isOpaqueReference,
  type ResolvedSourceDocument,
  type RelatedRecordType,
} from './sourceDocument';
export { RelatedRecordPreview, type RelatedRecordPreviewProps } from './RelatedRecordPreview';

// The page-scale section + related-records + activity sections are already
// generic — re-exported here so a record page imports everything from one place.
export {
  RecordDetailSection as RecordPageSection,
  RelatedRecordsSection,
  type RelatedRecordItem,
} from '@/components/app/record-detail-sheet';
export { RecordAuditHistorySection as RecordActivitySection } from '@/components/app/record-audit-history';
