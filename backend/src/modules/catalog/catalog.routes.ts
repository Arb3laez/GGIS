import { Router } from 'express';
import { z } from 'zod';
import { catalogEntrySchema } from '@ggis/domain';
import { validate } from '../../lib/validate';
import type { CatalogService } from './catalog.service';

const searchQuery = z.object({
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

export function catalogRouter(catalog: CatalogService): Router {
  const r = Router();

  r.get('/', (req, res) => {
    const q = validate(searchQuery, req.query);
    res.json({ items: catalog.search(q.q, q.limit ?? 1000), total: catalog.count() });
  });

  r.put('/', (req, res) => {
    res.json(catalog.upsert(validate(catalogEntrySchema, req.body)));
  });

  r.delete('/:id', (req, res) => {
    catalog.remove(req.params.id);
    res.status(204).end();
  });

  return r;
}
