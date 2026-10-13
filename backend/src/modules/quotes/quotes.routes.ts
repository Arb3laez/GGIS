import { Router } from 'express';
import { z } from 'zod';
import {
  businessUnitSchema,
  quoteDraftSchema,
  quoteStatusSchema,
  statusChangeSchema,
} from '@ggis/domain';
import { validate } from '../../lib/validate';
import type { QuotesService } from './quotes.service';
import type { SettingsService } from '../settings/settings.service';
import { buildCostAnalysisWorkbook } from '../reports/cost-analysis';

const listQuery = z.object({
  status: quoteStatusSchema.optional(),
  businessUnit: businessUnitSchema.optional(),
  q: z.string().max(100).optional(),
});

const updateBody = z.object({ version: z.number().int().min(1), quote: quoteDraftSchema });

export function quotesRouter(quotes: QuotesService, settings: SettingsService): Router {
  const r = Router();

  r.get('/', (req, res) => {
    const q = validate(listQuery, req.query);
    res.json(quotes.list({ status: q.status, businessUnit: q.businessUnit, search: q.q }));
  });

  r.post('/', (req, res) => {
    const draft = validate(quoteDraftSchema, req.body);
    res.status(201).json(quotes.create(draft));
  });

  r.get('/:id', (req, res) => {
    res.json(quotes.get(req.params.id));
  });

  r.put('/:id', (req, res) => {
    const body = validate(updateBody, req.body);
    res.json(quotes.update(req.params.id, body.quote, body.version));
  });

  r.patch('/:id/status', (req, res) => {
    res.json(quotes.changeStatus(req.params.id, validate(statusChangeSchema, req.body)));
  });

  r.post('/:id/duplicate', (req, res) => {
    res.status(201).json(quotes.duplicate(req.params.id));
  });

  r.delete('/:id', (req, res) => {
    quotes.remove(req.params.id);
    res.status(204).end();
  });

  r.get('/:id/cost-analysis.xlsx', (req, res) => {
    const quote = quotes.get(req.params.id);
    const { buffer, fileName } = buildCostAnalysisWorkbook(quote, settings.getCompanyProfile());
    res
      .setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
      .send(buffer);
  });

  return r;
}
