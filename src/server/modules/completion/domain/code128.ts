/**
 * Code 128, code set B only (printable ASCII 32–126), written without a library (ADR-11).
 * A symbol is: start B, one code per character, a check digit, the stop pattern.
 */

/** Bar/space widths (bar first) of codes 0–106; every pattern is 11 modules wide, the stop 13. */
// prettier-ignore
export const PATTERNS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212',
  '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221',
  '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221',
  '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321',
  '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131',
  '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131',
  '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111',
  '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242',
  '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311',
  '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const START_B = 104;
const STOP = 106;
const QUIET_MODULES = 10;

export class Code128Error extends Error {}

export interface Code128Symbol {
  value: string;
  /** The code values in order: start, characters, check, stop. */
  codes: number[];
  checkDigit: number;
  /** Alternating bar and space widths in modules, starting with a bar. */
  widths: number[];
}

/** Encodes `value`; a character outside printable ASCII is a defect, never a wrong symbol. */
export function encode(value: string): Code128Symbol {
  if (value.length === 0) throw new Code128Error('Nothing to encode');
  const values = [...value].map((ch) => {
    const code = ch.charCodeAt(0);
    if (ch.length !== 1 || code < 32 || code > 126) {
      throw new Code128Error(`Code 128 set B cannot carry "${ch}"`);
    }
    return code - 32;
  });
  const sum = values.reduce((acc, v, i) => acc + v * (i + 1), START_B);
  const checkDigit = sum % 103;
  const codes = [START_B, ...values, checkDigit, STOP];
  const widths = codes.flatMap((c) => [...PATTERNS[c]!].map(Number));
  return { value, codes, checkDigit, widths };
}

/** A self-contained SVG of the symbol with quiet zones; no external references. */
export function toSvg(value: string, opts: { moduleWidth?: number; height?: number } = {}): string {
  const mw = opts.moduleWidth ?? 2;
  const height = opts.height ?? 60;
  const { widths } = encode(value);
  let x = QUIET_MODULES;
  const bars: string[] = [];
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push(`<rect x="${x * mw}" y="0" width="${w * mw}" height="${height}"/>`);
    x += w;
  });
  const width = (x + QUIET_MODULES) * mw;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" ` +
    `height="${height}" role="img" aria-label="Barcode ${value.replace(/[<>&"]/g, '')}">` +
    `<rect width="${width}" height="${height}" fill="#fff"/><g fill="#000">${bars.join('')}</g></svg>`
  );
}
