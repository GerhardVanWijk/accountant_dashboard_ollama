import { describe, expect, it, beforeEach } from 'vitest';
import { RelatedPartyTransactionService } from './relatedPartyTransactionService';
import { MockRelatedPartyTransactionRepository } from '../repositories/MockRelatedPartyTransactionRepository';
import type { CreateRelatedPartyTransactionDTO } from './relatedPartyTransactionService';
import type { RelatedParty } from '@/types/relatedParty';

const PARTY: RelatedParty = {
  id: 'rp_1',
  name: 'Jane Director',
  relationshipType: 'director',
  isActive: true,
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
});
