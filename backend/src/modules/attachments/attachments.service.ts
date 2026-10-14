import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AttachmentMeta } from '@ggis/domain';
import type { Database } from '../../db/database';
import { badRequest, notFound } from '../../lib/errors';
import { cleanFileName, sniffDocumentType } from './file-type';

type Row = Record<string, string | number>;

function toMeta(r: Row): AttachmentMeta {
  return {
    id: String(r.id),
    quoteId: String(r.quote_id),
    fileName: String(r.file_name),
    mimeType: String(r.mime_type),
    sizeBytes: Number(r.size_bytes),
    createdAt: String(r.created_at),
  };
}

/**
 * Adjuntos de una cotización (PDF o imagen de la cotización del proveedor). Los archivos van al
 * disco (no en la base ni en el navegador); la base solo guarda los metadatos.
 */
export class AttachmentsService {
  constructor(
    private readonly db: Database,
    private readonly dir: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    fs.mkdirSync(dir, { recursive: true });
  }

  list(quoteId: string): AttachmentMeta[] {
    return (
      this.db
        .prepare('SELECT * FROM attachments WHERE quote_id = ? ORDER BY created_at')
        .all(quoteId) as Row[]
    ).map(toMeta);
  }

  add(quoteId: string, fileName: string, data: Buffer): AttachmentMeta {
    const quote = this.db.prepare('SELECT 1 FROM quotes WHERE id = ? AND deleted_at IS NULL').get(quoteId);
    if (!quote) throw notFound('La cotización');
    const mime = sniffDocumentType(data);
    if (!mime) throw badRequest('Solo se aceptan PDF o imágenes (PNG, JPG, WEBP).');
    const id = randomUUID();
    const storageKey = id; // nombre en disco sin datos del usuario
    fs.writeFileSync(path.join(this.dir, storageKey), data, { flag: 'wx' });
    const meta: AttachmentMeta = {
      id,
      quoteId,
      fileName: cleanFileName(fileName),
      mimeType: mime,
      sizeBytes: data.length,
      createdAt: this.now().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO attachments (id, quote_id, file_name, mime_type, size_bytes, storage_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(meta.id, quoteId, meta.fileName, meta.mimeType, meta.sizeBytes, storageKey, meta.createdAt);
    return meta;
  }

  /** Metadatos + ruta absoluta del archivo para enviarlo. */
  open(id: string): { meta: AttachmentMeta; filePath: string } {
    const r = this.db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as Row | undefined;
    if (!r) throw notFound('El adjunto');
    const filePath = path.join(this.dir, path.basename(String(r.storage_key)));
    if (!fs.existsSync(filePath)) throw notFound('El archivo del adjunto');
    return { meta: toMeta(r), filePath };
  }

  remove(id: string): void {
    const r = this.db.prepare('SELECT storage_key FROM attachments WHERE id = ?').get(id) as Row | undefined;
    if (!r) throw notFound('El adjunto');
    this.db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
    fs.rmSync(path.join(this.dir, path.basename(String(r.storage_key))), { force: true });
  }
}
