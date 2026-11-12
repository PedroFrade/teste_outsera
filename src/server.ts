import { buildApp } from './app.js';
import { ConfigError, loadConfig } from './config/env.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  let app;
  try {
    app = await buildApp({ csvPath: config.csvPath, logger: { level: config.logLevel } });
  } catch {
    // buildApp already logged the cause (fatal) before rejecting.
    process.exit(1);
  }

  const shutdown = (signal: string): void => {
    app.log.info({ signal }, 'Shutting down');
    setTimeout(() => {
      app.log.error('Shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
    app.close().then(
      () => process.exit(0),
      (err: unknown) => {
        app.log.error({ err }, 'Error during shutdown');
        process.exit(1);
      },
    );
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  const fatal = (err: unknown): void => {
    app.log.fatal({ err }, 'Unrecoverable error');
    process.exit(1);
  };
  process.on('unhandledRejection', fatal);
  process.on('uncaughtException', fatal);

  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.fatal({ err }, 'Failed to start listening');
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
