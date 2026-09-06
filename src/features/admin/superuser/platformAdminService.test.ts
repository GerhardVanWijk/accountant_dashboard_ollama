import { describe, expect, it, vi } from 'vitest';

import type { Company, Subscription, SubscriptionPlan } from '@/types';
import { PlatformAdminService } from './services/platformAdminService';
import type { SupabasePlatformAdminRepository } from './repositories/SupabasePlatformAdminRepository';

function company(id: string, over: Partial<Company> = {}): Company {
  return {
    id,
    name: `Company ${id}`,
    legalEntityType: 'private_company',
    financialYearEndMonth: 2,
    financialYearEndDay: 28,
    functionalCurrency: 'ZAR',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  } as Company;
}

const PLANS: SubscriptionPlan[] = [
  { id: 'p-starter', code: 'starter', name: 'Starter', priceCents: 19900, currency: 'ZAR', billingInterval: 'monthly', includedUsers: 1, isActive: true, isPublic: true, displayOrder: 0 },
  { id: 'p-growth', code: 'growth', name: 'Growth', priceCents: 44900, currency: 'ZAR', billingInterval: 'monthly', includedUsers: 3, isActive: true, isPublic: true, displayOrder: 1 },
  { id: 'p-premium', code: 'premium', name: 'Premium', priceCents: 89900, currency: 'ZAR', billingInterval: 'monthly', includedUsers: 10, isActive: true, isPublic: true, displayOrder: 2 },
];

function sub(companyId: string, over: Partial<Subscription> = {}): Subscription {
  return {
    id: `s-${companyId}`,
    companyId,
    planId: 'p-growth',
    status: 'active',
    provider: 'manual',
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
    ...over,
  };
}

function makeService(over: Partial<SupabasePlatformAdminRepository> = {}) {
  const repo = {
    getCompanies: vi.fn().mockResolvedValue([]),
    getSubscriptions: vi.fn().mockResolvedValue([]),
    getPlans: vi.fn().mockResolvedValue(PLANS),
    getMemberCompanyMap: vi.fn().mockResolvedValue(new Map()),
    getCompany: vi.fn(),
    getSubscription: vi.fn().mockResolvedValue(null),
    getCompanyMembers: vi.fn().mockResolvedValue([]),
    getInvitations: vi.fn().mockResolvedValue([]),
    getClientSetup: vi.fn().mockResolvedValue({
      accountCount: 60, financialYearConfigured: true, periodCount: 12, hasActiveAdmin: true, memberCount: 3, bootstrapComplete: true,
    }),
    setCompanySuspended: vi.fn().mockResolvedValue(undefined),
    setSubscriptionPlan: vi.fn().mockResolvedValue(undefined),
    ...over,
  } as unknown as SupabasePlatformAdminRepository;
  return { service: new PlatformAdminService(repo), repo };
}

describe('PlatformAdminService.getClients', () => {
  it('classifies management: no row = unmanaged, provider=manual = manual', async () => {
    const { service } = makeService({
      getCompanies: vi.fn().mockResolvedValue([company('a'), company('b')]),
      getSubscriptions: vi.fn().mockResolvedValue([sub('b', { provider: 'manual' })]),
      getMemberCompanyMap: vi.fn().mockResolvedValue(new Map([['a', 2], ['b', 5]])),
    } as never);

    const clients = await service.getClients();
    const a = clients.find((c) => c.company.id === 'a')!;
    const b = clients.find((c) => c.company.id === 'b')!;

    expect(a.management).toBe('unmanaged');
    expect(a.planCode).toBeNull();
    expect(a.userCount).toBe(2);

    expect(b.management).toBe('manual');
    expect(b.planCode).toBe('growth');
    expect(b.planName).toBe('Growth');
    expect(b.userCount).toBe(5);
  });

  it('classifies a paystack-provided subscription as provider-managed', async () => {
    const { service } = makeService({
      getCompanies: vi.fn().mockResolvedValue([company('c')]),
      getSubscriptions: vi.fn().mockResolvedValue([sub('c', { provider: 'paystack' })]),
    } as never);
    const [c] = await service.getClients();
    expect(c.management).toBe('provider');
  });
});

describe('PlatformAdminService.getClientDetail entitlements', () => {
  it('unmanaged client is entitled to every module', async () => {
    const { service } = makeService({
      getCompany: vi.fn().mockResolvedValue(company('a')),
      getSubscription: vi.fn().mockResolvedValue(null),
    } as never);
    const detail = await service.getClientDetail('a');
    expect(detail?.entitlements).toContain('inventory');
    expect(detail?.entitlements).toContain('payroll');
    expect(detail?.management).toBe('unmanaged');
  });

  it('a Starter subscription grants only Starter modules + core', async () => {
    const { service } = makeService({
      getCompany: vi.fn().mockResolvedValue(company('a')),
      getSubscription: vi.fn().mockResolvedValue(sub('a', { planId: 'p-starter', status: 'active' })),
    } as never);
    const detail = await service.getClientDetail('a');
    expect(detail?.entitlements).toContain('sales');
    expect(detail?.entitlements).toContain('dashboard'); // core
    expect(detail?.entitlements).not.toContain('inventory');
    expect(detail?.entitlements).not.toContain('general_ledger');
  });

  it('a past_due subscription drops to core-only', async () => {
    const { service } = makeService({
      getCompany: vi.fn().mockResolvedValue(company('a')),
      getSubscription: vi.fn().mockResolvedValue(sub('a', { planId: 'p-premium', status: 'past_due' })),
    } as never);
    const detail = await service.getClientDetail('a');
    expect(detail?.entitlements).toContain('dashboard');
    expect(detail?.entitlements).not.toContain('inventory');
    expect(detail?.entitlements).not.toContain('sales');
  });
});

describe('PlatformAdminService mutations route through the audited RPCs', () => {
  it('suspendClient / reactivateClient call set_company_suspended with the right flag', async () => {
    const setCompanySuspended = vi.fn().mockResolvedValue(undefined);
    const { service } = makeService({ setCompanySuspended } as never);
    await service.suspendClient('a', '  non-payment  ');
    await service.reactivateClient('a');
    expect(setCompanySuspended).toHaveBeenNthCalledWith(1, 'a', true, 'non-payment');
    expect(setCompanySuspended).toHaveBeenNthCalledWith(2, 'a', false, null);
  });
});
