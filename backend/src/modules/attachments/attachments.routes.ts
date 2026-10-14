import { Router } from 'express';
import type { Multer } from 'multer';
import { badRequest } from '../../lib/errors';
import type { AttachmentsService } from './attachments.service';

/** /api/quotes/:quoteId/attachments */
export function quoteAttachmentsRouter(attachments: AttachmentsService, upload: Multer): Router {
  const r = Router({ mergeParams: true });

  r.get('/', (req, res) => {
    res.json(attachments.list((req.params as { quoteId: string }).quoteId));
  });

  r.post('/', upload.single('file'), (req, res) => {
    if (!req.file) throw badRequest('Falta el archivo (campo "file").');
    const meta = attachments.add(
      (req.params as { quoteId: string }).quoteId,
      req.file.originalname,
      req.file.buffer,
    );
    res.status(201).json(meta);
  });

  return r;
}

/** /api/attachments/:id */
export function attachmentsRouter(attachments: AttachmentsService): Router {
  const r = Router();

  r.get('/:id/file', (req, res) => {
    const { meta, filePath } = attachments.open(req.params.id);
    res
      .type(meta.mimeType)
      .setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(meta.fileName)}`)
      .sendFile(filePath);
  });

  r.delete('/:id', (req, res) => {
    attachments.remove(req.params.id);
    res.status(204).end();
  });

  return r;
}
