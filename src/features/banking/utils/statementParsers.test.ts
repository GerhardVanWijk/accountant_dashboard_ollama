import { describe, it, expect } from 'vitest';
import {
  parseCSVStatement,
  parseOFXStatement,
  parseQIFStatement,
  parseMT940Statement,
  parseStatementFile,
  detectStatementFormat,
  signedLineAmount,
} from './statementParsers';

describe('parseCSVStatement', () => {
  it('parses a single signed Amount column', () => {
    const csv = ['Date,Description,Reference,Amount', '05/03/2026,Customer payment,EFT-100,1500.00', '06/03/2026,Bank fee,FEE-1,-25.00'].join(
      '\n',
    );
    const { lines, parseErrors } = parseCSVStatement(csv);
    expect(lines).toHaveLength(2);
    expect(parseErrors).toHaveLength(0);
    expect(lines[0]).toMatchObject({ description: 'Customer payment', reference: 'EFT-100', amount: 1500, direction: 'debit' });
    expect(lines[1]).toMatchObject({ description: 'Bank fee', amount: 25, direction: 'credit' });
  });

  it('parses separate Debit/Credit columns, inverting the statement-side convention', () => {
    const csv = ['Date,Description,Debit,Credit', '05/03/2026,Withdrawal,500.00,', '06/03/2026,Deposit,,750.00'].join('\n');
    const { lines } = parseCSVStatement(csv);
    expect(lines[0]).toMatchObject({ amount: 500, direction: 'credit' }); // statement "Debit" = money out
    expect(lines[1]).toMatchObject({ amount: 750, direction: 'debit' }); // statement "Credit" = money in
  });

  it('handles quoted fields containing commas', () => {
    const csv = ['Date,Description,Amount', '05/03/2026,"Payment, ref ABC",100.00'].join('\n');
    const { lines } = parseCSVStatement(csv);
    expect(lines[0].description).toBe('Payment, ref ABC');
  });

  it('retains the verbatim row in raw and captures a running-balance column', () => {
    const csv = ['Date,Description,Amount,Balance', '05/03/2026,Opening activity,100.00,1100.00'].join('\n');
    const { lines } = parseCSVStatement(csv);
    expect(lines[0].runningBalance).toBe(1100);
    expect(lines[0].raw).toMatchObject({ date: '05/03/2026', description: 'Opening activity', amount: '100.00', balance: '1100.00' });
  });

  it('records a malformed row in parseErrors and keeps parsing the rest of the file', () => {
    const csv = [
      'Date,Description,Amount',
      '05/03/2026,Good row,100.00',
      'not-a-date,Bad row,50.00',
      '07/03/2026,Another good row,75.00',
    ].join('\n');
    const { lines, parseErrors } = parseCSVStatement(csv);
    expect(lines).toHaveLength(2);
    expect(parseErrors).toHaveLength(1);
    expect(parseErrors[0]).toMatchObject({ rowIndex: 1, raw: 'not-a-date,Bad row,50.00' });
    expect(parseErrors[0].reason).toMatch(/date/i);
  });

  it('throws when required columns are missing (a fundamentally unparseable file)', () => {
    const csv = ['Foo,Bar', '1,2'].join('\n');
    expect(() => parseCSVStatement(csv)).toThrow(/Date and Description/i);
  });
});

