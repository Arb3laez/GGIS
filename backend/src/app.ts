import fs from 'node:fs';
import path from 'node:path';
import express, { type ErrorRequestHandler, type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import { pinoHttp } from 'pino-http';
import type { ApiErrorBody } from '@ggis/domain';
import type { AppConfig } from './config';
import type { Database } from './db/database';
import { AppError } from './lib/errors';
import type { Logger } from './lib/logger';
import { analyticsRouter } from './modules/analytics/analytics.routes';
import { attachmentsRouter, quoteAttachmentsRouter } from './modules/attachments/attachments.routes';
import { AttachmentsService } from './modules/attachments/attachments.service';
import { backupRouter } from './modules/backup/backup.routes';
import { BackupService } from './modules/backup/backup.service';
import { catalogRouter } from './modules/catalog/catalog.routes';
import { CatalogService } from './modules/catalog/catalog.service';
import { exchangeRateRouter } from './modules/exchange-rate/exchange-rate.routes';
import { ExchangeRateService, type FetchFn } from './modules/exchange-rate/exchange-rate.service';
import { createAiExtractor, type AiExtractor } from './modules/imports/ai-extractor';
import { importsRouter } from './modules/imports/imports.routes';
import { ImportsService } from './modules/imports/imports.service';
import { quotesRouter } from './modules/quotes/quotes.routes';
import { QuotesService } from './modules/quotes/quotes.service';
import { settingsRouter } from './modules/settings/settings.routes';
import { SettingsService } from './modules/settings/settings.service';

export interface AppDeps {
  config: AppConfig;
  db: Database;
  log: Logger;
  /** Inyectables para pruebas. */
  fetchFn?: FetchFn;
  aiExtractor?: AiExtractor;
}

/** Composición del monolito: crea los servicios de cada módulo y monta sus rutas. */
export function createApp({ config, db, log, fetchFn, aiExtractor }: AppDeps): Express {
  const catalog = new CatalogService(db);
  const quotes = new QuotesService(db, catalog);
  const settings = new SettingsService(db);
  const attachments = new AttachmentsService(db, config.attachmentsDir);
  const imports = new ImportsService(aiExtractor ?? createAiExtractor(config.ai, log), attachments, log);
  const exchangeRate = new ExchangeRateService(config.exchangeRateTtlMs, log, fetchFn);
  const backup = new BackupService(quotes, attachments, log);

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes, files: 1 } });
  const backupUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024, files: 1 } });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'default-src': ["'self'"],
          'img-src': ["'self'", 'data:', 'blob:'],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
          'connect-src': ["'self'"],
          'frame-src': ["'self'", 'blob:'],
          // HTTPS lo impone el proxy con TLS cuando exista; aquí se sirve por HTTP local.
          'upgrade-insecure-requests': null,
        },
      },
      strictTransportSecurity: false,
    }),
  );
  app.use(cors({ origin: config.corsOrigins, credentials: false }));
  app.use(express.json({ limit: '5mb' }));
  if (config.env !== 'test') {
    app.use(
      pinoHttp({
        logger: log,
        autoLogging: { ignore: (req) => !req.url?.startsWith('/api') },
        // Solo lo necesario para operar: sin cabeceras ni cuerpos (pueden traer datos de clientes).
        serializers: {
          req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
          res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        },
      }),
    );
  }

  const api = express.Router();
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  api.use('/quotes/:quoteId/attachments', quoteAttachmentsRouter(attachments, upload));
  api.use('/quotes', quotesRouter(quotes, settings));
  api.use('/attachments', attachmentsRouter(attachments));
  api.use('/catalog', catalogRouter(catalog));
  api.use('/imports', importsRouter(imports, upload));
  api.use('/exchange-rate', exchangeRateRouter(exchangeRate));
  api.use('/analytics', analyticsRouter(quotes));
  api.use('/backup', backupRouter(backup, backupUpload));
  api.use('/settings', settingsRouter(settings));
  api.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Ruta no encontrada.' } } satisfies ApiErrorBody);
  });
  app.use('/api', api);

  // Monolito: en producción la API también sirve la web compilada (SPA).
  if (config.webDistDir && fs.existsSync(path.join(config.webDistDir, 'index.html'))) {
    const dist = config.webDistDir;
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  app.use(errorHandler(log));
  return app;
}

function errorHandler(log: Logger): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    let status = 500;
    let body: ApiErrorBody = { error: { code: 'internal_error', message: 'Ocurrió un error inesperado.' } };
    if (err instanceof AppError) {
      status = err.status;
      body = { error: { code: err.code, message: err.message, details: err.details } };
    } else if (err instanceof multer.MulterError) {
      status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      body = {
        error: {
          code: 'upload_error',
          message: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo es demasiado grande.' : 'No se pudo recibir el archivo.',
        },
      };
    } else if ((err as { type?: string }).type === 'entity.too.large') {
      status = 413;
      body = { error: { code: 'payload_too_large', message: 'La solicitud es demasiado grande.' } };
    } else if ((err as { type?: string }).type === 'entity.parse.failed') {
      status = 400;
      body = { error: { code: 'bad_json', message: 'El cuerpo de la solicitud no es JSON válido.' } };
    }
    if (status >= 500) log.error({ err }, 'Error no controlado');
    res.status(status).json(body);
  };
}
