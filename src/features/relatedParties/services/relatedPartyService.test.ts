import { describe, expect, it, beforeEach } from 'vitest';
import { RelatedPartyService } from './relatedPartyService';
import { MockRelatedPartyRepository } from '../repositories/MockRelatedPartyRepository';
import type { CreateRelatedPartyDTO } from './relatedPartyService';
import type { RelatedPartyTransaction } from '@/types/relatedParty';

function makeRelatedPartyDTO(overrides: Partial<CreateRelatedPartyDTO> = {}): CreateRelatedPartyDTO {
  return {
    name: 'Jane Director',
    relationshipType: 'director',
    relationshipDetail: 'CEO',
    isActive: true,
    ...overrides,
  };
}

describe('RelatedPartyService', () => {
  let repository: MockRelatedPartyRepository;
  let transactions: Pick<RelatedPartyTransaction, 'relatedPartyId'>[];
  let service: RelatedPartyService;

  beforeEach(() => {
    repository = new MockRelatedPartyRepository([]);
    transactions = [];
    service = new RelatedPartyService(repository, { getAll: async () => transactions });
  });

  it('creates a related party', async () => {
    const created = await service.createRelatedParty(makeRelatedPartyDTO());
    expect(created.id).toBeTruthy();
    expect(created.name).toBe('Jane Director');
    expect(created.relationshipType).toBe('director');
  });

  it('rejects an empty name on create', async () => {
    await expect(service.createRelatedParty(makeRelatedPartyDTO({ name: '   ' }))).rejects.toThrow(/name is required/);
  });

  it('rejects an empty name on update', async () => {
    const created = await service.createRelatedParty(makeRelatedPartyDTO());
    await expect(service.updateRelatedParty(created.id, { name: '' })).rejects.toThrow(/name is required/);
  });

  it('updates a related party', async () => {
    const created = await service.createRelatedParty(makeRelatedPartyDTO());
    const updated = await service.updateRelatedParty(created.id, { relationshipDetail: 'CFO now' });
    expect(updated.relationshipDetail).toBe('CFO now');
  });

  it('lists and gets related parties', async () => {
    const created = await service.createRelatedParty(makeRelatedPartyDTO());
    expect(await service.getRelatedParties()).toHaveLength(1);
    expect(await service.getRelatedParty(created.id)).toMatchObject({ id: created.id });
  });

  it('deletes a related party with no transactions', async () => {
    const created = await service.createRelatedParty(makeRelatedPartyDTO());
    await service.deleteRelatedParty(created.id);
    expect(await repository.getById(created.id)).toBeUndefined();
  });

  it('refuses to delete a related party referenced by an existing transaction', async () => {
    const created = await service.createRelatedParty(makeRelatedPartyDTO());
    transactions = [{ relatedPartyId: created.id }];

    await expect(service.deleteRelatedParty(created.id)).rejects.toThrow(/referenced by an existing related-party transaction/);
    expect(await repository.getById(created.id)).toBeDefined();
  });

  it('allows deleting a different related party unaffected by another party\'s transactions', async () => {
    const referenced = await service.createRelatedParty(makeRelatedPartyDTO({ name: 'Referenced Co' }));
    const unreferenced = await service.createRelatedParty(makeRelatedPartyDTO({ name: 'Unreferenced Co' }));
    transactions = [{ relatedPartyId: referenced.id }];

    await service.deleteRelatedParty(unreferenced.id);
    expect(await repository.getById(unreferenced.id)).toBeUndefined();
    expect(await repository.getById(referenced.id)).toBeDefined();
  });

  it('throws when deleting a non-existent related party', async () => {
    await expect(service.deleteRelatedParty('does-not-exist')).rejects.toThrow(/not found/);
  });
});
