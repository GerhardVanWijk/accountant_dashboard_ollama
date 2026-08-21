import { describe, it, expect } from 'vitest';
import {
  parseCSVStatement,
  parseOFXStatement,
  parseQIFStatement,
  parseMT940Statement,
  detectStatementFormat,
} from './statementParsers';

describe('parseCSVStatement', () => {
  it('parses a single signed Amount column', () => {
    const csv = ['Date,Description,Reference,Amount', '05/03/2026,Customer payment,EFT-100,1500.00', '06/03/2026,Bank fee,FEE-1,-25.00'].join(
      '\n',
    );
    const lines = parseCSVStatement(csv);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ description: 'Customer payment', reference: 'EFT-100', amount: 1500, direction: 'debit' });
    expect(lines[1]).toMatchObject({ description: 'Bank fee', amount: 25, direction: 'credit' });
  });

  it('parses separate Debit/Credit columns, inverting the statement-side convention', () => {
    const csv = ['Date,Description,Debit,Credit', '05/03/2026,Withdrawal,500.00,', '06/03/2026,Deposit,,750.00'].join('\n');
    const lines = parseCSVStatement(csv);
    expect(lines[0]).toMatchObject({ amount: 500, direction: 'credit' }); // statement "Debit" = money out
    expect(lines[1]).toMatchObject({ amount: 750, direction: 'debit' }); // statement "Credit" = money in
  });

  it('handles quoted fields containing commas', () => {
    const csv = ['Date,Description,Amount', '05/03/2026,"Payment, ref ABC",100.00'].join('\n');
    const lines = parseCSVStatement(csv);
    expect(lines[0].description).toBe('Payment, ref ABC');
  });

  it('throws when required columns are missing', () => {
    const csv = ['Foo,Bar', '1,2'].join('\n');
    expect(() => parseCSVStatement(csv)).toThrow(/Date and Description/i);
  });
});

describe('parseOFXStatement', () => {
  it('parses STMTTRN blocks, preserving TRNAMT sign as this codebase\'s direction convention', () => {
    const ofx = `
      <OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
      <STMTTRN>
        <TRNTYPE>CREDIT
        <DTPOSTED>20260305120000
        <TRNAMT>1500.00
        <FITID>ofx-001
        <NAME>Customer payment
      </STMTTRN>
      <STMTTRN>
        <TRNTYPE>DEBIT
        <DTPOSTED>20260306090000
        <TRNAMT>-25.00
        <FITID>ofx-002
        <NAME>Bank fee
      </STMTTRN>
      </BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>
    `;
    const lines = parseOFXStatement(ofx);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ amount: 1500, direction: 'debit', reference: 'ofx-001' });
    expect(lines[1]).toMatchObject({ amount: 25, direction: 'credit', reference: 'ofx-002' });
  });

  it('throws when no STMTTRN blocks are found', () => {
    expect(() => parseOFXStatement('<OFX></OFX>')).toThrow(/STMTTRN/);
  });
});

describe('parseQIFStatement', () => {
  it('parses records separated by ^, with positive T amount as money in', () => {
    const qif = ['D05/03/2026', 'T1500.00', 'PCustomer payment', 'NEFT-100', '^', 'D06/03/2026', 'T-25.00', 'PBank fee', '^'].join(
      '\n',
    );
    const lines = parseQIFStatement(qif);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ description: 'Customer payment', reference: 'EFT-100', amount: 1500, direction: 'debit' });
    expect(lines[1]).toMatchObject({ description: 'Bank fee', amount: 25, direction: 'credit' });
  });

  it('throws when a record is missing a date or amount', () => {
    const qif = ['PNo date or amount', '^'].join('\n');
    expect(() => parseQIFStatement(qif)).toThrow(/missing a date/i);
  });
});

describe('parseMT940Statement', () => {
  it('parses :61: lines, inverting the D/C bank-perspective mark', () => {
    const mt940 = [
      ':20:STATEMENT001',
      ':61:2603050305C1500,00NMSCEFT-100',
      ':86:Customer payment received',
      ':61:2603060306D25,00NMSCFEE-1',
      ':86:Monthly account fee',
    ].join('\n');
    const lines = parseMT940Statement(mt940);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ amount: 1500, direction: 'debit', description: 'Customer payment received' });
    expect(lines[1]).toMatchObject({ amount: 25, direction: 'credit', description: 'Monthly account fee' });
  });

  it('throws when no :61: lines are present', () => {
    expect(() => parseMT940Statement(':20:STATEMENT001')).toThrow(/:61:/);
  });
});

describe('detectStatementFormat', () => {
  it('detects format from file extension', () => {
    expect(detectStatementFormat('statement.csv')).toBe('csv');
    expect(detectStatementFormat('statement.ofx')).toBe('ofx');
    expect(detectStatementFormat('statement.qfx')).toBe('ofx');
    expect(detectStatementFormat('statement.qif')).toBe('qif');
    expect(detectStatementFormat('statement.sta')).toBe('mt940');
    expect(detectStatementFormat('statement.txt')).toBeUndefined();
  });
});
