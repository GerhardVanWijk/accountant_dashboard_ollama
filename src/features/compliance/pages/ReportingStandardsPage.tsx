import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { Checkbox } from '@/components/ui/shadcn/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/shadcn/dialog';
import { formatDate } from '@/lib/app/format';
import type { ReportingStandardName } from '@/types';
import { useReportingStandards } from '../hooks/useReportingStandards';
import { resolveApplicableVersion } from '../services/reportingStandardCalculations';
import { AddReportingStandardVersionForm } from '../components/AddReportingStandardVersionForm';

const STANDARD_LABELS: Record<ReportingStandardName, string> = {
  full_ifrs: 'Full IFRS',
  ifrs_for_smes: 'IFRS for SMEs',
};

const STANDARDS: ReportingStandardName[] = ['full_ifrs', 'ifrs_for_smes'];

/**
 * Reporting Standards — route `/compliance/reporting-standards`.
 * Resolves which EDITION of Full IFRS / IFRS for SMEs applies to the
 * company's open financial year, with early adoption as an explicit
 * toggle — never assumed. Does NOT enumerate the actual disclosure
 * content of any edition (no verified, complete clause-level checklist
 * exists for this system to encode). Re-skinned onto v0's
 * PageHeader/SectionCard/Dialog (M7); data/mutation wiring unchanged.
 */
export function ReportingStandardsPage() {
  const { financialYears, versions, loading, error, refetch, supersede } = useReportingStandards();
  const [earlyAdoptionElected, setEarlyAdoptionElected] = useState(false);
  const [addModalStandard, setAddModalStandard] = useState<ReportingStandardName | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const openFinancialYear = useMemo(() => financialYears.find((fy) => fy.status === 'open') ?? financialYears[0], [financialYears]);

  const historyByStandard = useMemo(() => {
    const map: Record<ReportingStandardName, typeof versions> = { full_ifrs: [], ifrs_for_smes: [] };
    for (const v of versions) map[v.standard].push(v);
    for (const standard of STANDARDS) map[standard].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    return map;
  }, [versions]);

  if (loading) {
    return (
      <div role="status" className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        <span className="text-sm">Loading reporting standards…</span>
      </div>
    );
  }
  if (error) {
    return (
      <SectionCard>
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
        <Button variant="outline" className="mt-3" onClick={refetch}>
          Retry
        </Button>
      </SectionCard>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reporting Standards" description="Which edition of Full IFRS / IFRS for SMEs applies to a reporting period, and its version history." />

      {actionError && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {actionError}
        </p>
      )}
      {statusMessage && (
        <p role="status" className="rounded-lg border border-positive/40 bg-positive/10 px-4 py-2.5 text-sm text-positive">
          {statusMessage}
        </p>
      )}

      <p role="note" className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-warning">
        This resolves which EDITION of a framework applies to a period — it does not enumerate that edition&apos;s actual disclosure requirements (no verified, complete clause-level
        checklist exists for this system to encode). Requires professional/accounting review before relying on it for a statutory filing.
      </p>

      {!openFinancialYear ? (
        <SectionCard>
          <p className="text-sm text-muted-foreground">No financial years configured yet.</p>
        </SectionCard>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={earlyAdoptionElected} onCheckedChange={(value) => setEarlyAdoptionElected(value === true)} />
            Elect early adoption for {openFinancialYear.name} (where a later edition permits it)
          </label>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {STANDARDS.map((standard) => {
              const applicable = resolveApplicableVersion(historyByStandard[standard], new Date(openFinancialYear.startDate), earlyAdoptionElected);
              return (
                <SectionCard key={standard} title={STANDARD_LABELS[standard]}>
                  <p className="text-xs text-muted-foreground">Applicable to {openFinancialYear.name}:</p>
                  <p className="mt-1 text-lg font-semibold">{applicable ? applicable.versionLabel : 'No version resolves'}</p>
                  {applicable && <p className="mt-1 text-xs text-muted-foreground">Effective from {formatDate(applicable.effectiveFrom)}</p>}
                </SectionCard>
              );
            })}
          </div>

          {STANDARDS.map((standard) => (
            <SectionCard
              key={standard}
              title={`${STANDARD_LABELS[standard]} — Edition History`}
              actions={
                <Button variant="outline" onClick={() => setAddModalStandard(standard)}>
                  Add New Edition
                </Button>
              }
            >
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Version</th>
                      <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Effective From</th>
                      <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Early Adoption</th>
                      <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyByStandard[standard].map((v) => (
                      <tr key={v.id} className="border-t border-border">
                        <td className="whitespace-nowrap px-4 py-2.5">{v.versionLabel}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{formatDate(v.effectiveFrom)}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{v.earlyAdoptionPermitted ? 'Yes' : 'No'}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{v.supersededByVersionId ? 'Superseded' : 'Current'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          ))}
        </>
      )}

      <Dialog open={addModalStandard !== null} onOpenChange={(open) => { if (!open) setAddModalStandard(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{addModalStandard ? `Add New ${STANDARD_LABELS[addModalStandard]} Edition` : ''}</DialogTitle>
          </DialogHeader>
          {addModalStandard && (
            <AddReportingStandardVersionForm
              standard={addModalStandard}
              onCancel={() => setAddModalStandard(null)}
              onSubmit={async (input, reason) => {
                setActionError(null);
                try {
                  await supersede(input, reason);
                  setStatusMessage(`Added a new ${STANDARD_LABELS[addModalStandard]} edition.`);
                  setAddModalStandard(null);
                } catch (err) {
                  setActionError(err instanceof Error ? err.message : 'Failed to add the new edition.');
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
