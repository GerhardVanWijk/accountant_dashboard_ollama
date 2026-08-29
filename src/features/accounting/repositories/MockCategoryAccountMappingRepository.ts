import type {
  CategoryAccountMappingRecord,
  ICategoryAccountMappingRepository,
} from './ICategoryAccountMappingRepository';

/**
 * In-memory `ICategoryAccountMappingRepository` for tests and any
 * mock-wired path. Seed it with whatever mapping rows a test needs (an
 * empty list = "no category is mapped", the generic-fallback baseline).
 */
export class MockCategoryAccountMappingRepository implements ICategoryAccountMappingRepository {
  private readonly records: CategoryAccountMappingRecord[];

  constructor(initialData: CategoryAccountMappingRecord[] = []) {
    this.records = initialData.map((r) => ({ ...r }));
  }

  async getAll(): Promise<CategoryAccountMappingRecord[]> {
    return this.records.map((r) => ({ ...r }));
  }
}
