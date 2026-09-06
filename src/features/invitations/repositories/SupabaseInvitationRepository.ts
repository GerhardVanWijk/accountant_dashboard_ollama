import type { SupabaseClient } from '@supabase/supabase-js';

import type { CompanyInvitation, CreatedInvitation, ID } from '@/types';
import type { ProfileRole } from '@/types';

interface InvitationRow {
  id: string;
  company_id: string;
  email: string;
  profile_role: ProfileRole;
  role_id: string | null;
  status: CompanyInvitation['status'];
  invited_by: string;
  accepted_by: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

function rowToInvitation(r: InvitationRow): CompanyInvitation {
  return {
    id: r.id,
    companyId: r.company_id,
    email: r.email,
    profileRole: r.profile_role,
    roleId: r.role_id ?? undefined,
    status: r.status,
    invitedBy: r.invited_by,
    acceptedBy: r.accepted_by ?? undefined,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    acceptedAt: r.accepted_at ?? undefined,
    revokedAt: r.revoked_at ?? undefined,
  };
}

export class SupabaseInvitationRepository {
  constructor(private readonly client: SupabaseClient) {}

  /** Admin-only. Returns the raw token ONCE (migration 0069). */
  async create(email: string, profileRole: ProfileRole, roleId?: ID): Promise<CreatedInvitation> {
    const { data, error } = await this.client.rpc('create_company_invitation', {
      p_email: email,
      p_profile_role: profileRole,
      p_role_id: roleId ?? null,
    });
    if (error) throw new Error(error.message);
    const d = data as { invitation_id: string; email: string; token: string; accept_path: string; expires_at: string; email_sent: boolean };
    return {
      invitationId: d.invitation_id,
      email: d.email,
      token: d.token,
      acceptPath: d.accept_path,
      expiresAt: d.expires_at,
      emailSent: d.email_sent,
    };
  }

  async accept(token: string): Promise<{ companyId: ID; profileRole: ProfileRole }> {
    const { data, error } = await this.client.rpc('accept_company_invitation', { p_token: token });
    if (error) throw new Error(error.message);
    const d = data as { company_id: string; profile_role: ProfileRole };
    return { companyId: d.company_id, profileRole: d.profile_role };
  }

  async revoke(invitationId: ID): Promise<void> {
    const { error } = await this.client.rpc('revoke_company_invitation', { p_invitation_id: invitationId });
    if (error) throw new Error(error.message);
  }

  /** Admin-only (RLS). Pending, not-yet-expired invitations for the caller's company. */
  async listPending(companyId: ID): Promise<CompanyInvitation[]> {
    const { data, error } = await this.client
      .from('company_invitations')
      .select('*')
      .eq('company_id', companyId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`SupabaseInvitationRepository.listPending: ${error.message}`);
    return (data as InvitationRow[]).map(rowToInvitation).filter((i) => new Date(i.expiresAt) > new Date());
  }
}
