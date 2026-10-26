/**
 * Turns the Playwright JSON results into STEP-30-failure-tests.md (workbook Step 30):
 * Scenario | Expected | Actual | Pass. "Actual" is what each test recorded while it ran.
 * Usage: npx tsx scripts/step30-table.ts STEP-29-results.json > STEP-30-failure-tests.md
 */
import { readFileSync } from 'node:fs';

interface Annotation {
  type: string;
  description?: string;
}
interface Result {
  status: string;
  duration: number;
}
interface Spec {
  title: string;
  file: string;
  tests: { annotations: Annotation[]; results: Result[] }[];
}
interface Suite {
  specs?: Spec[];
  suites?: Suite[];
}

const collect = (s: Suite): Spec[] => [...(s.specs ?? []), ...(s.suites ?? []).flatMap(collect)];
const report = JSON.parse(readFileSync(process.argv[2] ?? 'STEP-29-results.json', 'utf8')) as {
  suites: Suite[];
  stats: { startTime: string };
};

const cell = (text: string) => text.replace(/\|/g, '\\|');
const rows = collect({ suites: report.suites }).flatMap((spec) =>
  spec.tests.flatMap((test) => {
    const mark = test.annotations.find((a) => a.type === 'scenario');
    if (!mark?.description) return [];
    const [name = '', expected = ''] = mark.description.split('\u0000');
    const actual = test.annotations.filter((a) => a.type === 'actual').map((a) => a.description);
    const passed = test.results.at(-1)?.status === 'passed';
    return [
      `| ${cell(name)} | ${cell(expected)} | ${cell(actual.join(' '))} | ${passed ? 'PASS' : 'FAIL'} |`,
    ];
  }),
);

console.log(`# Step 30 — Failure scenarios

Generated from the Playwright run of ${report.stats.startTime} (\`${process.argv[2] ?? 'STEP-29-results.json'}\`)
by \`scripts/step30-table.ts\`. *Actual* is what each test observed on the screen and in the
servers while it ran; *Pass* is the test's result. The tests are in \`playwright/tests/\`.

| Scenario | Expected | Actual | Pass |
|----------|----------|--------|------|
${rows.join('\n')}

${rows.length} scenarios, ${rows.filter((r) => r.endsWith('PASS |')).length} passed.
`);
