import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import type { ReportingStandardName } from '@/types';
import { useReportingStandards } from '../hooks/useReportingStandards';
import { resolveApplicableVersion } from '../services/reportingStandardCalculations';
import { Modal } from '../components/Modal';
import { AddReportingStandardVersionForm } from '../components/AddReportingStandardVersionForm';

const STANDARD_LABELS: Record<ReportingStandardName, string> = {
  full_ifrs: 'Full IFRS',
  ifrs_for_smes: 'IFRS for SMEs',
};

const STANDARDS: ReportingStandardName[] = ['full_ifrs', 'ifrs_for_smes'];

/**
 * Reporting Standards — route `/compliance/reporting-standards`
 * (SA_ACCOUNTING_MASTER_SPEC.md §48/§49, §116 Phase 12 "Advanced
 * Accounting"). Resolves which EDITION of Full IFRS / IFRS for SMEs
 * applies to the company's open financial year, with early adoption as an
 * explicit toggle — never assumed. Does NOT enumerate the actual
 * disclosure content of any edition (see `src/types/reportingStandard.ts`'s
 * doc comment for why fabricating that would violate §110).
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
    return <Spinner label="Loading reporting standards…" />;
  }
  if (error) {
    return <ErrorState message={error.message} onRetry={refetch} />;
  }

  return (
    <div className="flex flex-col gap-lg">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Reporting Standards</h1>
        <p className="mt-xs text-sm text-text-secondary">
          Which edition of Full IFRS / IFRS for SMEs applies to a reporting period, and its version history (§48/§49).
          /compliance/reporting-standards
        </p>
      </div>

      {actionError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-md py-sm text-sm text-danger">
          {actionError}
        </p>
      )}
      {statusMessage && (
        <p role="status" className="rounded-md border border-border bg-positive/10 px-md py-sm text-sm text-positive">
          {statusMessage}
        </p>
      )}

      <p role="note" className="rounded-md border border-warning bg-warning/10 px-md py-sm text-sm text-warning-financial">
        This resolves which EDITION of a framework applies to a period — it does not enumerate that edition&apos;s actual disclosure
        requirements (no verified, complete clause-level checklist exists for this system to encode). Requires professional/accounting
        review before relying on it for a statutory filing (§110/§111).
      </p>

      {!openFinancialYear ? (
        <Card>
          <p className="text-sm text-text-secondary">No financial years configured yet.</p>
        </Card>
      ) : (
        <>
          <label className="flex items-center gap-sm text-sm text-text-primary">
            <input type="checkbox" checked={earlyAdoptionElected} onChange={(e) => setEarlyAdoptionElected(e.target.checked)} />
            Elect early adoption for {openFinancialYear.name} (where a later edition permits it)
          </label>

          <div className="grid grid-cols-1 gap-md md:grid-cols-2">
            {STANDARDS.map((standard) => {
              const applicable = resolveApplicableVersion(historyByStandard[standard], new Date(openFinancialYear.startDate), earlyAdoptionElected);
              return (
                <Card key={standard} className="flex flex-col gap-sm">
                  <h2 className="text-sm font-semibold text-text-primary">{STANDARD_LABELS[standard]}</h2>
                  <p className="text-xs text-text-secondary">Applicable to {openFinancialYear.name}:</p>
                  <p className="text-lg font-semibold text-text-primary">{applicable ? applicable.versionLabel : 'No version resolves'}</p>
                  {applicable && <p className="text-xs text-text-muted">Effective from {applicable.effectiveFrom.slice(0, 10)}</p>}
                </Card>
              );
            })}
          </div>

          {STANDARDS.map((standard) => (
            <div key={standard}>
              <div className="mb-sm flex items-center justify-between">
                <h2 className="text-lg font-semibold text-text-primary">{STANDARD_LABELS[standard]} — Edition History</h2>
                <Button variant="ghost" onClick={() => setAddModalStandard(standard)}>
                  Add New Edition
                </Button>
              </div>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead className="bg-background">
                    <tr>
                      <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Version</th>
                      <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Effective From</th>
                      <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Early Adoption</th>
                      <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyByStandard[standard].map((v) => (
                      <tr key={v.id} className="border-t border-border/50">
                        <td className="whitespace-nowrap px-md py-sm text-text-primary">{v.versionLabel}</td>
                        <td className="whitespace-nowrap px-md py-sm text-text-secondary">{v.effectiveFrom.slice(0, 10)}</td>
                        <td className="whitespace-nowrap px-md py-sm text-text-secondary">{v.earlyAdoptionPermitted ? 'Yes' : 'No'}</td>
                        <td className="whitespace-nowrap px-md py-sm text-text-secondary">{v.supersededByVersionId ? 'Superseded' : 'Current'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}

      {addModalStandard && (
        <Modal title={`Add New ${STANDARD_LABELS[addModalStandard]} Edition`} onClose={() => setAddModalStandard(null)}>
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
        </Modal>
      )}
    </div>
  );
}
