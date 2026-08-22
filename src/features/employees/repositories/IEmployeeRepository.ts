import type { Employee } from '@/types';
import type { IRepository } from '@/repositories/IRepository';

/** Employee master data contract, mirroring IFixedAssetRepository's shape. */
export type IEmployeeRepository = IRepository<Employee>;
