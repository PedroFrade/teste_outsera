import { fileURLToPath } from 'node:url';

/** The CSV provided with the test; its expected results are fixed by the exercise. */
export const OFFICIAL_CSV = fileURLToPath(new URL('../../data/movielist.csv', import.meta.url));

export function fixture(name: string): string {
  return fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
}
