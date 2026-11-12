// ", and " must come first so the Oxford comma ("A, B, and C") does not leave a stray "and".
const SEPARATOR = /,\s*and\s+|,|\s+and\s+/;

/**
 * Splits a producers/studios field into distinct names. Names are trimmed and have inner spaces
 * collapsed; empty names are dropped and repeated names within the same field are kept once.
 * Typos in the data are deliberately not corrected.
 */
export function splitNames(field: string): string[] {
  const names = field
    .split(SEPARATOR)
    .map((name) => name.trim().replace(/\s+/g, ' '))
    .filter((name) => name !== '');
  return [...new Set(names)];
}
