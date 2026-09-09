/**
 * Central accounting error mapper.
 *
 * Ordinary accounting users must never be shown a raw implementation error —
 * a Postgres `SQLSTATE`, an RPC function name, `invalid input syntax for
 * type uuid`, a foreign-key/constraint/RLS message, a `Failed to fetch`.
 * Every accounting-document action funnels its `catch` through
 * `mapAccountingError()` and shows `.message` (optionally `.title`), while
 * the untouched original stays on `.technical` for `console.error` and any
 * structured diagnostics.
 *
 * This is deliberately ONE mapper (not dozens of per-component string
 * swaps): a new failure class is added here once and every screen inherits
 * the friendlier wording.
 */

export interface AccountingErrorInfo {
  /** Short headline — e.g. "Supplier invoice could not be created". */
  title: string;
  /**
   * One or two calm sentences a non-technical user can act on. Ends with a
   * "contact support and quote <reference>" line when a reference is known.
   */
  message: string;
  /** The document number (PO-2026-0005, INV-1080) to quote to support, when known. */
  reference?: string;
  /** The original, unmodified error text — for logging/diagnostics only, never rendered raw. */
  technical: string;
  /**
   * `true` when the underlying operation is known to be atomic, so we can
   * truthfully tell the user "nothing was posted". Left `false` (silent)
   * when atomicity is not guaranteed — we never claim a rollback we can't
   * vouch for.
   */
  noChangesPosted: boolean;
  /** Coarse machine-readable bucket, handy for metrics / conditional retry UI. */
  code: AccountingErrorCode;
}

export type AccountingErrorCode =
  | 'malformed_line_reference'
  | 'already_posted'
  | 'already_converted'
  | 'invalid_document_state'
  | 'period_locked'
  | 'no_period'
  | 'insufficient_stock'
  | 'missing_warehouse'
  | 'missing_relationship'
  | 'duplicate_document_number'
  | 'permission_denied'
  | 'network_unavailable'
  | 'not_found'
  | 'posting_failed'
  | 'unknown';

export interface MapAccountingErrorOptions {
  /** Document number to quote to support (PO-2026-0005). */
  reference?: string;
  /**
   * What the user was trying to do, woven into the fallback title —
   * e.g. "create the supplier invoice", "post this supplier invoice",
   * "receive the goods". Keep it a lower-case verb phrase.
   */
  action?: string;
}

