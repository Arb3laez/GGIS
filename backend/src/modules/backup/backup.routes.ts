import { Router } from 'express';
import type { Multer } from 'multer';
import { badRequest } from '../../lib/errors';
import type { BackupService } from './backup.service';

export function backupRouter(backup: BackupService, upload: Multer): Router {
  const r = Router();

  r.get('/export', (_req, res) => {
    const fileName = `cotizaciones-ggis-${new Date().toISOString().slice(0, 10)}.json`;
    res
      .setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
      .type('application/json')
      .send(JSON.stringify(backup.export(), null, 2));
  });

  r.post('/import', upload.single('file'), (req, res) => {
    if (!req.file) throw badRequest('Falta el archivo de respaldo (campo "file").');
    res.json(backup.import(req.file.buffer));
  });

  return r;
}
