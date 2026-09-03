/**
 * Shared props for every `*DetailPage`. At its own route the page reads the
 * id from `useParams`; inside <RelatedRecordPreview> the same component is
 * rendered with an explicit `recordId` + `embedded` so a related document
 * can be inspected without leaving the current record page.
 */
export interface RecordPageProps {
  /** Overrides the route param — set only when rendered inside a preview overlay. */
  recordId?: string;
  /** Hides the breadcrumb / back-link chrome (see RecordPageShell). */
  embedded?: boolean;
}
