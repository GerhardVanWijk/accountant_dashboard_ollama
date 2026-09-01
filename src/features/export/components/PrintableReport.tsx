import { useCompany } from '@/features/admin/hooks/useCompany';
import { formatDateTime } from '@/lib/app/format';
import type { ExportCellValue, ExportDataset } from '../types';

export interface PrintableReportProps<T> {
  dataset: ExportDataset<T>;
  /** Callers render this `hidden print:block` alongside the interactive screen view — see docs/IMPORT_EXPORT_ARCHITECTURE.md § Print. */
  className?: string;
}

function defaultPrintValue(value: ExportCellValue): string {
  if (value === null || value === undefined) return '—';
  if (value instanceof Date) return formatDateTime(value.toISOString());
  return String(value);
}

/**
 * The ONE printable report/list shell every surface shares (Phase 7 spec
 * §5) — company identity, title, subtitle, active filters, a generated
 * timestamp, the data as a plain table, a totals row, and a footer. This
 * is the ONLY thing visible when `window.print()` fires (see the
 * `@media print` rules in `src/styles/globals.css`, which hide the app
 * shell) — it never renders a button, a search box, a sortable header, or
 * any other screen-only control (spec: "must NOT include app sidebar,
 * navigation, buttons, filters, modal chrome"). Reads the single
 * configured company (`useCompany()`) for the header — no logo field
 * exists on `Company` yet, so branding is name + VAT/registration only,
 * gracefully absent when the company hasn't loaded.
 */
export function PrintableReport<T>({ dataset, className }: PrintableReportProps<T>) {
  const { company } = useCompany();
  const generatedAt = dataset.generatedAt ?? new Date();
  const hasTotals = dataset.columns.some((c) => c.total);

  return (
    // aria-hidden: this is a print-only duplicate of the on-screen table (see
    // the `@media print` rules in globals.css — it's the ONLY thing visible
    // when printing, everything else is hidden). Screen readers/assistive
    // tech should never see two copies of the same list.
    // `data-print-only`: a dedicated marker (deliberately NOT `aria-hidden` —
    // Base UI's own Dialog/Sheet/Dropdown primitives legitimately apply
    // `aria-hidden="true"` to background content while a portal is open, so
    // scoping test queries off `aria-hidden` globally would also blind them
    // to real, currently-visible content elsewhere in the app) that
    // jsdom-based tests are configured (tests/setup.ts, `defaultIgnore`) to
    // skip, so `getByText`/`getByRole` queries against the real, interactive
    // table aren't ambiguated by this duplicate.
    <div className={className} aria-hidden="true" data-print-only="true">
      <header className="mb-4 flex flex-col gap-1 border-b border-black pb-3">
        {company && <span className="text-base font-semibold">{company.name}</span>}
        <span className="flex flex-wrap gap-x-4 text-xs text-neutral-600">
          {company?.registrationNumber && <span>Reg: {company.registrationNumber}</span>}
          {company?.vatRegistrationNumber && <span>VAT: {company.vatRegistrationNumber}</span>}
        </span>
        <h1 className="mt-2 text-lg font-bold">{dataset.title}</h1>
        {dataset.subtitle && <p className="text-sm text-neutral-700">{dataset.subtitle}</p>}
        {dataset.filters && dataset.filters.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-x-4 text-xs text-neutral-600">
            {dataset.filters.map((f) => (
              <li key={f.label}>
                {f.label}: {f.value}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-neutral-500">Generated: {formatDateTime(generatedAt.toISOString())}</p>
      </header>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black">
            {dataset.columns.map((c) => (
              <th key={c.key} className={`px-2 py-1.5 font-semibold ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataset.rows.map((row, i) => (
            <tr key={i} className="border-b border-neutral-300">
              {dataset.columns.map((c) => (
                <td key={c.key} className={`px-2 py-1 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                  {c.formatForPrint ? c.formatForPrint(row) : defaultPrintValue(c.accessor(row))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {hasTotals && (
          <tfoot>
            <tr className="border-t-2 border-black font-semibold">
              {dataset.columns.map((c, i) => (
                <td key={c.key} className={`px-2 py-1.5 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                  {c.total ? defaultPrintValue(c.total(dataset.rows)) : i === 0 ? 'Total' : ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>

      {dataset.rows.length === 0 && <p className="py-6 text-center text-sm text-neutral-500">No records match the current view.</p>}

      <footer className="mt-6 border-t border-neutral-300 pt-2 text-xs text-neutral-500">Generated by Vertex</footer>
    </div>
  );
}
