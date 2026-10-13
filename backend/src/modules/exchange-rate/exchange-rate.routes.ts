import { Router } from 'express';
import type { ExchangeRateService } from './exchange-rate.service';

export function exchangeRateRouter(service: ExchangeRateService): Router {
  const r = Router();
  r.get('/', async (_req, res) => {
    res.json(await service.current());
  });
  return r;
}
