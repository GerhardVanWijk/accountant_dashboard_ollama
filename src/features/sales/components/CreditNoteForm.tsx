import { useMemo, useState } from 'react';
import type { Customer, CreditNote, CreditNoteReason, Invoice } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { CustomerCombobox, EnumSelect, SearchableSelect } from '@/components/app/combobox';
import { Amount } from '@/components/app/figure';
import { FormBody, FormFooter } from '@/components/app/form';
import type { CreateCreditNoteDTO } from '../services';
import { SalesLineItemsEditor } from './SalesLineItemsEditor';
import { useTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';
import { newUuid } from '@/lib/uuid';

const REASON_OPTIONS: { value: CreditNoteReason; label: string }[] = [
  { value: 'return', label: 'Returned goods' },
  { value: 'pricing_error', label: 'Pricing error' },
  { value: 'discount', label: 'Discount' },
  { value: 'other', label: 'Other' },
];

export interface CreditNoteFormProps {
  customers: Customer[];
  /** All invoices, so the user can optionally tie this credit note to one issued against the selected customer. */
  invoices: Invoice[];
  /**
   * Every existing credit note — needed only to compute, per invoice line,
   * how much has already been credited against it (the "already credited" /
   * "remaining creditable" columns on the line picker below). Optional so
   * every existing caller/test keeps compiling; omitting it just shows
   * "already credited" as 0 everywhere (a fresh invoice with no prior
   * credit notes behaves identically either way).
   */
  creditNotes?: CreditNote[];
  defaultCreditNoteNumber: string;
  onSubmit: (data: CreateCreditNoteDTO) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const fmtQty = (n: number) => n.toLocaleString('en-ZA', { maximumFractionDigits: 3 });

/**
 * Credit Note create form — same fields/validation/submit shape as before
 * the port. Only builds and validates the CreateCreditNoteDTO payload — it
 * stays in 'draft' until the Detail view's "Issue credit note" action
 * posts it via creditNoteService.issueCreditNote().
 */
export function CreditNoteForm({ customers, invoices, creditNotes = [], defaultCreditNoteNumber, onSubmit, onCancel, onDirtyChange }: CreditNoteFormProps) {
  const { taxRates } = useTaxRates();
  const { products } = useProducts();
  const { warehouses } = useWarehouses();
  const [creditNoteNumber, setCreditNoteNumber] = useState(defaultCreditNoteNumber);
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [invoiceId, setInvoiceId] = useState<string>('');
  const [issueDate, setIssueDate] = useState(today());
  const [reason, setReason] = useState<CreditNoteReason>('return');
  /**
   * Free-text explanation shown and required when `reason === 'other'`
   * (docs brief Part I). Persisted to its own `credit_notes.reason_details`
   * column (migration 0043) — kept distinct from `notes`.
   */
  const [reasonDetail, setReasonDetail] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<CreateCreditNoteDTO['lineItems']>([
    { id: `li_${Date.now()}`, description: '', quantity: 1, unitPrice: 0, taxAmount: 0, lineTotal: 0 },
  ]);
  /** Draft quantities in the "credit this specific invoice line" picker, keyed by invoice line id — reset whenever the selected invoice changes. */
  const [pickerQty, setPickerQty] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const customerInvoices = invoices.filter((inv) => inv.customerId === customerId);
  const selectedInvoice = invoices.find((inv) => inv.id === invoiceId);

  /**
   * Per-invoice-line traceability (Part 4, `docs/CURRENT_TASKS.md`): for
   * each line on the selected invoice, how much has already been credited
   * against THAT SPECIFIC line by every OTHER non-draft/non-void credit
   * note — the same line-specific aggregate `creditNoteService.issueCreditNote()`
   * itself enforces (`originalInvoiceLineId`), surfaced here so the user
   * sees the real remaining-creditable quantity instead of guessing from
   * the product alone.
   */
  const creditableLines = useMemo(() => {
    if (!selectedInvoice) return [];
    const alreadyCreditedByLine = new Map<string, number>();
    for (const cn of creditNotes) {
      if (cn.invoiceId !== selectedInvoice.id || cn.status === 'draft' || cn.status === 'void') continue;
      for (const line of cn.lineItems) {
        if (!line.originalInvoiceLineId) continue;
        alreadyCreditedByLine.set(line.originalInvoiceLineId, (alreadyCreditedByLine.get(line.originalInvoiceLineId) ?? 0) + line.quantity);
      }
    }
    return selectedInvoice.lineItems.map((line) => {
      const alreadyCredited = alreadyCreditedByLine.get(line.id) ?? 0;
      const remainingCreditable = Math.max(0, round2(line.quantity - alreadyCredited));
      return { line, alreadyCredited, remainingCreditable };
    });
  }, [selectedInvoice, creditNotes]);

  /** Adds/updates/removes the credit-note line tied to one specific invoice line. */
  function applyInvoiceLine(invoiceLineId: string, requestedQty: number) {
    const entry = creditableLines.find((c) => c.line.id === invoiceLineId);
    if (!entry) return;
    const qty = Math.max(0, Math.min(requestedQty, entry.remainingCreditable));
    setLineItems((prev) => {
      const withoutThisLine = prev.filter((li) => li.originalInvoiceLineId !== invoiceLineId);
      // The pristine, untouched starter row (blank description, default qty/price)
      // is discarded the moment the user picks a real invoice line instead.
      const base = withoutThisLine.filter((li) => li.originalInvoiceLineId || li.description.trim() !== '' || li.unitPrice !== 0);
      if (qty <= 0) return base;
      const { line } = entry;
      const isWholeLine = Math.abs(qty - line.quantity) <= 1e-9;
      const rate = line.lineTotal > 0 ? line.taxAmount / line.lineTotal : 0;
      const lineTotal = isWholeLine ? round2(line.lineTotal) : round2(qty * line.unitPrice);
      const taxAmount = isWholeLine ? round2(line.taxAmount) : round2(lineTotal * rate);
      const existingId = prev.find((li) => li.originalInvoiceLineId === invoiceLineId)?.id;
      return [
        ...base,
        {
          id: existingId ?? newUuid(),
          originalInvoiceLineId: invoiceLineId,
          productId: line.productId,
          warehouseId: line.warehouseId,
          description: line.description,
          quantity: qty,
          unitPrice: line.unitPrice,
          taxRateId: line.taxRateId,
          taxAmount,
          lineTotal,
        },
      ];
    });
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const taxTotal = lineItems.reduce((sum, item) => sum + item.taxAmount, 0);
  const total = subtotal + taxTotal;

  async function handleSubmit() {
    setFormError(null);
    if (!creditNoteNumber.trim()) return setFormError('Credit note number is required.');
    if (!customerId) return setFormError('Select a customer.');
    if (reason === 'other' && !reasonDetail.trim()) {
      return setFormError('Specify the reason for this credit note.');
    }
    if (lineItems.length === 0 || lineItems.some((li) => !li.description.trim() || li.quantity <= 0)) {
      return setFormError('Every line item needs a description and a quantity greater than zero.');
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        creditNoteNumber: creditNoteNumber.trim(),
        customerId,
        invoiceId: invoiceId || undefined,
        issueDate,
        reason,
        reasonDetails: reason === 'other' ? reasonDetail.trim() : undefined,
        lineItems,
        subtotal,
        taxTotal,
        total,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
        notes: notes.trim() || undefined,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save credit note.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" onInput={() => onDirtyChange?.(true)}>
      <FormBody>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="cn-number">Credit note number</FieldLabel>
          <Input id="cn-number" className="figure" value={creditNoteNumber} onChange={(e) => setCreditNoteNumber(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="cn-customer">Customer</FieldLabel>
          <CustomerCombobox
            id="cn-customer"
            customers={customers}
            value={customerId || null}
            onChange={(v) => {
              setCustomerId(v ?? '');
              setInvoiceId('');
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="cn-invoice">Against invoice (optional)</FieldLabel>
          <SearchableSelect
            id="cn-invoice"
            value={invoiceId || null}
            onChange={(v) => {
              setInvoiceId(v ?? '');
              setPickerQty({});
              // a new (or cleared) invoice invalidates any lines picked against the PREVIOUS one
              setLineItems((prev) => prev.filter((li) => !li.originalInvoiceLineId));
            }}
            placeholder="Standalone account credit"
            searchPlaceholder="Search invoice number…"
            clearable
            options={customerInvoices.map((inv) => ({ value: inv.id, label: inv.invoiceNumber }))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="cn-reason">Reason</FieldLabel>
          <EnumSelect
            id="cn-reason"
            value={reason}
            onValueChange={(v) => setReason(v as CreditNoteReason)}
            options={REASON_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="cn-issue-date">Issue date</FieldLabel>
          <Input id="cn-issue-date" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </Field>
        {reason === 'other' && (
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="cn-reason-detail">Specify reason</FieldLabel>
            <Textarea
              id="cn-reason-detail"
              rows={2}
              value={reasonDetail}
              onChange={(e) => setReasonDetail(e.target.value)}
              placeholder="Explain why this credit note is being raised"
              aria-label="Specify reason"
            />
          </Field>
        )}
      </div>

      {selectedInvoice && creditableLines.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
          <h3 className="text-sm font-medium">Credit a specific line from {selectedInvoice.invoiceNumber}</h3>
          <p className="text-xs text-muted-foreground">
            Crediting the exact original line — not just the product — keeps this credit note from over-crediting when the
            same product appears on more than one line of the invoice.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
                  <th className="py-2 pr-3 font-medium">Description</th>
                  <th className="py-2 pr-3 text-right font-medium">Original qty</th>
                  <th className="py-2 pr-3 text-right font-medium">Already credited</th>
                  <th className="py-2 pr-3 text-right font-medium">Remaining creditable</th>
                  <th className="py-2 pr-3 text-right font-medium">Unit price</th>
                  <th className="py-2 text-right font-medium">Credit qty</th>
                </tr>
              </thead>
              <tbody>
                {creditableLines.map(({ line, alreadyCredited, remainingCreditable }) => {
                  const picked = lineItems.find((li) => li.originalInvoiceLineId === line.id);
                  const value = pickerQty[line.id] ?? (picked ? String(picked.quantity) : '0');
                  return (
                    <tr key={line.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3">
                        {line.description}
                        {products.find((p) => p.id === line.productId)?.sku && (
                          <span className="ml-1 text-xs text-muted-foreground">({products.find((p) => p.id === line.productId)?.sku})</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmtQty(line.quantity)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmtQty(alreadyCredited)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmtQty(remainingCreditable)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums"><Amount value={line.unitPrice} /></td>
                      <td className="py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          max={remainingCreditable}
                          step="0.001"
                          disabled={remainingCreditable <= 0}
                          aria-label={`Credit quantity for ${line.description}`}
                          className="h-9 w-24 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums disabled:opacity-50"
                          value={value}
                          onChange={(e) => {
                            setPickerQty((prev) => ({ ...prev, [line.id]: e.target.value }));
                            applyInvoiceLine(line.id, Number(e.target.value) || 0);
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SalesLineItemsEditor lineItems={lineItems} onChange={setLineItems} taxRates={taxRates} products={products} warehouses={warehouses} />

      <div className="grid grid-cols-3 gap-4 rounded-xl border border-border bg-muted/20 p-4 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Subtotal</div>
          <Amount value={subtotal} className="text-base font-semibold" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Tax</div>
          <Amount value={taxTotal} className="text-base font-semibold" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Total credit</div>
          <Amount value={total} className="text-base font-semibold" />
        </div>
      </div>

      <Field>
        <FieldLabel htmlFor="cn-notes">Notes (optional)</FieldLabel>
        <Textarea id="cn-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      </FormBody>

      <FormFooter error={formError ?? undefined}>
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? 'Saving…' : 'Create credit note'}
        </Button>
      </FormFooter>
    </div>
  );
}
