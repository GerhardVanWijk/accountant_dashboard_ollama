import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanyDocument } from '@/types';
import type {
  CreateCompanyDocumentInput,
  ICompanyDocumentRepository,
  UpdateCompanyDocumentInput,
} from '../repositories/ICompanyDocumentRepository';
import type { ICompanyDocumentStorage } from '../storage/ICompanyDocumentStorage';
import {
  CompanyDocumentService,
  MAX_DOCUMENT_BYTES,
  sanitizeFileName,
  validateUploadFile,
} from './companyDocumentService';

const COMPANY = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';

class FakeRepo implements ICompanyDocumentRepository {
  rows: CompanyDocument[] = [];
  failNextCreate = false;

  async listByCompany(companyId: string) {
    return this.rows.filter((r) => r.companyId === companyId);
  }
  async getById(id: string) {
    return this.rows.find((r) => r.id === id);
  }
  async create(input: CreateCompanyDocumentInput) {
    if (this.failNextCreate) {
      this.failNextCreate = false;
      throw new Error('insert failed');
    }
    const now = new Date().toISOString();
    const row: CompanyDocument = {
      ...input,
      id: `doc-${this.rows.length + 1}`,
      uploadedAt: now,
      updatedAt: now,
      isArchived: false,
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
    };
    this.rows.push(row);
    return row;
  }
  async update(id: string, patch: UpdateCompanyDocumentInput) {
    const row = this.rows.find((r) => r.id === id);
    if (!row) throw new Error('not found');
    Object.assign(row, patch, { updatedAt: new Date().toISOString() });
    return row;
  }
  async remove(id: string) {
    this.rows = this.rows.filter((r) => r.id !== id);
  }
}

class FakeStorage implements ICompanyDocumentStorage {
  objects = new Set<string>();
  upload = vi.fn(async (path: string, _file: Blob, _contentType: string) => {
    this.objects.add(path);
  });
  createSignedUrl = vi.fn(async (path: string, _expires: number) => `https://signed.example/${path}?token=abc`);
  remove = vi.fn(async (path: string) => {
    this.objects.delete(path);
  });
}

function file(name: string, size = 1000, type = 'application/pdf'): File {
  return { name, size, type } as unknown as File;
}

describe('validateUploadFile', () => {
  it('accepts an allowed type within the size limit', () => {
    expect(validateUploadFile(file('cipc.pdf'))).toEqual({ ok: true });
  });

  it('rejects an empty file', () => {
    expect(validateUploadFile(file('x.pdf', 0))).toMatchObject({ ok: false });
  });

  it('rejects a file over 25 MB', () => {
    expect(validateUploadFile(file('big.pdf', MAX_DOCUMENT_BYTES + 1))).toMatchObject({ ok: false });
  });

  it('rejects a disallowed extension (svg)', () => {
    const result = validateUploadFile(file('logo.svg', 100, 'image/svg+xml'));
    expect(result.ok).toBe(false);
  });

  it('rejects an executable disguised with a pdf extension via its MIME type', () => {
    const result = validateUploadFile(file('invoice.pdf', 100, 'text/html'));
    expect(result.ok).toBe(false);
  });
});

describe('sanitizeFileName', () => {
  it('strips path components', () => {
    expect(sanitizeFileName('C:\\Users\\me\\secret\\vat.pdf')).toBe('vat.pdf');
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
  });

  it('replaces unsafe characters', () => {
    expect(sanitizeFileName('my <weird>:name?.pdf')).toBe('my _weird_name_.pdf');
  });

  it('never returns an empty string', () => {
    expect(sanitizeFileName('///')).toBe('document');
  });
});

describe('CompanyDocumentService', () => {
  let repo: FakeRepo;
  let storage: FakeStorage;
  let service: CompanyDocumentService;

  beforeEach(() => {
    repo = new FakeRepo();
    storage = new FakeStorage();
    service = new CompanyDocumentService(repo, storage);
  });

  it('uploads bytes to a company-scoped path then writes the metadata row', async () => {
    const doc = await service.upload(COMPANY, USER, file('VAT 103.pdf'), {
      title: 'VAT 103 certificate',
      category: 'VAT',
      expiryDate: '2027-01-01',
    });

    expect(storage.upload).toHaveBeenCalledOnce();
    const [path, , contentType] = storage.upload.mock.calls[0];
    expect(path).toMatch(new RegExp(`^${COMPANY}/[0-9a-f-]+\\.pdf$`));
    expect(contentType).toBe('application/pdf');
    expect(doc.storagePath).toBe(path);
    expect(doc.fileName).toBe('VAT 103.pdf');
    expect(doc.companyId).toBe(COMPANY);
    expect(doc.uploadedBy).toBe(USER);
    expect(repo.rows).toHaveLength(1);
  });

  it('rejects a disallowed file before touching storage', async () => {
    await expect(
      service.upload(COMPANY, USER, file('x.svg', 100, 'image/svg+xml'), { title: 't', category: 'c' }),
    ).rejects.toThrow();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('removes the orphaned object when the metadata write fails', async () => {
    repo.failNextCreate = true;
    await expect(
      service.upload(COMPANY, USER, file('a.pdf'), { title: 't', category: 'c' }),
    ).rejects.toThrow('insert failed');
    expect(storage.remove).toHaveBeenCalledOnce();
    expect(storage.objects.size).toBe(0);
  });

  it('list() hides archived rows unless asked', async () => {
    const doc = await service.upload(COMPANY, USER, file('a.pdf'), { title: 'a', category: 'c' });
    await service.archive(doc.id);
    expect(await service.list(COMPANY)).toHaveLength(0);
    expect(await service.list(COMPANY, { includeArchived: true })).toHaveLength(1);
  });

  it('archive then restore round-trips', async () => {
    const doc = await service.upload(COMPANY, USER, file('a.pdf'), { title: 'a', category: 'c' });
    expect((await service.archive(doc.id)).isArchived).toBe(true);
    expect((await service.restore(doc.id)).isArchived).toBe(false);
  });

  it('updateMetadata never flips the archive flag', async () => {
    const doc = await service.upload(COMPANY, USER, file('a.pdf'), { title: 'a', category: 'c' });
    await service.archive(doc.id);
    await service.updateMetadata(doc.id, { title: 'renamed', isArchived: false });
    const after = await service.list(COMPANY, { includeArchived: true });
    expect(after[0].title).toBe('renamed');
    expect(after[0].isArchived).toBe(true);
  });

  it('deleteForever removes the row and the object', async () => {
    const doc = await service.upload(COMPANY, USER, file('a.pdf'), { title: 'a', category: 'c' });
    await service.deleteForever({ id: doc.id, storagePath: doc.storagePath });
    expect(repo.rows).toHaveLength(0);
    expect(storage.remove).toHaveBeenCalledWith(doc.storagePath);
  });

  it('getDownloadUrl asks storage for a signed URL', async () => {
    const url = await service.getDownloadUrl({ storagePath: `${COMPANY}/x.pdf` });
    expect(url).toContain('signed.example');
    expect(storage.createSignedUrl).toHaveBeenCalledWith(`${COMPANY}/x.pdf`, 300);
  });
});
