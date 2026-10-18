import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { Multer } from 'multer';
import { z } from 'zod';
import { badRequest } from '../../lib/errors';
import { validate } from '../../lib/validate';
import type { ImportsService } from './imports.service';

const documentFields = z.object({ quoteId: z.string().uuid().optional() });
const textBody = z.object({ text: z.string().min(1).max(200_000) });

export function importsRouter(imports: ImportsService, upload: Multer): Router {
  const r = Router();

  // La lectura con IA tiene costo: se limita por cliente.
  const documentLimiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: { code: 'rate_limited', message: 'Demasiadas lecturas de documentos. Espera un minuto.' },
    },
  });

  r.get('/capabilities', (_req, res) => {
    res.json({ ai: imports.aiEnabled });
  });

  r.post('/spreadsheet', upload.single('file'), (req, res) => {
    if (!req.file) throw badRequest('Falta el archivo (campo "file").');
    res.json(imports.fromSpreadsheet(req.file.originalname, req.file.buffer));
  });

  r.post('/document', documentLimiter, upload.single('file'), async (req, res) => {
    if (!req.file) throw badRequest('Falta el archivo (campo "file").');
    const { quoteId } = validate(documentFields, req.body ?? {});
    res.json(await imports.fromDocument(req.file.originalname, req.file.buffer, quoteId));
  });

  r.post('/text', (req, res) => {
    res.json(imports.fromText(validate(textBody, req.body).text));
  });

  return r;
}
