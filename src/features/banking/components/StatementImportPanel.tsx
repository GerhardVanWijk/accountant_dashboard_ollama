import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { Amount } from '@/components/app/figure';
import { formatDate } from '@/lib/app/format';
import type { MatchCandidate, ParsedStatementLine, StatementFileFormat } from '../types';
import { detectStatementFormat, parseStatementFile } from '../utils/statementParsers';

const selectClassName =
  'rounded-lg border border-input bg-transparent px-2 py-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

const FORMAT_LABELS: Record<StatementFileFormat, string> = {
  csv: 'CSV',
  ofx: 'OFX / QFX',
  qif: 'QIF',
  mt940: 'SWIFT MT940',
};

export interface StatementImportPanelProps {
  onImport: (lines: ParsedStatementLine[]) => Promise<void>;
  findMatches: (line: ParsedStatementLine) => Promise<MatchCandidate[]>;
  onCancel: () => void;
}

/**
 * Real bank-statement file import — same FileReader/statementParsers.ts
 * (OFX/CSV/QIF/MT940) and smart-matching wiring as before the port, JSX
 * re-skinned. Only the lines the user leaves checked get imported; lines
 * with a strong existing match are unchecked by default (likely already
 * recorded).
 */
export function StatementImportPanel({ onImport, findMatches, onCancel }: StatementImportPanelProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [formatOverride, setFormatOverride] = useState<StatementFileFormat | ''>('');
  const [lines, setLines] = useState<ParsedStatementLine[]>([]);
  const [matches, setMatches] = useState<Map<string, MatchCandidate[]>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setFileName(file.name);
    const format = formatOverride || detectStatementFormat(file.name);
    if (!format) {
      setError('Could not detect the statement format from the file extension — choose one manually.');
      return;
    }

    setIsParsing(true);
    try {
      const content = await file.text();
      const parsed = parseStatementFile(format, content);
      if (parsed.length === 0) {
        setError('No transactions were found in this file.');
        setLines([]);
        return;
      }
      setLines(parsed);

      const matchResults = new Map<string, MatchCandidate[]>();
      const initiallySelected = new Set<string>();
      for (const line of parsed) {
        const candidates = await findMatches(line);
        matchResults.set(line.sourceRowId, candidates);
        // Auto-uncheck lines with a very strong existing match — likely a duplicate of something already recorded.
        if (!candidates.length || candidates[0].score < 70) {
          initiallySelected.add(line.sourceRowId);
        }
      }
      setMatches(matchResults);
      setSelected(initiallySelected);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse this statement file.');
      setLines([]);
    } finally {
      setIsParsing(false);
    }
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleImport() {
    setError(null);
    setIsImporting(true);
    try {
      const linesToImport = lines.filter((l) => selected.has(l.sourceRowId));
      if (linesToImport.length === 0) {
        setError('Select at least one transaction to import.');
        return;
      }
      await onImport(linesToImport);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import statement lines.');
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border p-6 text-center">
        <Download className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
        <label className="cursor-pointer text-sm font-medium text-brand hover:underline">
          Choose a statement file (CSV, OFX/QFX, QIF, or SWIFT MT940)
          <input
            type="file"
            accept=".csv,.ofx,.qfx,.qif,.sta,.mt940,.940,text/csv"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </label>
        {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
        <label className="mx-auto flex items-center gap-2 text-xs text-muted-foreground">
          Format override:
          <select
            className={selectClassName}
            value={formatOverride}
            onChange={(e) => setFormatOverride(e.target.value as StatementFileFormat | '')}
          >
            <option value="">Auto-detect from extension</option>
            {(Object.keys(FORMAT_LABELS) as StatementFileFormat[]).map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABELS[f]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {isParsing && <p className="text-sm text-muted-foreground">Parsing statement file…</p>}

      {!isParsing && lines.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Found <span className="font-semibold text-foreground">{lines.length}</span> transaction(s).{' '}
            {selected.size} selected for import. Lines flagged with a strong existing match are unchecked by default
            (likely already recorded) — review before importing.
          </p>
          <div className="max-h-80 overflow-y-auto rounded-xl border border-border">
            <div className="grid grid-cols-[32px_100px_1.6fr_120px_110px_1.4fr] gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <span />
              <span>Date</span>
              <span>Description</span>
              <span className="text-right">Amount</span>
              <span>Direction</span>
              <span>Best match</span>
            </div>
            {lines.map((line) => {
              const candidates = matches.get(line.sourceRowId) ?? [];
              const best = candidates[0];
              return (
                <div key={line.sourceRowId} className="grid grid-cols-[32px_100px_1.6fr_120px_110px_1.4fr] gap-2 border-b border-border/50 px-3 py-2 text-sm tabular-nums">
                  <input
                    type="checkbox"
                    aria-label={`Import ${line.description}`}
                    checked={selected.has(line.sourceRowId)}
                    onChange={() => toggleRow(line.sourceRowId)}
                    className="size-4 rounded border-input"
                  />
                  <span className="text-muted-foreground">{formatDate(line.date)}</span>
                  <span className="truncate">{line.description}</span>
                  <span className="text-right">
                    <Amount value={line.direction === 'credit' ? -line.amount : line.amount} plain />
                  </span>
                  <span className="text-muted-foreground">{line.direction === 'debit' ? 'Money in' : 'Money out'}</span>
                  <span className="text-xs text-muted-foreground">
                    {best ? `${best.score}% — ${best.reasons.join(', ')}` : 'No match found'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={lines.length === 0 || isImporting} onClick={() => void handleImport()}>
          {isImporting ? 'Importing…' : `Import ${selected.size || ''} transaction${selected.size === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  );
}
