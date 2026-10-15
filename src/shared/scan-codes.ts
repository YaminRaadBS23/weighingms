/**
 * Classifies a scanned or typed code by pattern. A scanner only returns text; deciding what the
 * text is belongs to WeighingMS. Scanned and typed codes go through this same function.
 * The patterns are a training decision — real barcode formats are an open question (brief Q19, A-10).
 */
export type ScanKind = 'BATCH' | 'DYESTUFF' | 'LOT' | 'CONTAINER' | 'BADGE' | 'UNKNOWN';

const PATTERNS: [ScanKind, RegExp][] = [
  ['BATCH', /^B-\d{5}$/],
  ['DYESTUFF', /^(DYE|AUX)-\d{4}$/],
  ['LOT', /^\d{4}-\d{4}$/],
  ['CONTAINER', /^[A-Z]-\d{2}$/],
  ['BADGE', /^BDG-\d{4}$/],
];

/** Trims and upper-cases a raw code, as an operator or scanner might add whitespace or lower case. */
export function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function classifyCode(raw: string): ScanKind {
  const code = normaliseCode(raw);
  return PATTERNS.find(([, pattern]) => pattern.test(code))?.[0] ?? 'UNKNOWN';
}
