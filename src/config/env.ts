import { resolve } from 'node:path';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Config {
  port: number;
  host: string;
  csvPath: string;
  logLevel: LogLevel;
}

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** Reads and validates the environment. Reports every invalid variable at once. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const problems: string[] = [];

  const rawPort = env.PORT?.trim() || '3000';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || port < 1 || port > 65535) {
    problems.push(`PORT must be an integer between 1 and 65535 (received "${rawPort}")`);
  }

  const host = env.HOST?.trim() || '0.0.0.0';

  const csvPath = resolve(env.CSV_PATH?.trim() || './data/movielist.csv');

  const rawLevel = env.LOG_LEVEL?.trim() || 'info';
  if (!LOG_LEVELS.includes(rawLevel as LogLevel)) {
    problems.push(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')} (received "${rawLevel}")`);
  }

  if (problems.length > 0) throw new ConfigError(problems);
  return { port, host, csvPath, logLevel: rawLevel as LogLevel };
}
