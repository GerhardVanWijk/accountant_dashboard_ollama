import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, PublicInterestScore, PublicInterestScoreComponents } from '@/types';
import type { IPublicInterestScoreRepository } from './IPublicInterestScoreRepository';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface PublicInterestScoreRow {
  id: string;
  company_id: string;
  financial_year_id: string;
  components: PublicInterestScoreComponents;
  employee_points: number;
  turnover_points: number;
  third_party_liability_points: number;
  shareholder_points: number;
  total_score: number;
  holds_fiduciary_assets_over_threshold: boolean;
  financial_statements_compilation: string | null;
  suggested_assurance_level: string;
  assurance_level_reason: string;
  suggested_reporting_framework: string;
  reporting_framework_confidence: string;
  reporting_framework_reason: string;
  framework_differs_from_current: boolean;
  calculated_at: string;
  calculated_by: string;
  source_reference: string;
  created_at: string;
  updated_at: string;
}

function rowToPublicInterestScore(row: PublicInterestScoreRow): PublicInterestScore {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    companyId: row.company_id,
    financialYearId: row.financial_year_id,
    components: row.components,
    employeePoints: Number(row.employee_points),
    turnoverPoints: Number(row.turnover_points),
    thirdPartyLiabilityPoints: Number(row.third_party_liability_points),
    shareholderPoints: Number(row.shareholder_points),
    totalScore: Number(row.total_score),
    holdsFiduciaryAssetsOverThreshold: row.holds_fiduciary_assets_over_threshold,
    financialStatementsCompilation: (row.financial_statements_compilation ?? undefined) as PublicInterestScore['financialStatementsCompilation'],
    suggestedAssuranceLevel: row.suggested_assurance_level as PublicInterestScore['suggestedAssuranceLevel'],
    assuranceLevelReason: row.assurance_level_reason,
    suggestedReportingFramework: row.suggested_reporting_framework as PublicInterestScore['suggestedReportingFramework'],
    reportingFrameworkConfidence: row.reporting_framework_confidence as PublicInterestScore['reportingFrameworkConfidence'],
    reportingFrameworkReason: row.reporting_framework_reason,
    frameworkDiffersFromCurrent: row.framework_differs_from_current,
    calculatedAt: row.calculated_at,
    calculatedBy: row.calculated_by,
    sourceReference: row.source_reference,
  };
}

/**
 * Supabase-backed IPublicInterestScoreRepository
 * (docs/SUPABASE_MIGRATION_GUIDE.md Phase G). `PublicInterestScore` carries
 * a real `companyId` field — taken directly from the entity. Append-only:
 * no update()/delete(), matching the interface and the RLS policies
 * (SELECT/INSERT only, UPDATE/DELETE/TRUNCATE revoked).
 */
export class SupabasePublicInterestScoreRepository implements IPublicInterestScoreRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getAll(): Promise<PublicInterestScore[]> {
    const { data, error } = await this.client.from('public_interest_scores').select('*').order('calculated_at', { ascending: true });
    if (error) throw new Error(`SupabasePublicInterestScoreRepository.getAll: ${error.message}`);
    return (data as PublicInterestScoreRow[]).map(rowToPublicInterestScore);
  }

  async getById(id: ID): Promise<PublicInterestScore | undefined> {
    const { data, error } = await this.client.from('public_interest_scores').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabasePublicInterestScoreRepository.getById: ${error.message}`);
    }
    return data ? rowToPublicInterestScore(data as PublicInterestScoreRow) : undefined;
  }

  async getByCompany(companyId: ID): Promise<PublicInterestScore[]> {
    const { data, error } = await this.client
      .from('public_interest_scores')
      .select('*')
      .eq('company_id', companyId)
      .order('calculated_at', { ascending: true });
    if (error) {
      if (isInvalidUuidError(error)) return [];
      throw new Error(`SupabasePublicInterestScoreRepository.getByCompany: ${error.message}`);
    }
    return (data as PublicInterestScoreRow[]).map(rowToPublicInterestScore);
  }

  async create(entity: PublicInterestScore): Promise<PublicInterestScore> {
    const { data, error } = await this.client
      .from('public_interest_scores')
      .insert({
        company_id: entity.companyId,
        financial_year_id: entity.financialYearId,
        components: entity.components,
        employee_points: entity.employeePoints,
        turnover_points: entity.turnoverPoints,
        third_party_liability_points: entity.thirdPartyLiabilityPoints,
        shareholder_points: entity.shareholderPoints,
        total_score: entity.totalScore,
        holds_fiduciary_assets_over_threshold: entity.holdsFiduciaryAssetsOverThreshold,
        financial_statements_compilation: entity.financialStatementsCompilation ?? null,
        suggested_assurance_level: entity.suggestedAssuranceLevel,
        assurance_level_reason: entity.assuranceLevelReason,
        suggested_reporting_framework: entity.suggestedReportingFramework,
        reporting_framework_confidence: entity.reportingFrameworkConfidence,
        reporting_framework_reason: entity.reportingFrameworkReason,
        framework_differs_from_current: entity.frameworkDiffersFromCurrent,
        calculated_at: entity.calculatedAt,
        calculated_by: entity.calculatedBy,
        source_reference: entity.sourceReference,
      })
      .select('*')
      .single();
    if (error) throw new Error(`SupabasePublicInterestScoreRepository.create: ${error.message}`);
    return rowToPublicInterestScore(data as PublicInterestScoreRow);
  }
}
