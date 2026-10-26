import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Source files of the UI (tests and test helpers are allowed to hold fixtures). */
function uiSources(dir = path.resolve('src/web')): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === 'test' ? [] : uiSources(full);
    return /\.(tsx?|css|html)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/** Source text without comments, so documentation can mention what the code must not do. */
const code = (file: string) =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('no scenario data in the UI source (workbook Rule 5, Step 19)', () => {
  const files = uiSources();

  it('finds the UI source files', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each([
    ['batch IDs', /\bB-2\d{4}\b/],
    ['order numbers', /\bSO-\d{4}\b/],
    ['machine names', /\b(JET|WINCH)-\d{2}\b/],
    ['dyestuff codes', /\b(DYE|AUX)-\d{4}\b/],
    ['lot numbers', /\b20\d{2}-0\d{3}\b/],
    ['shades and recipe values', /Teal 4C|Navy 12|Rose 08|1240\.0|386\.0/],
    ['operator names', /R\. Karim/],
  ])('contains no %s', (_label, pattern) => {
    const offenders = files.filter((f) => pattern.test(code(f)));
    expect(offenders.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });

  const simClient = path.join(path.resolve('src/web'), 'training', 'sim-client.ts');

  it('never calls the Dummy systems (/ext) — only the WeighingMS API (the training client is the one exception)', () => {
    const offenders = files.filter((f) => f !== simClient && /['"`]\/ext\//.test(code(f)));
    expect(offenders).toEqual([]);
  });

  it('the training client calls only simulation (_sim) routes of the Dummy systems', () => {
    const paths = code(simClient).match(/['"`]\/ext\/[^'"`]*['"`]/g) ?? [];
    expect(paths.length).toBeGreaterThan(10);
    expect(paths.filter((p) => !p.includes('/_sim/'))).toEqual([]);
  });

  it('the operator UI neither imports nor links to the Training Panel', () => {
    const operator = files.filter(
      (f) =>
        !f.includes(`${path.sep}training${path.sep}`) &&
        !f.endsWith(`${path.sep}main.tsx`) &&
        !f.endsWith(`${path.sep}messages.ts`), // the catalogue holds the trainer's strings too
    );
    const offenders = operator.filter((f) => /training|_sim\b/i.test(code(f)));
    expect(offenders.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });

  it('never injects markup (no dangerouslySetInnerHTML)', () => {
    expect(files.filter((f) => /dangerouslySetInnerHTML/.test(code(f)))).toEqual([]);
  });

  it('declares no hard-coded batch list', () => {
    const offenders = files.filter((f) => /const\s+batches\s*=\s*\[/.test(code(f)));
    expect(offenders).toEqual([]);
  });
});
