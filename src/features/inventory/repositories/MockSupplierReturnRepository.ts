import type { NewSupplierReturnLine, SupplierReturn, SupplierReturnHeader, SupplierReturnLine } from '@/types';
import { seedSupplierReturns } from '@/mock-data/supplierReturns';
import type { ISupplierReturnRepository } from './ISupplierReturnRepository';
import { MockNormalizedInventoryDocumentRepository } from './MockNormalizedInventoryDocumentRepository';
export class MockSupplierReturnRepository extends MockNormalizedInventoryDocumentRepository<SupplierReturn, SupplierReturnLine, SupplierReturnHeader, NewSupplierReturnLine> implements ISupplierReturnRepository {
  constructor(initialData: SupplierReturn[] = seedSupplierReturns) { super(initialData, 'supplierReturnId', 'srt'); }
}
