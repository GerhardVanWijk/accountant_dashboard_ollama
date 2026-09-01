import type { IDocumentLineProjector } from './IDocumentLineProjector';

/**
 * Default `IDocumentLineProjector` — does nothing. This is the default
 * every document service constructor falls back to (see InvoiceService /
 * BillService / PurchaseOrderService / CreditNoteService), so every
 * existing call site (every test, every place that constructs one of these
 * services directly) keeps working unchanged with zero knowledge that the
 * projector parameter exists — only the real composition roots
 * (services/index.ts) wire the Supabase-backed one.
 */
export class NoopDocumentLineProjector implements IDocumentLineProjector {
  async sync(): Promise<void> {
    // Intentionally empty.
  }
}
