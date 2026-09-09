import { describe, it, expect, vi, afterEach } from 'vitest';
import { mapAccountingError, toAccountingErrorMessage } from './accountingError';

afterEach(() => vi.restoreAllMocks());

describe('mapAccountingError', () => {
  it('translates the raw PO → supplier-invoice UUID error into a calm message with no technical noise', () => {
    const raw = 'post_inventory_transaction: invalid input syntax for type uuid: "li_1788987659412"';
    const info = mapAccountingError(new Error(raw), { reference: 'PO-2026-0005', action: 'create the supplier invoice' });

    expect(info.code).toBe('malformed_line_reference');
    expect(info.message).not.toMatch(/uuid|post_inventory_transaction|li_1788987659412/i);
    expect(info.message).toMatch(/No accounting entries were posted/i);
    expect(info.message).toContain('PO-2026-0005');
    expect(info.noChangesPosted).toBe(true);
    // technical detail is preserved for logging, never rendered
    expect(info.technical).toBe(raw);
  });

  it('recognises an already-posted document', () => {
    const info = mapAccountingError(new Error('Bill "b1" has already been posted (status: awaiting_payment).'));
    expect(info.code).toBe('already_posted');
    expect(info.message).toMatch(/already been posted/i);
  });

  it('recognises an already-converted purchase order', () => {
    const info = mapAccountingError(new Error('Purchase order "po1" has already been converted to a supplier invoice (b1).'));
    expect(info.code).toBe('already_converted');
  });

  it('recognises a locked accounting period', () => {
    const info = mapAccountingError(new Error('Cannot post: accounting period "Aug 2026" is closed, not open.'));
    expect(info.code).toBe('period_locked');
    expect(info.message).toMatch(/locked|closed/i);
  });

  it('recognises a permission / RLS failure', () => {
    const info = mapAccountingError(new Error('new row violates row-level security policy for table "journal_entries"'));
    expect(info.code).toBe('permission_denied');
    expect(info.message).not.toMatch(/row-level security|journal_entries/i);
  });

  it('recognises a network failure', () => {
    const info = mapAccountingError(new TypeError('Failed to fetch'));
    expect(info.code).toBe('network_unavailable');
  });

  it('falls back to a safe generic message for an unrecognised error and never leaks it', () => {
    const info = mapAccountingError(new Error('kaboom internal detail 0xDEADBEEF'), { action: 'post this supplier invoice' });
    expect(info.code).toBe('unknown');
    expect(info.title).toBe('Could not post this supplier invoice');
    expect(info.message).not.toContain('kaboom');
    expect(info.message).not.toContain('0xDEADBEEF');
  });

  it('handles non-Error throwables (Supabase error objects, strings)', () => {
    expect(mapAccountingError({ message: 'duplicate key value violates unique constraint' }).code).toBe('duplicate_document_number');
    expect(mapAccountingError('insufficient stock on hand').code).toBe('insufficient_stock');
    expect(mapAccountingError(null).code).toBe('unknown');
  });
});

describe('toAccountingErrorMessage', () => {
  it('returns the user-facing message and logs the technical detail once', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const msg = toAccountingErrorMessage(new Error('post_inventory_transaction: invalid input syntax for type uuid: "li_x"'), {
      reference: 'PO-2026-0005',
    });
    expect(msg).toMatch(/No accounting entries were posted/i);
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toContain('li_x'); // technical detail lands in the log, not the UI
  });
});
