import type Database from 'better-sqlite3';

export interface Movie {
  id: number;
  year: number;
  title: string;
  winner: boolean;
  producers: string[];
  studios: string[];
}

export interface MovieFilters {
  winner?: boolean;
  year?: number;
}

interface MovieRow {
  id: number;
  year: number;
  title: string;
  winner: number;
  producers: string;
  studios: string;
}

// Producers and studios come back as JSON arrays from correlated subqueries, so a page is a
// single query (no N+1). ORDER BY rowid keeps the order of the CSV: the link tables are rowid
// tables and rows are inserted in the order the names appear in the file.
const SELECT_MOVIES = `
  SELECT m.id, m.year, m.title, m.winner,
         (SELECT json_group_array(p.name ORDER BY mp.rowid)
            FROM movie_producers mp JOIN producers p ON p.id = mp.producer_id
           WHERE mp.movie_id = m.id) AS producers,
         (SELECT json_group_array(s.name ORDER BY ms.rowid)
            FROM movie_studios ms JOIN studios s ON s.id = ms.studio_id
           WHERE ms.movie_id = m.id) AS studios
    FROM movies m`;

function toMovie(row: MovieRow): Movie {
  return {
    id: row.id,
    year: row.year,
    title: row.title,
    winner: row.winner === 1,
    producers: JSON.parse(row.producers) as string[],
    studios: JSON.parse(row.studios) as string[],
  };
}

export function createMoviesRepository(db: Database.Database) {
  // A NULL parameter disables its filter, so one statement serves every filter combination.
  const selectPage = db.prepare(
    `${SELECT_MOVIES}
      WHERE m.id > @afterId
        AND (@winner IS NULL OR m.winner = @winner)
        AND (@year IS NULL OR m.year = @year)
      ORDER BY m.id
      LIMIT @limit`,
  );
  const selectById = db.prepare(`${SELECT_MOVIES} WHERE m.id = ?`);

  return {
    /** Movies with id greater than `afterId`, in id order. */
    findPage(filters: MovieFilters, afterId: number, limit: number): Movie[] {
      const rows = selectPage.all({
        afterId,
        winner: filters.winner === undefined ? null : Number(filters.winner),
        year: filters.year ?? null,
        limit,
      }) as MovieRow[];
      return rows.map(toMovie);
    },

    findById(id: number): Movie | undefined {
      const row = selectById.get(id) as MovieRow | undefined;
      return row && toMovie(row);
    },
  };
}

export type MoviesRepository = ReturnType<typeof createMoviesRepository>;
