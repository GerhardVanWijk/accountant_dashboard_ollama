import type { ID } from '@/types';

type Aggregate<TLine> = { id: ID; createdAt: string; updatedAt: string; lineItems: TLine[] };
type IdentifiedLine = { id: ID };

/** Shared in-memory normalized store used by the five inventory document mocks. */
export class MockNormalizedInventoryDocumentRepository<
  TDocument extends Aggregate<TLine>, TLine extends IdentifiedLine,
  THeader extends Omit<TDocument, 'lineItems'>, TLineCreate extends object,
> {
  protected headers: THeader[];
  protected lines: TLine[];
  constructor(initialData: TDocument[], private readonly parentKey: string, private readonly idPrefix: string) {
    this.headers = initialData.map(({ lineItems: _lines, ...header }) => ({ ...header } as THeader));
    this.lines = initialData.flatMap((document) => document.lineItems.map((line) => ({ ...line })));
  }
  protected now(): string { return new Date().toISOString(); }
  protected generateId(prefix = this.idPrefix): string { return `${prefix}_${Math.random().toString(36).slice(2, 10)}`; }
  async getAll(): Promise<TDocument[]> { return Promise.all(this.headers.map((header) => this.hydrate(header))); }
  async getById(id: ID): Promise<TDocument | undefined> {
    const header = this.headers.find((item) => item.id === id);
    return header ? this.hydrate(header) : undefined;
  }
  async createHeader(header: THeader): Promise<TDocument> {
    const now = this.now();
    const { lineItems = [], ...headerOnly } = header as THeader & { lineItems?: Array<TLineCreate & Partial<IdentifiedLine>> };
    const record = { ...headerOnly, id: header.id || this.generateId(), createdAt: now, updatedAt: now } as THeader;
    this.headers.push(record);
    for (const line of lineItems) {
      const { id: requestedId, ...values } = line;
      const created = await this.createLine(record.id, values as TLineCreate);
      if (requestedId) {
        const index = this.lines.findIndex((item) => item.id === created.id);
        this.lines[index] = { ...this.lines[index], id: requestedId };
      }
    }
    return this.hydrate(record);
  }
  async updateHeader(id: ID, patch: Partial<THeader>): Promise<TDocument> {
    const index = this.headers.findIndex((item) => item.id === id);
    if (index < 0) throw new Error(`Inventory document "${id}" not found`);
    const { lineItems, ...headerPatch } = patch as Partial<THeader> & { lineItems?: TLine[] };
    this.headers[index] = { ...this.headers[index], ...headerPatch, id, updatedAt: this.now() };
    if (lineItems) {
      const existingIds = new Set(lineItems.map((line) => line.id));
      this.lines = this.lines.filter((line) => this.parentId(line) !== id || existingIds.has(line.id));
      for (const line of lineItems) {
        const current = this.lines.findIndex((item) => item.id === line.id && this.parentId(item) === id);
        const normalized = { ...line, [this.parentKey]: id } as TLine;
        if (current >= 0) this.lines[current] = normalized;
        else this.lines.push(normalized);
      }
    }
    return this.hydrate(this.headers[index]);
  }
  async deleteHeader(id: ID): Promise<void> {
    this.headers = this.headers.filter((item) => item.id !== id);
    this.lines = this.lines.filter((line) => this.parentId(line) !== id);
  }
  async getLines(documentId: ID): Promise<TLine[]> {
    return this.lines.filter((line) => this.parentId(line) === documentId).map((line) => ({ ...line }));
  }
  async createLine(documentId: ID, line: TLineCreate): Promise<TLine> {
    if (!this.headers.some((header) => header.id === documentId)) throw new Error(`Inventory document "${documentId}" not found`);
    const suppliedId = (line as TLineCreate & { id?: ID }).id;
    const record = { ...line, id: suppliedId || this.generateId(`${this.idPrefix}l`), [this.parentKey]: documentId } as unknown as TLine;
    this.lines.push(record); this.touch(documentId); return { ...record };
  }
  async updateLine(documentId: ID, lineId: ID, patch: Partial<TLineCreate>): Promise<TLine> {
    const index = this.lines.findIndex((line) => line.id === lineId && this.parentId(line) === documentId);
    if (index < 0) throw new Error(`Inventory document line "${lineId}" not found`);
    this.lines[index] = { ...this.lines[index], ...patch, id: lineId, [this.parentKey]: documentId };
    this.touch(documentId); return { ...this.lines[index] };
  }
  async deleteLine(documentId: ID, lineId: ID): Promise<void> {
    const before = this.lines.length;
    this.lines = this.lines.filter((line) => !(line.id === lineId && this.parentId(line) === documentId));
    if (before === this.lines.length) throw new Error(`Inventory document line "${lineId}" not found`);
    this.touch(documentId);
  }
  private parentId(line: TLine): ID { return (line as unknown as Record<string, ID>)[this.parentKey]; }
  private async hydrate(header: THeader): Promise<TDocument> { return { ...header, lineItems: await this.getLines(header.id) } as unknown as TDocument; }
  private touch(id: ID): void { const header = this.headers.find((item) => item.id === id); if (header) header.updatedAt = this.now(); }
}
