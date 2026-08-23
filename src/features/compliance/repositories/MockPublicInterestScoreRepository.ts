import type { PublicInterestScore } from '@/types';
import type { IPublicInterestScoreRepository } from './IPublicInterestScoreRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `pis_${Math.random().toString(36).slice(2, 10)}`;
}

/** Deep-enough copy so a caller mutating a returned row can't corrupt this store — same discipline MockJournalEntryRepository applies to `lines`. */
function cloneScore(score: PublicInterestScore): PublicInterestScore {
  return { ...score, components: { ...score.components } };
}

/**
 * In-memory implementation of the append-only Public Interest Score history
 * (IPublicInterestScoreRepository). No seed data — same rationale as
 * `seedFixedAssets.ts`/`seedEmployees.ts` having no seeded posted status:
 * calculate a real score through the UI to get genuine history, rather than
 * fabricating one with no real Employee/GL data behind it.
 */
export class MockPublicInterestScoreRepository implements IPublicInterestScoreRepository {
  private scores: PublicInterestScore[] = [];

  async getAll(): Promise<PublicInterestScore[]> {
    return this.scores.map(cloneScore);
  }

  async getById(id: string): Promise<PublicInterestScore | undefined> {
    const score = this.scores.find((s) => s.id === id);
    return score ? cloneScore(score) : undefined;
  }

  async getByCompany(companyId: string): Promise<PublicInterestScore[]> {
    return this.scores.filter((s) => s.companyId === companyId).map(cloneScore);
  }

  async create(entity: PublicInterestScore): Promise<PublicInterestScore> {
    const now = nowISO();
    const record: PublicInterestScore = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: now,
      updatedAt: now,
    };
    this.scores.push(record);
    return cloneScore(record);
  }
}
