import type {
  BusinessDocumentLineColumn,
  BusinessDocumentParty,
  BusinessDocumentViewModel,
} from '../types';

/**
 * The A4 business-document sheet. Presentational only — it renders whatever
 * the `BusinessDocumentViewModel` contains and nothing else, so a field
 * that is not on that allow-list type physically cannot appear on paper.
 *
 * LAYOUT (Phase 4B-VISUAL): a light letterhead header (logo / wordmark +
 * document title / number / dates only — NO issuer identity block), then a
 * true two-column parties row — issuer LEFT ("From"), recipient RIGHT —
 * side-by-side on A4 and in print. The lower section (notes / terms /
 * payment) is two columns for invoices that carry payment info, stacked
 * otherwise. One shared Vertex footer, flowing at content end.
 *
 * COLOURS: this component is the ONE documented place in the app that uses
 * literal Tailwind colour classes (`bg-white`, `text-neutral-900`, …)
 * instead of semantic tokens. Printed paper is always a white sheet with
 * dark text regardless of the in-app theme — see docs/BUSINESS_DOCUMENTS.md.
 * No `dark:` variants are used anywhere here on purpose. There is
 * deliberately no eslint-disable directive: the repo's eslint config has no
 * colour rule, and an unused disable directive fails
 * `lint --report-unused-disable-directives`.
 */

const COLUMN_HEADER: Record<BusinessDocumentLineColumn, string> = {
  code: 'Code',
  description: 'Description',
  quantity: 'Qty',
  unit: 'Unit',
  unitPrice: 'Unit price',
  vat: 'VAT',
  amount: 'Amount',
};

const RIGHT_ALIGNED: ReadonlySet<BusinessDocumentLineColumn> = new Set([
  'quantity',
  'unitPrice',
  'vat',
  'amount',
]);

const SECTION_HEADING = 'mb-1 text-[10px] font-semibold tracking-widest text-neutral-500 uppercase';

export interface BusinessDocumentProps {
  viewModel: BusinessDocumentViewModel;
}

export function BusinessDocument({ viewModel: vm }: BusinessDocumentProps) {
  const isCredit = vm.kind === 'credit_note';

  return (
    <article className="business-document font-sans text-neutral-900" data-kind={vm.kind}>
      <DocumentHeader vm={vm} isCredit={isCredit} />
      <DocumentParties vm={vm} />
      {vm.meta.length > 0 && <DocumentMeta vm={vm} />}
      <DocumentLines vm={vm} />
      <DocumentTotals vm={vm} isCredit={isCredit} />
      {(vm.notes || vm.terms || vm.paymentInfo) && <DocumentLower vm={vm} />}
      <DocumentFooter vm={vm} />
    </article>
  );
}

function DocumentHeader({ vm, isCredit }: { vm: BusinessDocumentViewModel; isCredit: boolean }) {
  return (
    <header className="business-document__header flex items-start justify-between gap-8 border-b border-neutral-200 pb-4">
      <div className="min-w-0 max-w-[55%]">
        {vm.branding.logoDataUrl ? (
          <img
            src={vm.branding.logoDataUrl}
            alt={vm.branding.issuerDisplayName}
            className="max-h-20 w-auto max-w-[280px] object-contain object-left"
          />
        ) : (
          <p className="text-lg font-semibold tracking-tight break-words text-neutral-900">
            {vm.branding.issuerDisplayName}
          </p>
        )}
      </div>

      <div className="max-w-[45%] shrink-0 text-right">
        <h1
          className={`text-2xl font-bold tracking-wide break-words ${
            isCredit ? 'text-rose-700' : 'text-neutral-900'
          }`}
        >
          {vm.title}
        </h1>
        <p className="mt-1 text-sm font-medium break-all text-neutral-700">{vm.documentNumber}</p>
        <dl className="mt-3 space-y-0.5 text-xs text-neutral-600">
          <div className="flex justify-end gap-3">
            <dt>{vm.issuedOnLabel}</dt>
            <dd className="font-medium text-neutral-800">{vm.issuedOn}</dd>
          </div>
          {vm.secondaryDateLabel && vm.secondaryDate && (
            <div className="flex justify-end gap-3">
              <dt>{vm.secondaryDateLabel}</dt>
              <dd className="font-medium text-neutral-800">{vm.secondaryDate}</dd>
            </div>
          )}
        </dl>
      </div>
    </header>
  );
}

