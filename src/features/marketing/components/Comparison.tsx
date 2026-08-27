import { CheckIcon, MinusIcon } from 'lucide-react';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/shadcn/table';
import { comparison } from '../content';
import { SectionHeading } from './SectionHeading';

/** Ported verbatim from accounting-v0-frontend/components/landing/comparison.tsx. */
export function Comparison() {
  return (
    <section id="compare" className="border-y border-border/60 bg-card/20">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <SectionHeading
          kicker="Why businesses switch"
          title="How Vertex compares to Sage Pastel and Xero"
          description="Both are capable products. Vertex is the one built from the ground up for South African compliance, in the browser, with your accountant included."
        />

        <div className="mt-12 overflow-x-auto rounded-2xl border border-border bg-background">
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[46%] py-4 text-xs tracking-wide uppercase">Capability</TableHead>
                {comparison.columns.map((col, i) => (
                  <TableHead key={col} className={i === 0 ? 'py-4 text-center text-xs font-semibold tracking-wide text-brand uppercase' : 'py-4 text-center text-xs tracking-wide uppercase'}>
                    {col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparison.rows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="py-4 text-sm font-normal text-foreground">{row.label}</TableCell>
                  {row.values.map((value, i) => (
                    <TableCell key={i} className="py-4 text-center">
                      <span className="sr-only">{value ? `${comparison.columns[i]}: included` : `${comparison.columns[i]}: not included`}</span>
                      {value ? (
                        <CheckIcon aria-hidden="true" className={i === 0 ? 'mx-auto size-4 text-brand' : 'mx-auto size-4 text-muted-foreground'} />
                      ) : (
                        <MinusIcon aria-hidden="true" className="mx-auto size-4 text-muted-foreground/40" />
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Vertex capabilities reflect the current product. Sage Pastel and Xero comparisons are based on their publicly advertised features and may not reflect their latest versions. Sage and Xero are trademarks of their respective owners and are not affiliated with Vertex.
        </p>
      </div>
    </section>
  );
}