describe('parseOFXStatement', () => {
  const ofx = `
    <OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
    <BANKTRANLIST>
    <DTSTART>20260301000000
    <DTEND>20260331000000
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
    </BANKTRANLIST>
    <LEDGERBAL><BALAMT>18475.00<DTASOF>20260331000000</LEDGERBAL>
    </STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>
  `;

  it('parses STMTTRN blocks, preserving TRNAMT sign as this codebase\'s direction convention', () => {
    const { lines } = parseOFXStatement(ofx);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ amount: 1500, direction: 'debit', reference: 'ofx-001' });
    expect(lines[1]).toMatchObject({ amount: 25, direction: 'credit', reference: 'ofx-002' });
  });

  it('promotes <FITID> to externalRefId', () => {
    const { lines } = parseOFXStatement(ofx);
    expect(lines[0].externalRefId).toBe('ofx-001');
    expect(lines[1].externalRefId).toBe('ofx-002');
  });

  it('extracts the ledger closing balance and the statement period', () => {
    const { openingBalance, closingBalance, periodStart, periodEnd } = parseOFXStatement(ofx);
    expect(openingBalance).toBeUndefined();
    expect(closingBalance).toBe(18475);
    expect(periodStart).toBe('2026-03-01T00:00:00.000Z');
    expect(periodEnd).toBe('2026-03-31T00:00:00.000Z');
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
    const { lines } = parseQIFStatement(qif);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ description: 'Customer payment', reference: 'EFT-100', amount: 1500, direction: 'debit' });
    expect(lines[1]).toMatchObject({ description: 'Bank fee', amount: 25, direction: 'credit' });
  });

  it('records a record missing a date or amount in parseErrors without aborting the file', () => {
    const qif = ['D05/03/2026', 'T10.00', 'PGood', '^', 'PNo date or amount', '^'].join('\n');
    const { lines, parseErrors } = parseQIFStatement(qif);
    expect(lines).toHaveLength(1);
    expect(parseErrors).toHaveLength(1);
    expect(parseErrors[0].reason).toMatch(/missing a date/i);
  });
});

describe('parseMT940Statement', () => {
  const mt940 = [
    ':20:STATEMENT001',
    ':60F:C260301ZAR10000,00',
    ':61:2603050305C1500,00NMSCEFT-100',
    ':86:Customer payment received',
    ':61:2603060306D25,00NMSCFEE-1',
    ':86:Monthly account fee',
    ':62F:C260331ZAR11475,00',
  ].join('\n');

  it('parses :61: lines, inverting the D/C bank-perspective mark', () => {
    const { lines } = parseMT940Statement(mt940);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ amount: 1500, direction: 'debit', description: 'Customer payment received' });
    expect(lines[1]).toMatchObject({ amount: 25, direction: 'credit', description: 'Monthly account fee' });
  });

  it('extracts opening/closing balances and the statement period from :60F:/:62F:', () => {
    const { openingBalance, closingBalance, periodStart, periodEnd } = parseMT940Statement(mt940);
    expect(openingBalance).toBe(10000);
    expect(closingBalance).toBe(11475);
    expect(periodStart).toBe('2026-03-01T00:00:00.000Z');
    expect(periodEnd).toBe('2026-03-31T00:00:00.000Z');
  });

  it('reads an overdrawn (D-marked) closing balance as negative', () => {
    const overdrawn = [':60F:C260301ZAR100,00', ':61:2603050305D500,00NMSCX', ':86:Big payment', ':62F:D260331ZAR400,00'].join('\n');
    expect(parseMT940Statement(overdrawn).closingBalance).toBe(-400);
  });

  it('records a malformed :61: line in parseErrors and keeps going', () => {
    const withBadRow = [
      ':60F:C260301ZAR10000,00',
      ':61:2603050305C1500,00NMSCEFT-100',
      ':86:Good line',
      ':61:THIS-IS-NOT-A-VALID-61-LINE',
      ':61:2603070307D25,00NMSCFEE-1',
      ':86:Also good',
    ].join('\n');
    const { lines, parseErrors } = parseMT940Statement(withBadRow);
    expect(lines).toHaveLength(2);
    expect(parseErrors).toHaveLength(1);
    expect(parseErrors[0].raw).toContain('NOT-A-VALID');
  });

  it('throws when no :61: lines are present', () => {
    expect(() => parseMT940Statement(':20:STATEMENT001')).toThrow(/:61:/);
  });
});

describe('parseStatementFile + signedLineAmount', () => {
  it('dispatches by format and returns a ParsedStatement', () => {
    const result = parseStatementFile('csv', ['Date,Description,Amount', '05/03/2026,X,100.00'].join('\n'));
    expect(result.format).toBe('csv');
    expect(result.lines).toHaveLength(1);
    expect(Array.isArray(result.parseErrors)).toBe(true);
  });

  it('signs +inflow / -outflow', () => {
    expect(signedLineAmount({ amount: 100, direction: 'debit' })).toBe(100);
    expect(signedLineAmount({ amount: 100, direction: 'credit' })).toBe(-100);
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
