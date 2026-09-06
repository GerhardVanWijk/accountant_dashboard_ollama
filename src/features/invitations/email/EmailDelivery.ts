/**
 * The email-delivery boundary for company invitations.
 *
 * Vertex has NO email infrastructure yet. `create_company_invitation`
 * (migration 0069) creates the invitation and returns the accept link; a
 * future Supabase Edge Function will implement real delivery behind this
 * interface (that is the trusted server-side boundary, alongside Paystack
 * webhook verification — see docs/SUBSCRIPTIONS.md).
 *
 * Until then `NoopEmailDelivery` is wired: it sends nothing and reports
 * `delivered: false`, and the UI truthfully shows "Invitation created —
 * copy this link", never "Email sent".
 */
export interface InvitationEmail {
  to: string;
  companyName: string;
  /** Absolute URL the recipient opens to accept. */
  acceptUrl: string;
  expiresAt: string;
  invitedByName?: string;
}

export interface EmailDeliveryResult {
  delivered: boolean;
  provider?: string;
}

export interface EmailDelivery {
  sendInvitation(email: InvitationEmail): Promise<EmailDeliveryResult>;
}

/** No email is sent. The admin shares the link manually. */
export class NoopEmailDelivery implements EmailDelivery {
  async sendInvitation(_email: InvitationEmail): Promise<EmailDeliveryResult> {
    return { delivered: false };
  }
}

export const emailDelivery: EmailDelivery = new NoopEmailDelivery();
