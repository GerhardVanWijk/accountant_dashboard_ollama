import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Application-wide guard for the global native-select → Vertex dropdown
 * migration (Review GLOBAL-SELECT-1). It supersedes the *intent* of the
 * two earlier per-form guards (noNativeSelect.test.ts,
 * noNativeSelectInTransactionForms.test.ts) — those still run and keep
 * their explicit MIGRATED_FORMS lists green, but this one is the net that
 * catches a native `<select>` / `<NativeSelect>` reintroduced ANYWHERE.
 *
 * A native `<select>`'s open option menu renders in the browser's own
 * (OS) chrome — a light popup even in dark mode — that `<option>` cannot
 * be themed past, and whose open direction is uncontrolled. Standard
 * short enums use `EnumSelect`; long / searchable lists (GL accounts,
 * products, entities) use `SearchableSelect` / a `*Combobox`. Both render
 * the dark, viewport-constrained, portalled Vertex popup.
 *
 * The ONLY places `NativeSelect` / a raw `<select>` may appear:
 *  - src/components/ui/shadcn/native-select.tsx  (the component itself)
 *  - a file listed in INTENTIONAL_NATIVE_SELECT below, each with a reason
 *  - test files
 *
 * Prose mentions of `<select>` / `<option>` inside comments are fine —
 * comments are stripped before the check.
 */

const SRC = join(process.cwd(), 'src');

/** The component that defines the styled native `<select>`. */
const NATIVE_SELECT_COMPONENT = join('src', 'components', 'ui', 'shadcn', 'native-select.tsx');

/**
 * Category D — genuinely-native-for-a-reason `<select>`s. Empty: every
 * native select in the app has been migrated to `EnumSelect` /
 * `SearchableSelect`. Add an entry here (with a one-line reason) only if a
 * future `<select>` is a true native browser affordance that the Vertex
 * popup cannot replace.
 */
const INTENTIONAL_NATIVE_SELECT: { file: string; reason: string }[] = [];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function isTestFile(rel: string): boolean {
  return (
    /\.(test|spec)\.(ts|tsx)$/.test(rel) ||
    rel.split(sep).includes('__tests__') ||
    rel.split(sep).includes('test')
  );
}

/** Strip block (`/* … *\/`, incl. JSDoc) and whole-line (`// …`) comments. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const allowed = new Set(INTENTIONAL_NATIVE_SELECT.map((e) => e.file));

describe('no native <select> / <NativeSelect> outside the allow-list', () => {
  it('every standard dropdown uses EnumSelect / SearchableSelect, not a native <select>', () => {
    const files = walk(SRC)
      .map((f) => relative(process.cwd(), f))
      .filter((rel) => rel !== NATIVE_SELECT_COMPONENT)
      .filter((rel) => !isTestFile(rel))
      .filter((rel) => !allowed.has(rel.split(sep).join('/')));

    const offenders: string[] = [];
    for (const rel of files) {
      const code = stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));
      if (/\bNativeSelect\b/.test(code)) offenders.push(`${rel.split(sep).join('/')} — references NativeSelect`);
      if (/<select[\s/>]/.test(code)) offenders.push(`${rel.split(sep).join('/')} — contains a raw <select>`);
    }

    expect(offenders, `native <select> found outside the allow-list:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('every INTENTIONAL_NATIVE_SELECT entry carries a reason and still exists', () => {
    for (const entry of INTENTIONAL_NATIVE_SELECT) {
      expect(entry.reason.trim().length).toBeGreaterThan(0);
      expect(() => readFileSync(join(process.cwd(), entry.file), 'utf8')).not.toThrow();
    }
  });
});
