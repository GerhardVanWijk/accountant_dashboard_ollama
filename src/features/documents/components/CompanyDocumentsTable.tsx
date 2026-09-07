import { Download, MoreHorizontal, Pencil, Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import type { CompanyDocument, Profile } from '@/types';
import { documentExpiryStatus } from '@/types';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import { cn } from '@/lib/utils';
import { formatDate, formatDateTime, formatFileSize } from '@/lib/app/format';

export interface CompanyDocumentsTableProps {
  documents: CompanyDocument[];
  profilesById: Map<string, Profile>;
  canManage: boolean;
  canDeleteForever: boolean;
  onDownload: (doc: CompanyDocument) => void;
  onEdit: (doc: CompanyDocument) => void;
  onArchiveToggle: (doc: CompanyDocument) => void;
  onDeleteForever: (doc: CompanyDocument) => void;
}

function uploaderName(id: string, profilesById: Map<string, Profile>): string {
  const p = profilesById.get(id);
  if (!p) return 'Unknown';
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email || 'Unknown';
}

const EXPIRY_BADGE: Record<string, { label: string; className: string }> = {
  expired: { label: 'Expired', className: 'bg-status-negative-muted text-status-negative' },
  expiring_soon: { label: 'Expiring soon', className: 'bg-status-warning-muted text-status-warning' },
  ok: { label: 'Valid', className: 'bg-status-positive-muted text-status-positive' },
};

export function CompanyDocumentsTable({
  documents,
  profilesById,
  canManage,
  canDeleteForever,
  onDownload,
  onEdit,
  onArchiveToggle,
  onDeleteForever,
}: CompanyDocumentsTableProps) {
  const categories = [...new Set(documents.map((d) => d.category))].sort();

  const columns: DataTableColumn<CompanyDocument>[] = [
    {
      key: 'document',
      header: 'Document',
      sortValue: (d) => d.title.toLowerCase(),
      cell: (d) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{d.title}</span>
          <span className="text-xs text-muted-foreground">{d.fileName}</span>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortValue: (d) => d.category,
      cell: (d) => <Badge variant="outline">{d.category}</Badge>,
    },
    {
      key: 'documentDate',
      header: 'Document date',
      hideBelowLg: true,
      sortValue: (d) => d.documentDate ?? '',
      cell: (d) => (
        <span className="figure text-muted-foreground tabular-nums">
          {d.documentDate ? formatDate(d.documentDate) : '—'}
        </span>
      ),
    },
    {
      key: 'expiry',
      header: 'Expiry',
      hideBelowMd: true,
      sortValue: (d) => d.expiryDate ?? '9999',
      cell: (d) => {
        if (!d.expiryDate) return <span className="text-xs text-muted-foreground">—</span>;
        const status = documentExpiryStatus(d);
        const badge = EXPIRY_BADGE[status];
        return (
          <div className="flex flex-col gap-0.5">
            <span className="figure text-xs tabular-nums text-muted-foreground">
              {formatDate(d.expiryDate)}
            </span>
            {badge && (
              <Badge variant="outline" className={cn('border-transparent', badge.className)}>
                {badge.label}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: 'uploadedBy',
      header: 'Uploaded by',
      hideBelowXl: true,
      sortValue: (d) => uploaderName(d.uploadedBy, profilesById),
      cell: (d) => <span className="text-sm">{uploaderName(d.uploadedBy, profilesById)}</span>,
    },
    {
      key: 'uploadedAt',
      header: 'Uploaded',
      hideBelowLg: true,
      sortValue: (d) => d.uploadedAt,
      cell: (d) => (
        <span className="figure text-xs tabular-nums text-muted-foreground">
          {formatDateTime(d.uploadedAt)}
        </span>
      ),
    },
    {
      key: 'size',
      header: 'Size',
      align: 'right',
      hideBelowMd: true,
      sortValue: (d) => d.fileSize,
      cell: (d) => (
        <span className="figure text-xs tabular-nums text-muted-foreground">
          {formatFileSize(Math.max(1, Math.round(d.fileSize / 1024)))}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (d) => (d.isArchived ? 'archived' : 'active'),
      cell: (d) =>
        d.isArchived ? (
          <Badge variant="outline" className="border-transparent bg-muted text-muted-foreground">
            Archived
          </Badge>
        ) : (
          <Badge variant="outline" className="border-transparent bg-status-positive-muted text-status-positive">
            Active
          </Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (d) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${d.title}`} />}
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onDownload(d)}>
              <Download data-icon="inline-start" />
              Download
            </DropdownMenuItem>
            {canManage && (
              <DropdownMenuItem onClick={() => onEdit(d)}>
                <Pencil data-icon="inline-start" />
                Edit details
              </DropdownMenuItem>
            )}
            {canManage && (
              <DropdownMenuItem onClick={() => onArchiveToggle(d)}>
                {d.isArchived ? (
                  <>
                    <ArchiveRestore data-icon="inline-start" />
                    Restore
                  </>
                ) : (
                  <>
                    <Archive data-icon="inline-start" />
                    Archive
                  </>
                )}
              </DropdownMenuItem>
            )}
            {canDeleteForever && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => onDeleteForever(d)}>
                  <Trash2 data-icon="inline-start" />
                  Delete permanently
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <DataTable
      rows={documents}
      columns={columns}
      getRowKey={(d) => d.id}
      searchable={(d) => [d.title, d.fileName, d.category, d.description ?? '', d.tags.join(' ')].join(' ')}
      searchPlaceholder="Search documents"
      initialSortKey="uploadedAt"
      initialSortDirection="desc"
      filters={[
        {
          key: 'category',
          label: 'All categories',
          options: categories.map((c) => ({ value: c, label: c })),
          match: (d, v) => d.category === v,
        },
        {
          key: 'expiry',
          label: 'Any expiry',
          options: [
            { value: 'expired', label: 'Expired' },
            { value: 'expiring_soon', label: 'Expiring soon' },
            { value: 'has_expiry', label: 'Has an expiry date' },
            { value: 'no_expiry', label: 'No expiry date' },
          ],
          match: (d, v) => {
            if (v === 'has_expiry') return Boolean(d.expiryDate);
            if (v === 'no_expiry') return !d.expiryDate;
            return documentExpiryStatus(d) === v;
          },
        },
      ]}
      emptyTitle="No documents"
      emptyDescription="Upload company registration documents, tax letters, contracts, licences and other important records."
    />
  );
}
