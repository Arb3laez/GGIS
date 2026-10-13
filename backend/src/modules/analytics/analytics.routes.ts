import { Router } from 'express';
import { z } from 'zod';
import { buildDashboard, businessUnitSchema, historicalRecommendation, todayIso } from '@ggis/domain';
import { validate } from '../../lib/validate';
import type { QuotesService } from '../quotes/quotes.service';

const historyQuery = z.object({
  businessUnit: businessUnitSchema,
  excludeId: z.string().uuid().optional(),
});

/** Indicadores: se calculan con el dominio sobre el listado (resúmenes) de cotizaciones. */
export function analyticsRouter(quotes: QuotesService, now: () => Date = () => new Date()): Router {
  const r = Router();

  r.get('/dashboard', (_req, res) => {
    res.json(buildDashboard(quotes.list(), todayIso(now())));
  });

  r.get('/history', (req, res) => {
    const q = validate(historyQuery, req.query);
    res.json({ recommendation: historicalRecommendation(quotes.list(), q.businessUnit, q.excludeId) });
  });

  return r;
}
