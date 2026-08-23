import type { AuditAccessResult, AuditLogAccessEntry, ID } from '@/types';

export type LogAccessDTO = {
  actorId: ID;
  action: string;
  tableName: string;
  companyId?: ID;
  result: AuditAccessResult;
  detail?: Record<string, unknown>;
};

export interface IAuditLogAccessRepository {
  getByCompany(companyId: ID, limit: number): Promise<AuditLogAccessEntry[]>;
  getByUser(userId: ID, companyId: ID): Promise<AuditLogAccessEntry[]>;
  log(entry: LogAccessDTO): Promise<void>;
}
