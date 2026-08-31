import type { ID } from '@/types';

/**
 * Persistence boundary for inventory documents whose lines are first-class rows.
 * Header mutations never accept an embedded line array; callers manage lines
 * through the explicit line methods and repositories hydrate aggregates on read.
 */
export interface INormalizedInventoryDocumentRepository<TDocument, TLine, THeaderCreate, THeaderPatch, TLineCreate, TLinePatch> {
  getAll(): Promise<TDocument[]>;
  getById(id: ID): Promise<TDocument | undefined>;
  createHeader(header: THeaderCreate): Promise<TDocument>;
  updateHeader(id: ID, patch: THeaderPatch): Promise<TDocument>;
  deleteHeader(id: ID): Promise<void>;
  getLines(documentId: ID): Promise<TLine[]>;
  createLine(documentId: ID, line: TLineCreate): Promise<TLine>;
  updateLine(documentId: ID, lineId: ID, patch: TLinePatch): Promise<TLine>;
  deleteLine(documentId: ID, lineId: ID): Promise<void>;
}
