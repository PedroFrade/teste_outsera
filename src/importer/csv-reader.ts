import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream';
import { CsvError, parse } from 'csv-parse';

export const REQUIRED_COLUMNS = ['year', 'title', 'studios', 'producers', 'winner'] as const;

export interface CsvRow {
  /** Physical line of the file where the record ends (the header is line 1). */
  line: number;
  year: string;
  title: string;
  studios: string;
  producers: string;
  winner: string;
}

export class CsvImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvImportError';
  }
}

function toError(err: unknown, csvPath: string): Error {
  if (err instanceof CsvImportError) return err;
  if (err instanceof CsvError) {
    return new CsvImportError(`Malformed CSV near line ${err.lines}: ${err.message}`);
  }
  const e = err as NodeJS.ErrnoException;
  if (e.code === 'ENOENT') return new CsvImportError(`CSV file not found: ${csvPath}`);
  return e;
}

/**
 * Streams the CSV (semicolon-delimited, RFC 4180 quoting) as normalized rows. Header names are
 * matched ignoring case and surrounding spaces, extra columns are ignored, and blank lines are
 * skipped. A missing required column, or a file with no header at all (empty or only blank
 * lines), rejects the iteration with a CsvImportError.
 */
export async function* readCsv(csvPath: string): AsyncGenerator<CsvRow> {
  let headerSeen = false;
  const parser = parse({
    delimiter: ';',
    bom: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
    info: true,
    columns: (header: string[]) => {
      headerSeen = true;
      const columns = header.map((name) => name.trim().toLowerCase());
      const missing = REQUIRED_COLUMNS.filter((name) => !columns.includes(name));
      if (missing.length > 0) {
        throw new CsvImportError(
          `CSV header is missing required column(s): ${missing.join(', ')} ` +
            `(expected: ${REQUIRED_COLUMNS.join(';')})`,
        );
      }
      return columns;
    },
  });
  // pipeline forwards read errors (e.g. ENOENT) to the parser, so they surface in the loop below.
  pipeline(createReadStream(csvPath), parser, () => {});

  try {
    for await (const { record, info } of parser) {
      const r = record as Record<string, string | undefined>;
      yield {
        line: info.lines,
        year: r.year ?? '',
        title: r.title ?? '',
        studios: r.studios ?? '',
        producers: r.producers ?? '',
        winner: r.winner ?? '',
      };
    }
    // The parser never calls `columns` when there is no record at all, so an empty file would
    // otherwise look like a valid CSV without rows.
    if (!headerSeen) {
      throw new CsvImportError(
        `CSV file has no header (expected: ${REQUIRED_COLUMNS.join(';')}): ${csvPath}`,
      );
    }
  } catch (err) {
    throw toError(err, csvPath);
  }
}
