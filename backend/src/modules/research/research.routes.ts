import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  clientResearchRequestSchema,
  researchImageRequestSchema,
  researchMapRequestSchema,
  researchPhotosRequestSchema,
  todayIso,
  type ClientResearch,
} from '@ggis/domain';
import { AppError, unavailable } from '../../lib/errors';
import { validate } from '../../lib/validate';
import type { AttachmentsService } from '../attachments/attachments.service';
import { ResearchError, type ClientResearcher } from './client-researcher';
import { collectWebPhotos, fetchStaticMap, type WebFetcher } from './web-photos';

/** Investigación comercial de clientes (búsqueda web con IA). */
export interface ResearchRouterDeps {
  researcher: ClientResearcher;
  attachments: AttachmentsService;
  web: WebFetcher;
  /** Llave de Google Maps (Static Maps); sin ella no hay mapa en la oferta. */
  googleMapsKey?: string;
  fetchFn?: typeof fetch;
}

export function researchRouter({
  researcher,
  attachments,
  web,
  googleMapsKey,
  fetchFn,
}: ResearchRouterDeps): Router {
  const r = Router();

  // Cada investigación hace búsquedas web y llamadas a la IA (tienen costo): se limita por cliente.
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 6,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: { code: 'rate_limited', message: 'Demasiadas investigaciones seguidas. Espera un minuto.' },
    },
  });

  r.get('/capabilities', (_req, res) => {
    res.json({ enabled: researcher.enabled, maps: !!googleMapsKey });
  });

  const toAppError = (err: unknown) =>
    err instanceof ResearchError
      ? new AppError(err.retryable ? 503 : 422, 'research_failed', err.message)
      : err;

  r.post('/', limiter, async (req, res) => {
    const body = validate(clientResearchRequestSchema, req.body);
    if (!researcher.enabled)
      throw unavailable('La investigación con IA no está configurada (falta la llave de la API).');
    try {
      const result: ClientResearch = { researchedOn: todayIso(), ...(await researcher.research(body)) };
      res.json(result);
    } catch (err) {
      throw toAppError(err);
    }
  });

  /** Genera una imagen alusiva y la guarda como adjunto de la cotización. */
  r.post('/images', limiter, async (req, res) => {
    const body = validate(researchImageRequestSchema, req.body);
    if (!researcher.enabled)
      throw unavailable('La investigación con IA no está configurada (falta la llave de la API).');
    attachments.assertQuote(body.quoteId); // antes de generar: la imagen tiene costo
    let image: Buffer;
    try {
      image = await researcher.generateImage(body.prompt);
    } catch (err) {
      throw toAppError(err);
    }
    const name = body.slot === 'need' ? 'imagen-ia-operacion.jpg' : 'imagen-ia-solucion.jpg';
    res.status(201).json(attachments.add(body.quoteId, name, image));
  });

  /** Fotos reales de las instalaciones tomadas de las páginas fuente (con su crédito). */
  r.post('/photos', limiter, async (req, res) => {
    const body = validate(researchPhotosRequestSchema, req.body);
    attachments.assertQuote(body.quoteId);
    const photos = await collectWebPhotos(body.pages, web);
    res.status(201).json(
      photos.map((p, i) => {
        const meta = attachments.add(body.quoteId, `foto-web-${i + 1}-${p.credit}`, p.data);
        return {
          attachmentId: meta.id,
          sourceUrl: p.sourceUrl,
          sourceTitle: p.sourceTitle,
          credit: p.credit,
        };
      }),
    );
  });

  /** Mapa de Google Maps de la ubicación, guardado como adjunto para la oferta y el PDF. */
  r.post('/map', limiter, async (req, res) => {
    const body = validate(researchMapRequestSchema, req.body);
    if (!googleMapsKey)
      throw unavailable('El mapa de Google no está configurado (falta la llave de Google Maps).');
    attachments.assertQuote(body.quoteId);
    let image: Buffer;
    try {
      image = await fetchStaticMap(body.query, googleMapsKey, fetchFn);
    } catch {
      throw new AppError(
        503,
        'map_failed',
        'No se pudo obtener el mapa de Google Maps. Revisa la llave y la dirección.',
      );
    }
    res.status(201).json(attachments.add(body.quoteId, 'mapa-google.png', image));
  });

  return r;
}
