import path from 'node:path';
import { z } from 'zod';

/**
 * Configuración tipada y validada al arrancar. Si falta algo obligatorio, el proceso no inicia
 * (falla rápido en vez de fallar a mitad de una petición).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATA_DIR: z.string().default('./data'),
  WEB_DIST_DIR: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-5'),
  OPENAI_IMAGE_MODEL: z.string().default('gpt-image-1.5'),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  EXCHANGE_RATE_TTL_MIN: z.coerce.number().min(1).default(60),
  MAX_UPLOAD_MB: z.coerce.number().min(1).max(50).default(10),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración inválida: ${issues}`);
  }
  const e = parsed.data;
  const dataDir = path.resolve(e.DATA_DIR);
  return {
    env: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    host: e.HOST,
    port: e.API_PORT,
    corsOrigins: e.CORS_ORIGINS,
    logLevel: e.LOG_LEVEL,
    dataDir,
    databaseFile: path.join(dataDir, 'cotizador.sqlite'),
    attachmentsDir: path.join(dataDir, 'attachments'),
    webDistDir: e.WEB_DIST_DIR ? path.resolve(e.WEB_DIST_DIR) : undefined,
    ai: {
      // Vacío = extracción con IA deshabilitada (se usa el lector de texto del PDF).
      apiKey: e.ANTHROPIC_API_KEY?.trim() || undefined,
      model: e.ANTHROPIC_MODEL,
    },
    research: {
      // Vacío = investigación de clientes con IA deshabilitada (quedan los botones de Google).
      apiKey: e.OPENAI_API_KEY?.trim() || undefined,
      model: e.OPENAI_MODEL,
      imageModel: e.OPENAI_IMAGE_MODEL,
    },
    // Vacío = sin mapa de Google en la oferta (queda el enlace a Google Maps).
    googleMapsKey: e.GOOGLE_MAPS_API_KEY?.trim() || undefined,
    exchangeRateTtlMs: e.EXCHANGE_RATE_TTL_MIN * 60_000,
    maxUploadBytes: e.MAX_UPLOAD_MB * 1024 * 1024,
  };
}
