import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { loadConfig } from './config';
import { openDatabase } from './db/database';
import { createLogger } from './lib/logger';

const here = path.dirname(fileURLToPath(import.meta.url));

function main() {
  const config = loadConfig();
  // En producción, si no se indica, el front compilado está en front/dist.
  const webDistDir =
    config.webDistDir ?? (config.isProduction ? path.resolve(here, '../../front/dist') : undefined);
  const log = createLogger(config.logLevel, !config.isProduction);
  const db = openDatabase(config.databaseFile);
  const app = createApp({ config: { ...config, webDistDir }, db, log });

  const server = app.listen(config.port, config.host, () => {
    log.info(
      {
        url: `http://${config.host}:${config.port}`,
        data: config.dataDir,
        ai: !!config.ai.apiKey,
        web: !!webDistDir,
      },
      'Cotizador GGIS listo',
    );
  });

  const shutdown = (signal: string) => {
    log.info({ signal }, 'Cerrando…');
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
