import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID } from '@/types';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

type Aggregate<TLine> = { id: ID; lineItems: TLine[] };
type Header = { id: ID };
type Line = { id: ID };

export interface NormalizedSupabaseConfig<TLine, THeader, TLineCreate> {
  repositoryName: string;
  headerTable: string;
  lineTable: string;
  lineForeignKey: string;
  orderColumn: string;
  rowToHeader(row: Record<string, unknown>): THeader;
  headerToRow(header: Partial<THeader>): Record<string, unknown>;
  rowToLine(row: Record<string, unknown>): TLine;
  lineToRow(line: Partial<TLineCreate>): Record<string, unknown>;
}

/** Supabase implementation shared by normalized inventory header/line documents. */
export class SupabaseNormalizedInventoryDocumentRepository<
  TDocument extends Aggregate<TLine>, TLine extends Line, THeader extends Header, TLineCreate extends object,
> {
  private cachedCompanyId: ID | undefined;
  constructor(protected readonly client: SupabaseClient, private readonly config: NormalizedSupabaseConfig<TLine, THeader, TLineCreate>) {}

  async getAll(): Promise<TDocument[]> {
    const { data, error } = await this.client.from(this.config.headerTable).select('*').order(this.config.orderColumn, { ascending: true });
    if (error) throw new Error(`${this.config.repositoryName}.getAll: ${error.message}`);
    return Promise.all((data as Record<string, unknown>[]).map((row) => this.hydrate(this.config.rowToHeader(row))));
  }
  async getById(id: ID): Promise<TDocument | undefined> {
    const { data, error } = await this.client.from(this.config.headerTable).select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`${this.config.repositoryName}.getById: ${error.message}`);
    }
    return data ? this.hydrate(this.config.rowToHeader(data as Record<string, unknown>)) : undefined;
  }
  async createHeader(header: THeader): Promise<TDocument> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client.from(this.config.headerTable)
      .insert({ ...this.config.headerToRow(header), company_id: companyId }).select('*').single();
    if (error) throw new Error(`${this.config.repositoryName}.createHeader: ${error.message}`);
    return this.hydrate(this.config.rowToHeader(data as Record<string, unknown>));
  }
  async updateHeader(id: ID, patch: Partial<THeader>): Promise<TDocument> {
    const { data, error } = await this.client.from(this.config.headerTable)
      .update(this.config.headerToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`${this.config.repositoryName}.updateHeader: ${error.message}`);
    if (!data) throw new Error(`${this.config.repositoryName}: inventory document "${id}" not found`);
    return this.hydrate(this.config.rowToHeader(data as Record<string, unknown>));
  }
  async deleteHeader(id: ID): Promise<void> {
    const { error } = await this.client.from(this.config.headerTable).delete().eq('id', id);
    if (error) throw new Error(`${this.config.repositoryName}.deleteHeader: ${error.message}`);
  }
  async getLines(documentId: ID): Promise<TLine[]> {
    const { data, error } = await this.client.from(this.config.lineTable).select('*').eq(this.config.lineForeignKey, documentId).order('line_number');
    if (error) throw new Error(`${this.config.repositoryName}.getLines: ${error.message}`);
    return (data as Record<string, unknown>[]).map(this.config.rowToLine);
  }
  async createLine(documentId: ID, line: TLineCreate): Promise<TLine> {
    const companyId = await this.resolveCompanyId();
    const { data: last, error: orderError } = await this.client.from(this.config.lineTable)
      .select('line_number').eq(this.config.lineForeignKey, documentId).order('line_number', { ascending: false }).limit(1);
    if (orderError) throw new Error(`${this.config.repositoryName}.createLine: ${orderError.message}`);
    const lineNumber = Number((last?.[0] as { line_number?: number } | undefined)?.line_number ?? 0) + 1;
    const { data, error } = await this.client.from(this.config.lineTable)
      .insert({ ...this.config.lineToRow(line), company_id: companyId, line_number: lineNumber, [this.config.lineForeignKey]: documentId }).select('*').single();
    if (error) throw new Error(`${this.config.repositoryName}.createLine: ${error.message}`);
    return this.config.rowToLine(data as Record<string, unknown>);
  }
  async updateLine(documentId: ID, lineId: ID, patch: Partial<TLineCreate>): Promise<TLine> {
    const { data, error } = await this.client.from(this.config.lineTable).update(this.config.lineToRow(patch))
      .eq(this.config.lineForeignKey, documentId).eq('id', lineId).select('*').maybeSingle();
    if (error) throw new Error(`${this.config.repositoryName}.updateLine: ${error.message}`);
    if (!data) throw new Error(`${this.config.repositoryName}: inventory document line "${lineId}" not found`);
    return this.config.rowToLine(data as Record<string, unknown>);
  }
  async deleteLine(documentId: ID, lineId: ID): Promise<void> {
    const { error } = await this.client.from(this.config.lineTable).delete().eq(this.config.lineForeignKey, documentId).eq('id', lineId);
    if (error) throw new Error(`${this.config.repositoryName}.deleteLine: ${error.message}`);
  }
  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, this.config.repositoryName);
    return this.cachedCompanyId;
  }
  private async hydrate(header: THeader): Promise<TDocument> {
    return { ...header, lineItems: await this.getLines(header.id) } as unknown as TDocument;
  }
}
