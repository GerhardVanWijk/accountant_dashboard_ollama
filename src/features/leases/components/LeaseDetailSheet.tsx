import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LeaseAmortizationEntry, LeaseContract } from '@/types/lease';
import { RecordDetailSheet, RelatedRecordsSection, type RelatedRecordItem } from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { RecordLink } from '@/components/app/record-link';
import { StatusBadge } from '@/components/app/status-badge';
import { LeaseDetail } from './LeaseDetail';

export interface LeaseDetailSheetProps {
  lease: LeaseContract | undefined;
  amortizationHistory: LeaseAmortizationEntry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeaseDetailSheet({ lease, amortizationHistory, open, onOpenChange }: LeaseDetailSheetProps) {
  const navigate = useNavigate();

  const leaseAmortization = useMemo(() => (lease ? amortizationHistory.filter((e) => e.leaseId === lease.id) : []), [lease, amortizationHistory]);

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!lease) return [];
    const items: RelatedRecordItem[] = [];
    if (lease.journalEntryId) {
      items.push({ label: 'Commencement journal', value: <RecordLink onClick={() => navigate(`/accounting/journals?record=${lease.journalEntryId}`)}>View journal entry</RecordLink> });
    }
    if (lease.terminationJournalEntryId) {
      items.push({ label: 'Termination journal', value: <RecordLink onClick={() => navigate(`/accounting/journals?record=${lease.terminationJournalEntryId}`)}>View journal entry</RecordLink> });
    }
    return items;
  }, [lease, navigate]);

  const state = lease ? 'ready' : 'not-found';

  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={lease?.leaseNumber ?? 'Lease'}
      titleAdornment={lease ? <StatusBadge status={lease.status} /> : undefined}
      state={state}
      notFoundMessage="This lease could not be found — it may have been deleted."
      className="sm:max-w-xl"
    >
      {lease && (
        <div className="flex flex-col gap-6">
          <LeaseDetail lease={lease} amortizationHistory={leaseAmortization} onOpenJournal={(journalEntryId) => navigate(`/accounting/journals?record=${journalEntryId}`)} />
          <RelatedRecordsSection items={relatedItems} />
          <RecordAuditHistorySection recordType="Lease" recordId={lease.id} />
        </div>
      )}
    </RecordDetailSheet>
  );
}