function rawText(error: unknown): string {
  if (error == null) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object') {
    const maybe = error as { message?: unknown; error?: unknown; details?: unknown };
    if (typeof maybe.message === 'string') return maybe.message;
    if (typeof maybe.error === 'string') return maybe.error;
    if (typeof maybe.details === 'string') return maybe.details;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function supportLine(reference?: string): string {
  return reference
    ? `If the problem continues, contact support and quote ${reference}.`
    : 'If the problem continues, please contact support.';
}

interface Rule {
  code: AccountingErrorCode;
  test: RegExp;
  title: string;
  body: string;
  noChangesPosted: boolean;
}

/**
 * Ordered most-specific-first. `mapAccountingError` walks this list and
 * takes the first `test` that matches the raw error text.
 */
const RULES: Rule[] = [
  {
    code: 'malformed_line_reference',
    test: /invalid input syntax for type uuid|not a valid uuid|malformed.*uuid/i,
    title: 'This document could not be processed',
    body:
      'One of the document lines is stored in an old format and could not be linked to the ledger. ' +
      'No accounting entries were posted. Open the source document, re-save it, then try again.',
    noChangesPosted: true,
  },
  {
    code: 'already_converted',
    test: /already been converted|already has (a|an) (bill|supplier invoice|invoice)|bill already exists/i,
    title: 'Already done',
    body: 'This document has already been converted. Open the linked document instead of creating another.',
    noChangesPosted: true,
  },
  {
    code: 'already_posted',
    test: /already( been)? posted|has already hit the ledger|not a draft|immutable|already (sent|received|paid|reconciled)/i,
    title: 'Already posted',
    body:
      'This document has already been posted and can no longer be changed here. ' +
      'Raise a credit note, supplier return, or compensating journal entry to correct it.',
    noChangesPosted: true,
  },
  {
    code: 'period_locked',
    test: /period .*(is )?(locked|closed|not open)|closed (accounting )?period|period is (closed|locked)/i,
    title: 'The accounting period is locked',
    body:
      'The accounting period for this date has been closed, so nothing can be posted into it. ' +
      'Nothing was posted. Ask a financial administrator to reopen the period, or use a date in an open period.',
    noChangesPosted: true,
  },
  {
    code: 'no_period',
    test: /no accounting period (is )?(defined|found|covers)|period for date .* not found/i,
    title: 'No accounting period for this date',
    body:
      'There is no accounting period set up for this date, so nothing could be posted. ' +
      'Nothing was posted. Add the period under Accounting → Financial Periods and try again.',
    noChangesPosted: true,
  },
  {
    code: 'insufficient_stock',
    test: /insufficient stock|not enough stock|negative stock|stock would go negative|would make stock negative/i,
    title: 'Not enough stock',
    body:
      'There is not enough stock on hand to complete this. No accounting entries were posted. ' +
      'Receive or adjust stock first, then try again.',
    noChangesPosted: true,
  },
  {
    code: 'missing_warehouse',
    test: /no warehouse|default warehouse|warehouse .* not found|missing warehouse/i,
    title: 'A warehouse is needed',
    body:
      'A stock line on this document has no warehouse, and no default warehouse is set. ' +
      'Nothing was posted. Assign a warehouse to the line, or set a default under Inventory → Warehouses.',
    noChangesPosted: true,
  },
  {
    code: 'missing_relationship',
    test: /violates foreign key constraint|foreign key|is not present in table|referenced .* does not exist|product .* not found/i,
    title: 'A linked record is missing',
    body:
      'A record this document depends on (a product, supplier, customer, or account) is missing or has been removed. ' +
      'Nothing was posted. Check the linked records and try again.',
    noChangesPosted: true,
  },
  {
    code: 'duplicate_document_number',
    test: /duplicate key value|already exists|unique constraint|duplicate .* number/i,
    title: 'That document number is already in use',
    body: 'A document with this number already exists. Use a different number and try again. Nothing was posted.',
    noChangesPosted: true,
  },
  {
    code: 'permission_denied',
    test: /permission denied|row-level security|violates row-level security|not authoriz|not authorised|forbidden|rls/i,
    title: 'You do not have permission',
    body: "Your role can't perform this action. Ask an administrator if you think you should have access.",
    noChangesPosted: true,
  },
  {
    code: 'network_unavailable',
    test: /failed to fetch|networkerror|network request failed|network error|fetch failed|timeout|timed out|econnrefused|503|502|gateway/i,
    title: 'Connection problem',
    body: "We couldn't reach the server. Check your internet connection and try again. Nothing was posted.",
    noChangesPosted: true,
  },
  {
    code: 'not_found',
    test: /not found|does not exist|no rows|could not be found/i,
    title: 'This record could not be found',
    body: 'It may have been deleted or you may not have access to it. Refresh the page and try again.',
    noChangesPosted: false,
  },
  {
    code: 'invalid_document_state',
    test: /cannot (post|convert|void|delete|edit|receive|reconcile)|invalid (state|status)|must be (a )?draft|not in a state/i,
    title: 'This document is not in the right state',
    body:
      'This document cannot be actioned from its current status. Check its status and any earlier steps, then try again. ' +
      'Nothing was posted.',
    noChangesPosted: true,
  },
  {
    // RPC-shaped failures we could not classify — still never shown raw.
    code: 'posting_failed',
    test: /post_inventory_transaction|reverse_inventory_transaction|_rpc|sqlstate|pg_|relation .* does not exist|unbalanced|does not balance|debits?.*credits?/i,
    title: 'The posting could not be completed',
    body: 'An unexpected problem stopped this from being posted. No accounting entries were posted. Please try again.',
    noChangesPosted: true,
  },
];

/**
 * Translate any thrown value from an accounting-document action into a
 * calm, user-facing message. Always returns — an unrecognised error gets a
 * safe generic message, never the raw text.
 */
export function mapAccountingError(error: unknown, options: MapAccountingErrorOptions = {}): AccountingErrorInfo {
  const rawMessage = rawText(error).trim();
  const technical = rawMessage || 'Unknown error';
  const { reference, action } = options;

  const rule = RULES.find((r) => r.test.test(technical));
  if (rule) {
    return {
      code: rule.code,
      title: rule.title,
      message: `${rule.body} ${supportLine(reference)}`.trim(),
      reference,
      technical,
      noChangesPosted: rule.noChangesPosted,
    };
  }

  // A deliberately-worded domain validation message ("only 2 remain to
  // invoice", "The customer has no billing address") is already fit to
  // show — it carries no implementation detail. Pass it through rather
  // than replacing it with a vaguer generic. Anything that looks
  // technical falls through to the safe generic below.
  if (rawMessage && !looksTechnical(rawMessage)) {
    return {
      code: 'invalid_document_state',
      title: action ? `Could not ${action}` : 'This could not be completed',
      message: technical.trim(),
      reference,
      technical,
      noChangesPosted: false,
    };
  }

  return {
    code: 'unknown',
    title: action ? `Could not ${action}` : 'Something went wrong',
    message:
      `We hit an unexpected problem${action ? ` while trying to ${action}` : ''}. ` +
      `Please try again. ${supportLine(reference)}`,
    reference,
    technical,
    noChangesPosted: false,
  };
}

/**
 * Heuristic: does this string look like an implementation error rather
 * than a hand-written domain message? Errs toward "technical" — a false
 * positive just shows the safe generic, a false negative would leak.
 */
function looksTechnical(text: string): boolean {
  if (text.length > 240 || /\n/.test(text)) return true;
  return /__|::|\bpg_|\brpc\b|sqlstate|\buuid\b|0x[0-9a-f]{2,}|[{}[\]]|https?:\/\/|\w+\.\w+\(|Error:|\bat \w+[.(]|viol|constraint|row-level|relation "|column "|\bnull\b|\bundefined\b|syntax|fetch|econn|<[a-z/]/i.test(
    text,
  );
}

/**
 * Convenience for the common React pattern:
 * `catch (err) { setError(toAccountingErrorMessage(err, { reference, action })); }`
 * Logs the technical detail to the console (dev diagnostics) and returns
 * only the safe user-facing message string.
 */
export function toAccountingErrorMessage(error: unknown, options: MapAccountingErrorOptions = {}): string {
  const info = mapAccountingError(error, options);
  console.error(
    `[accounting] ${info.code}${info.reference ? ` (${info.reference})` : ''}: ${info.technical}`,
  );
  return info.message;
}
