import { Link } from 'react-router-dom';
import {
  RecordDetailField,
  RecordDetailSection,
  RecordDetailSheet,
} from '@/components/app/record-detail-sheet';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { MOVEMENT_TYPE_LABELS } from '../constants';
import type { MovementEvidenceContext } from '../utils/movementEvidence';

/**
 * The stock-movement evidence drawer — opens OVER the Product workspace
 * (`RecordDetailSheet`, a right-hand panel) rather than navigating away.
 * Answers the full traceability question for one movement: what moved, where,
 * from which document, for which party, at what cost, on which journal, and
 * who recorded it. Presentational — every value is passed in already resolved.
 */
export function MovementEvidenceDrawer({
  context,
  open,
  onClose,
}: {
  context: MovementEvidenceContext | null;
  open: boolean;
  onClose: () => void;
}) {
  const m = context?.movement;
  const src = context?.source;
  const acc = context?.accounting;

  const directionNote =
    m?.type === 'transfer_in'
      ? `Into ${context?.warehouseName}`
      : m?.type === 'transfer_out'
        ? `Out of ${context?.warehouseName}`
        : undefined;

  const directionLabel = m == null ? '' : m.quantityDelta > 0 ? 'Stock in' : m.quantityDelta < 0 ? 'Stock out' : 'No change';
  const hasCost = m != null && (m.unitCost != null || m.totalCost != null || context?.currentWac != null);

  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={m ? MOVEMENT_TYPE_LABELS[m.type] : 'Stock movement'}
      titleAdornment={
        context?.missingEvidence ? (
          <span className="rounded-md border border-status-warning-outline bg-status-warning-surface/50 px-1.5 py-0.5 text-[0.7rem] font-medium text-status-warning">
            Source unavailable
          </span>
        ) : undefined
      }
      description={m ? formatDate(m.movementDate ?? m.createdAt) : undefined}
      state={context ? 'ready' : 'not-found'}
      notFoundMessage="No movement selected."
    >
      {m && (
        <>
          <RecordDetailSection title="Movement">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {context?.productLabel && (
                <RecordDetailField label="Item" value={context.productLabel} className="col-span-2" />
              )}
              <RecordDetailField label="Type" value={MOVEMENT_TYPE_LABELS[m.type]} />
              <RecordDetailField label="Direction" value={directionLabel} />
              <RecordDetailField
                label="Quantity"
                value={m.quantityDelta > 0 ? `+${m.quantityDelta}` : String(m.quantityDelta)}
              />
              {context?.runningQuantity != null && (
                <RecordDetailField label="Balance after" value={String(context.runningQuantity)} />
              )}
              {m.notes && <RecordDetailField label="Notes" value={m.notes} className="col-span-2" />}
            </div>
          </RecordDetailSection>

          <RecordDetailSection title="Location">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <RecordDetailField label="Warehouse" value={context?.warehouseName ?? '—'} />
              {directionNote && <RecordDetailField label="Direction" value={directionNote} />}
              {context?.counterpartWarehouseName && (
                <RecordDetailField
                  label={m.type === 'transfer_out' ? 'To warehouse' : 'From warehouse'}
                  value={context.counterpartWarehouseName}
                />
              )}
            </div>
          </RecordDetailSection>

          <RecordDetailSection title="Source document">
            {src && (src.number || (src.label && src.path)) ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <RecordDetailField label="Type" value={src.label} />
                <RecordDetailField
                  label="Document"
                  value={
                    src.path ? (
                      <Link to={src.path} className="font-medium text-brand hover:underline">
                        {src.number ?? `Open ${src.label.toLowerCase()}`}
                      </Link>
                    ) : (
                      src.number ?? src.label
                    )
                  }
                />
                {context?.party && <RecordDetailField label="Party" value={context.party} />}
                {src.fromLegacyReference && (
                  <p className="col-span-2 text-xs text-muted-foreground">
                    Recovered from a historical reference — the document number may be all that can be shown.
                  </p>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Source document unavailable</p>
                <p className="mt-0.5">
                  This movement carries historical source information, but the original record could not be resolved.
                  The technical reference is in Technical details below.
                </p>
              </div>
            )}
          </RecordDetailSection>

          {hasCost && (
            <RecordDetailSection title="Costing">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {m.unitCost != null && (
                  <RecordDetailField label="Unit cost" value={formatCurrency(m.unitCost)} />
                )}
                {m.totalCost != null && (
                  <RecordDetailField label="Movement value" value={formatCurrency(m.totalCost)} />
                )}
                {context?.currentWac != null && (
                  <RecordDetailField label="Current WAC" value={formatCurrency(context.currentWac)} />
                )}
              </div>
            </RecordDetailSection>
          )}

          <RecordDetailSection title="Accounting">
            {acc ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <RecordDetailField
                  label="Journal entry"
                  value={
                    acc.journalEntryId ? (
                      <Link
                        to={`/accounting/journals?record=${acc.journalEntryId}`}
                        className="text-brand hover:underline"
                      >
                        {acc.journalNumber ?? 'View journal entry'}
                      </Link>
                    ) : (
                      acc.journalNumber ?? '—'
                    )
                  }
                />
                <RecordDetailField label="Inventory GL" value={acc.inventoryAccount} />
                {acc.contraAccount && <RecordDetailField label="Contra" value={acc.contraAccount} />}
                {acc.contraRelationship && (
                  <RecordDetailField label="Relationship" value={acc.contraRelationship} className="col-span-2" />
                )}
                {acc.postingKey && (
                  <RecordDetailField
                    label="Posting key"
                    value={<span className="font-mono text-[11px]">{acc.postingKey}</span>}
                    className="col-span-2"
                  />
                )}
                {(acc.isReversal || m.reversalOfMovementId) && (
                  <RecordDetailField
                    label="Reversal"
                    value={m.reversalOfMovementId ? 'Reverses an earlier movement' : 'Reversing entry'}
                  />
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No linked journal entry — this movement type does not post to the general ledger, or the
                entry is not loaded.
              </p>
            )}
          </RecordDetailSection>

          <RecordDetailSection title="Audit">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <RecordDetailField label="Recorded by" value={m.createdBy ?? 'System'} />
              <RecordDetailField label="Recorded at" value={formatDate(m.createdAt)} />
            </div>
            <details className="mt-1 text-xs">
              <summary className="cursor-pointer text-muted-foreground">Technical details</summary>
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px] break-all text-muted-foreground">
                <dt>Movement ID</dt>
                <dd>{m.id}</dd>
                {m.sourceDocumentType && (
                  <>
                    <dt>Source type</dt>
                    <dd>{m.sourceDocumentType}</dd>
                  </>
                )}
                {m.sourceDocumentId && (
                  <>
                    <dt>Source ID</dt>
                    <dd>{m.sourceDocumentId}</dd>
                  </>
                )}
                {m.sourceDocumentLineId && (
                  <>
                    <dt>Source line ID</dt>
                    <dd>{m.sourceDocumentLineId}</dd>
                  </>
                )}
                {m.reference && (
                  <>
                    <dt>Raw reference</dt>
                    <dd>{m.reference}</dd>
                  </>
                )}
                {m.reversalOfMovementId && (
                  <>
                    <dt>Reverses</dt>
                    <dd>{m.reversalOfMovementId}</dd>
                  </>
                )}
              </dl>
            </details>
          </RecordDetailSection>
        </>
      )}
    </RecordDetailSheet>
  );
}
