import { useEffect, useState } from 'react';
import type { Company } from '@/types';
import { companyService } from '../services';

/**
 * The single configured company (this app is single-tenant per
 * src/types/company.ts's doc comment — there is no multi-company
 * switching yet). Used anywhere a document needs to render the issuing
 * entity's real name/VAT/registration details instead of a placeholder —
 * e.g. tax invoices (SA_ACCOUNTING_MASTER_SPEC.md §13).
 */
export function useCompany() {
  const [company, setCompany] = useState<Company | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    companyService
      .getCompanies()
      .then((companies) => setCompany(companies[0]))
      .finally(() => setLoading(false));
  }, []);

  return { company, loading };
}
