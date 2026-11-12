import type { ProducersRepository } from './repository.js';

/**
 * The data never changes after startup, so the intervals are computed once, right after the
 * import, and every request is answered from memory.
 */
export function createProducersService(repository: ProducersRepository) {
  const awardIntervals = repository.findAwardIntervals();
  return {
    getAwardIntervals: () => awardIntervals,
  };
}

export type ProducersService = ReturnType<typeof createProducersService>;
