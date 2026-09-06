import { supabase } from '@/config/supabase';

import type { CompanyInvitation, CreatedInvitation, ID, ProfileRole } from '@/types';
import { SupabaseInvitationRepository } from '../repositories/SupabaseInvitationRepository';
import { emailDelivery, type EmailDelivery } from '../email/EmailDelivery';

/**
 * Flow B — invite an email that has no Vertex account yet. Flow A (an
 * existing companyless user) stays on `profileService.addExistingUserToCompany`
 * (migration 0065). Email delivery goes through the `EmailDelivery`
 * boundary — currently a no-op, so `createInvitation` truthfully reports
 * `emailSent: false` and the caller shows the copyable link.
 */
export class InvitationService {
  constructor(
    private readonly repository: SupabaseInvitationRepository,
    private readonly email: EmailDelivery,
  ) {}

  async createInvitation(input: {
    email: string;
    profileRole: ProfileRole;
    roleId?: ID;
    companyName: string;
    origin: string;
    invitedByName?: string;
  }): Promise<CreatedInvitation> {
    const created = await this.repository.create(input.email, input.profileRole, input.roleId);
    const acceptUrl = `${input.origin}${created.acceptPath}`;
    const result = await this.email
      .sendInvitation({ to: created.email, companyName: input.companyName, acceptUrl, expiresAt: created.expiresAt, invitedByName: input.invitedByName })
      .catch(() => ({ delivered: false }));
    return { ...created, acceptPath: acceptUrl, emailSent: result.delivered };
  }

  acceptInvitation(token: string) {
    return this.repository.accept(token);
  }

  revokeInvitation(id: ID) {
    return this.repository.revoke(id);
  }

  listPending(companyId: ID): Promise<CompanyInvitation[]> {
    return this.repository.listPending(companyId);
  }
}

export const invitationService = new InvitationService(new SupabaseInvitationRepository(supabase), emailDelivery);
