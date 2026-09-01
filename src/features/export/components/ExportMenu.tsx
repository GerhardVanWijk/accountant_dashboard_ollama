import { useState } from 'react';
import { ChevronDownIcon, DownloadIcon, PrinterIcon } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import type { ExportDataset } from '../types';
import { downloadCSV } from '../csvExport';
import { downloadXLSX } from '../xlsxExport';

export interface ExportMenuProps<T> {
  dataset: ExportDataset<T>;
  /** Defaults to `true` — pass `useCanAccess(...)`'s result to gate export/print behind a permission; `false` renders nothing. */
  allowed?: boolean;
}

/**
 * The ONE export action menu every list/report shares (Phase 7 spec §8):
 * Print / Save PDF, Export CSV, Export Excel. "Print" just calls
 * `window.print()` — the caller is expected to also render
 * `<PrintableReport dataset={...} className="hidden print:block" />`
 * somewhere on the page; the `@media print` rules in
 * `src/styles/globals.css` hide everything else. Disabled whenever there
 * are no rows; a `busy` guard (with a spinner label on the Excel item,
 * the one genuinely slow path for a large dataset) stops a double-click
 * from starting two downloads at once.
 */
export function ExportMenu<T>({ dataset, allowed = true }: ExportMenuProps<T>) {
  const [busy, setBusy] = useState<'csv' | 'xlsx' | null>(null);

  if (!allowed) return null;

  const disabled = dataset.rows.length === 0 || busy !== null;

  function handleCSV() {
    setBusy('csv');
    try {
      downloadCSV(dataset);
    } finally {
      setBusy(null);
    }
  }

  function handleXLSX() {
    setBusy('xlsx');
    // Yield a frame so the disabled/spinner state actually paints before
    // the (synchronous, but non-trivial for a large dataset) workbook
    // build blocks the main thread.
    requestAnimationFrame(() => {
      try {
        downloadXLSX(dataset);
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" variant="outline" disabled={dataset.rows.length === 0} />}>
        <DownloadIcon data-icon="inline-start" />
        Export
        <ChevronDownIcon data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem disabled={disabled} onClick={() => window.print()}>
            <PrinterIcon data-icon="inline-start" />
            Print / Save PDF
          </DropdownMenuItem>
          <DropdownMenuItem disabled={disabled} onClick={handleCSV}>
            Export CSV
          </DropdownMenuItem>
          <DropdownMenuItem disabled={disabled} onClick={handleXLSX}>
            {busy === 'xlsx' ? 'Preparing Excel file…' : 'Export Excel'}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
