import { describe, expect, it, beforeEach } from 'vitest';
import { RelatedPartyTransactionService } from './relatedPartyTransactionService';
import type { ResolvedSourceDocument, SourceDocumentLookup } from './relatedPartyTransactionService';
import { MockRelatedPartyTransactionRepository } from '../repositories/MockRelatedPartyTransactionRepository';
import type { CreateRelatedPartyTransactionDTO } from './relatedPartyTransactionService';
import type { RelatedParty } from '@/types/relatedParty';

const PARTY: RelatedParty = {
  id: 'rp_1',
  name: 'Jane Director',
  relationshipType: 'director',
  isActive: true,
  effectiveFrom: '2026-01-01',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeTransactionDTO(overrides: Partial<CreateRelatedPartyTransactionDTO> = {}): CreateRelatedPartyTransactionDTO {
  return {
    relatedPartyId: PARTY.id,
    transactionDate: '2026-06-01',
    natureOfTransaction: 'Loan advanced',
    amount: 10000,
    ...overrides,
  };
}

describe('RelatedPartyTransactionService', () => {
  let repository: MockRelatedPartyTransactionRepository;
  let partiesById: Map<string, RelatedParty>;
  let service: RelatedPartyTransactionService;

  beforeEach(() => {
    repository = new MockRelatedPartyTransactionRepository([]);
    partiesById = new Map([[PARTY.id, PARTY]]);
    service = new RelatedPartyTransactionService(repository, {
      getRelatedParty: async (id) => partiesById.get(id),
    });
  });

  it('creates a transaction for an existing related party', async () => {
    const created = await service.createTransaction(makeTransactionDTO());
    expect(created.id).toBeTruthy();
    expect(created.amount).toBe(10000);
  });

  it('rejects creating a transaction for a non-existent related party', async () => {
    await expect(service.createTransaction(makeTransactionDTO({ relatedPartyId: 'nope' }))).rejects.toThrow(/does not exist/);
  });

  it('rejects an empty nature of transaction', async () => {
    await expect(service.createTransaction(makeTransactionDTO({ natureOfTransaction: '  ' }))).rejects.toThrow(/Nature of transaction/);
  });

  it('rejects updating to a non-existent related party', async () => {
    const created = await service.createTransaction(makeTransactionDTO());
    await expect(service.updateTransaction(created.id, { relatedPartyId: 'nope' })).rejects.toThrow(/does not exist/);
  });

  it('updates a transaction', async () => {
    const created = await service.createTransaction(makeTransactionDTO());
    const updated = await service.updateTransaction(created.id, { amount: 25000 });
    expect(updated.amount).toBe(25000);
  });

  it('deletes a transaction', async () => {
    const created = await service.createTransaction(makeTransactionDTO());
    await service.deleteTransaction(created.id);
    expect(await repository.getById(created.id)).toBeUndefined();
  });

  it('filters transactions for a given related party', async () => {
    partiesById.set('rp_2', { ...PARTY, id: 'rp_2', name: 'Other Co' });
    await service.createTransaction(makeTransactionDTO());
    await service.createTransaction(makeTransactionDTO({ relatedPartyId: 'rp_2', natureOfTransaction: 'Consulting fee' }));

    const forParty1 = await service.getTransactionsForParty(PARTY.id);
    expect(forParty1).toHaveLength(1);
    expect(forParty1[0].natureOfTransaction).toBe('Loan advanced');
  });

  describe('source-document linkage (Tax & Compliance integrity audit continuation, 2026-09-12, §10)', () => {
    function makeLookup(resolved: ResolvedSourceDocument | undefined): SourceDocumentLookup {
      return { resolve: async () => resolved };
    }

    it('derives amount/transactionDate/sourceReference from the linked source, never trusting a manually-typed duplicate', async () => {
      const linkedService = new RelatedPartyTransactionService(
        repository,
        { getRelatedParty: async (id) => partiesById.get(id) },
        makeLookup({ amount: 54321, date: '2026-03-15', reference: 'INV-0042' }),
      );

      const created = await linkedService.createTransaction(
        makeTransactionDTO({ amount: 1, transactionDate: '2020-01-01', sourceDocumentType: 'invoice', sourceDocumentId: 'inv_1' }),
      );

      expect(created.amount).toBe(54321);
      expect(created.transactionDate).toBe('2026-03-15');
      expect(created.sourceReference).toBe('INV-0042');
    });

    it('rejects linking a source when no SourceDocumentLookup is configured', async () => {
      // `service` (outer beforeEach) has no lookup wired.
      await expect(
        service.createTransaction(makeTransactionDTO({ sourceDocumentType: 'invoice', sourceDocumentId: 'inv_1' })),
      ).rejects.toThrow(/no SourceDocumentLookup is configured/);
    });

    it('rejects linking to a source record that does not resolve (does not exist / wrong company)', async () => {
      const linkedService = new RelatedPartyTransactionService(
        repository,
        { getRelatedParty: async (id) => partiesById.get(id) },
        makeLookup(undefined),
      );
      await expect(
        linkedService.createTransaction(makeTransactionDTO({ sourceDocumentType: 'invoice', sourceDocumentId: 'does-not-exist' })),
      ).rejects.toThrow(/no invoice record/i);
    });

    it('rejects setting sourceDocumentType without sourceDocumentId (or vice versa) — no half-linked state', async () => {
      await expect(
        service.createTransaction(makeTransactionDTO({ sourceDocumentType: 'invoice' })),
      ).rejects.toThrow(/must both be set/);
    });

    it('a Manual/Other transaction (neither field set) keeps its manually-entered amount/date untouched', async () => {
      const created = await service.createTransaction(makeTransactionDTO({ amount: 7500, transactionDate: '2026-05-01' }));
      expect(created.amount).toBe(7500);
      expect(created.transactionDate).toBe('2026-05-01');
      expect(created.sourceDocumentType).toBeUndefined();
    });
  });
});
