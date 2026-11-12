import type Database from 'better-sqlite3';

export interface AwardInterval {
  producer: string;
  interval: number;
  previousWin: number;
  followingWin: number;
}

export interface AwardIntervals {
  min: AwardInterval[];
  max: AwardInterval[];
}

/**
 * Every pair of consecutive wins of each producer, via LAG over the producer's winning years.
 * Only winning movies count; two wins in the same year give interval 0. A producer with a single
 * win has no previous year, so it yields no pair.
 */
const INTERVALS_CTE = `
  WITH wins AS (
    SELECT mp.producer_id AS producer_id, m.year AS year
      FROM movies m
      JOIN movie_producers mp ON mp.movie_id = m.id
     WHERE m.winner = 1
  ),
  pairs AS (
    SELECT producer_id,
           LAG(year) OVER (PARTITION BY producer_id ORDER BY year) AS previousWin,
           year AS followingWin
      FROM wins
  ),
  intervals AS (
    SELECT p.name AS producer,
           pairs.followingWin - pairs.previousWin AS interval,
           pairs.previousWin AS previousWin,
           pairs.followingWin AS followingWin
      FROM pairs
      JOIN producers p ON p.id = pairs.producer_id
     WHERE pairs.previousWin IS NOT NULL
  )`;

// DISTINCT: three wins in one year produce the same (year, year) pair twice; report it once.
function pairsWithExtreme(extreme: 'MIN' | 'MAX'): string {
  return `${INTERVALS_CTE}
    SELECT DISTINCT producer, interval, previousWin, followingWin
      FROM intervals
     WHERE interval = (SELECT ${extreme}(interval) FROM intervals)
     ORDER BY previousWin, producer`;
}

export function createProducersRepository(db: Database.Database) {
  const selectMin = db.prepare(pairsWithExtreme('MIN'));
  const selectMax = db.prepare(pairsWithExtreme('MAX'));

  return {
    findAwardIntervals(): AwardIntervals {
      return {
        min: selectMin.all() as AwardInterval[],
        max: selectMax.all() as AwardInterval[],
      };
    },
  };
}

export type ProducersRepository = ReturnType<typeof createProducersRepository>;
