import { describe, it, expect } from 'vitest';
import { IMPORT_TEMPLATES, buildTemplateCSV } from './templates';

describe('buildTemplateCSV', () => {
  it('renders every field label, marking required fields with an asterisk', () => {
    const template = IMPORT_TEMPLATES.find((t) => t.id === 'chart_of_accounts')!;
    const csv = buildTemplateCSV(template);
    expect(csv).toContain('Account Code *');
    expect(csv).toContain('Account Name *');
    expect(csv.trim().split('\r\n')).toHaveLength(1); // header only — no sample data rows
  });

  it('never leaks a fake sample data row', () => {
    for (const template of IMPORT_TEMPLATES) {
      const csv = buildTemplateCSV(template);
      expect(csv.trim().split('\r\n')).toHaveLength(1);
    }
  });

  it('neutralizes a formula-injection-shaped header with a leading apostrophe', () => {
    const csv = buildTemplateCSV({ id: 'x', label: 'x', fields: [{ key: 'a', label: '=cmd()', type: 'string', aliases: [] }] });
    expect(csv).toContain("'=cmd()");
  });
});