function PartyIdentity({ party }: { party: BusinessDocumentParty }) {
  return (
    <div className="min-w-0 space-y-0.5 text-xs break-words text-neutral-800">
      <p className="text-sm font-semibold break-words text-neutral-900">{party.name}</p>
      {party.tradingAs && <p>t/a {party.tradingAs}</p>}
      {party.addressLines?.map((line, i) => <p key={i}>{line}</p>)}
      {party.contactPerson && <p>Attn: {party.contactPerson}</p>}
      {party.email && <p className="break-all">{party.email}</p>}
      {party.phone && <p>{party.phone}</p>}
      {party.website && <p className="break-all">{party.website}</p>}
      {party.registrationNumber && <p>Reg. no. {party.registrationNumber}</p>}
      {party.vatNumber && <p>VAT no. {party.vatNumber}</p>}
      {party.incomeTaxNumber && <p>Income tax no. {party.incomeTaxNumber}</p>}
      {party.accountReference && <p>Account: {party.accountReference}</p>}
    </div>
  );
}

function DocumentParties({ vm }: { vm: BusinessDocumentViewModel }) {
  return (
    <section className="business-document__parties mt-6">
      <div className="business-document__parties-grid grid grid-cols-2 gap-8">
        <div className="min-w-0">
          <p className={SECTION_HEADING}>{vm.issuerHeading}</p>
          <PartyIdentity party={vm.issuer} />
        </div>
        <div className="min-w-0">
          <p className={SECTION_HEADING}>{vm.recipientHeading}</p>
          <PartyIdentity party={vm.recipient} />
        </div>
      </div>
      {vm.shipTo && vm.shipTo.length > 0 && (
        <div className="mt-4 min-w-0">
          <p className={SECTION_HEADING}>Deliver to</p>
          <div className="space-y-0.5 text-xs text-neutral-800">
            {vm.shipTo.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function DocumentMeta({ vm }: { vm: BusinessDocumentViewModel }) {
  return (
    <section className="mt-5 flex flex-wrap gap-x-8 gap-y-1 border-t border-neutral-200 pt-4 text-xs">
      {vm.meta.map((field) => (
        <div key={field.label} className="flex gap-2">
          <span className="text-neutral-500">{field.label}:</span>
          <span className="font-medium text-neutral-800">{field.value}</span>
        </div>
      ))}
    </section>
  );
}

function DocumentLines({ vm }: { vm: BusinessDocumentViewModel }) {
  return (
    <table className="business-document__lines mt-6 w-full border-collapse text-xs">
      <thead>
        <tr className="border-b-2 border-neutral-400">
          {vm.columns.map((col) => (
            <th
              key={col}
              className={`py-2 text-[10px] font-semibold tracking-widest text-neutral-600 uppercase ${
                RIGHT_ALIGNED.has(col) ? 'text-right' : 'text-left'
              } ${col === 'description' ? 'w-full' : 'whitespace-nowrap px-3 first:pl-0 last:pr-0'}`}
            >
              {COLUMN_HEADER[col]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {vm.lines.map((line, i) => (
          <tr key={i} className="border-b border-neutral-200 align-top">
            {vm.columns.map((col) => {
              const right = RIGHT_ALIGNED.has(col);
              const value =
                col === 'code'
                  ? (line.code ?? '')
                  : col === 'description'
                    ? line.description
                    : col === 'quantity'
                      ? line.quantity
                      : col === 'unit'
                        ? (line.unit ?? '')
                        : col === 'unitPrice'
                          ? line.unitPrice
                          : col === 'vat'
                            ? (line.vatLabel ?? '')
                            : line.amount;
              return (
                <td
                  key={col}
                  className={`py-2 ${
                    right ? 'business-document__tabular text-right' : 'text-left'
                  } ${col === 'description' ? '' : 'px-3 whitespace-nowrap first:pl-0 last:pr-0'}`}
                >
                  {value}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DocumentTotals({ vm, isCredit }: { vm: BusinessDocumentViewModel; isCredit: boolean }) {
  return (
    <section className="business-document__totals mt-4 flex justify-end">
      <dl className="w-full max-w-[16rem] space-y-1 text-xs">
        {vm.totals.map((row) => (
          <div
            key={row.label}
            className={`flex justify-between gap-6 ${
              row.emphasis
                ? 'mt-1.5 border-t-2 border-neutral-400 pt-2 text-base font-bold'
                : 'text-neutral-700'
            }`}
          >
            <dt className={row.emphasis ? 'tracking-wide uppercase' : ''}>{row.label}</dt>
            <dd
              className={`business-document__tabular ${
                row.emphasis
                  ? isCredit
                    ? 'text-rose-700'
                    : 'text-neutral-900'
                  : 'text-neutral-800'
              }`}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function NotesAndTerms({ vm }: { vm: BusinessDocumentViewModel }) {
  return (
    <div className="space-y-4">
      {vm.notes && (
        <div>
          <p className={SECTION_HEADING}>Notes</p>
          <p className="text-[11px] leading-relaxed whitespace-pre-wrap">{vm.notes}</p>
        </div>
      )}
      {vm.terms && (
        <div>
          <p className={SECTION_HEADING}>Terms</p>
          <p className="max-w-[38rem] text-[11px] leading-relaxed whitespace-pre-wrap">{vm.terms}</p>
        </div>
      )}
    </div>
  );
}

function PaymentInformation({ vm }: { vm: BusinessDocumentViewModel }) {
  if (!vm.paymentInfo) return null;
  const p = vm.paymentInfo;
  return (
    <div className="business-document__payment">
      <p className={SECTION_HEADING}>Payment information</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[11px]">
        <dt className="text-neutral-500">Bank</dt>
        <dd className="text-neutral-800">{p.bankName}</dd>
        <dt className="text-neutral-500">Account name</dt>
        <dd className="text-neutral-800">{p.accountName}</dd>
        <dt className="text-neutral-500">Account number</dt>
        <dd className="business-document__tabular text-neutral-800">{p.accountNumber}</dd>
        {p.branchCode && (
          <>
            <dt className="text-neutral-500">Branch code</dt>
            <dd className="business-document__tabular text-neutral-800">{p.branchCode}</dd>
          </>
        )}
        {p.swiftCode && (
          <>
            <dt className="text-neutral-500">SWIFT / BIC</dt>
            <dd className="business-document__tabular text-neutral-800">{p.swiftCode}</dd>
          </>
        )}
        <dt className="text-neutral-500">Reference</dt>
        <dd className="text-neutral-800">{p.reference}</dd>
      </dl>
    </div>
  );
}

function DocumentLower({ vm }: { vm: BusinessDocumentViewModel }) {
  const hasPayment = Boolean(vm.paymentInfo);
  return (
    <section
      className={`business-document__lower mt-6 border-t border-neutral-200 pt-4 text-xs text-neutral-700 ${
        hasPayment ? 'grid grid-cols-2 gap-8' : 'space-y-4'
      }`}
    >
      {hasPayment ? (
        <>
          <NotesAndTerms vm={vm} />
          <PaymentInformation vm={vm} />
        </>
      ) : (
        <NotesAndTerms vm={vm} />
      )}
    </section>
  );
}

/** A restrained, print-safe monochrome Vertex mark — outline, never a filled ink block. */
function VertexMark() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-[14px] shrink-0 items-center justify-center rounded-[3px] border border-neutral-400 text-[8px] leading-none font-bold text-neutral-500"
    >
      V
    </span>
  );
}

function DocumentFooter({ vm }: { vm: BusinessDocumentViewModel }) {
  const { generatedLine, rightsLine } = vm.branding.vertexFooter;
  return (
    <footer className="business-document__footer mt-8 border-t border-neutral-200 pt-3 text-center">
      <p className="flex items-center justify-center gap-1.5 text-[10px] font-medium text-neutral-600">
        <VertexMark />
        {generatedLine}
      </p>
      <p className="mt-1 text-[9px] text-neutral-400">{rightsLine}</p>
    </footer>
  );
}
