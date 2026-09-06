import type { ID, ISODateString } from './common';
import type { ProfileRole } from './user';

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

/** Mirrors `public.company_invitations` (migration 0069). The token is never returned by a list read — only once, at creation. */
export interface CompanyInvitation {
  id: ID;
  companyId: ID;
  email: string;
  profileRole: ProfileRole;
  roleId?: ID;
  status: InvitationStatus;
  invitedBy: ID;
  acceptedBy?: ID;
  createdAt: ISODateString;
  expiresAt: ISODateString;
  acceptedAt?: ISODateString;
  revokedAt?: ISODateString;
}

/** Returned once by `create_company_invitation` — carries the raw token. */
export interface CreatedInvitation {
  invitationId: ID;
  email: string;
  token: string;
  acceptPath: string;
  expiresAt: ISODateString;
  emailSent: boolean;
}
