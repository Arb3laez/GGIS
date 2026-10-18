import { z } from 'zod';
import {
  fromLegacyBackup,
  isLegacyBackup,
  normalizeRetiredBidFields,
  quoteDraftSchema,
  type BackupImportResult,
  type Quote,
} from '@ggis/domain';
import { badRequest } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import type { AttachmentsService } from '../attachments/attachments.service';
import type { QuotesService } from '../quotes/quotes.service';

export const BACKUP_FORMAT = 'ggis-cotizador';
const BACKUP_VERSION = 2;

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  quotes: z.array(quoteDraftSchema.extend({ number: z.string().max(40) }).passthrough()),
});

/**
 * Respaldo e importación. Acepta:
 *  - el respaldo de esta versión ({ format: "ggis-cotizador", version: 2 })
 *  - el respaldo del cotizador de un solo archivo v40–v68 ({ index, quotes })
 * Las cotizaciones importadas conservan su número si está libre; si no, reciben uno nuevo.
 */
export class BackupService {
  constructor(
    private readonly quotes: QuotesService,
    private readonly attachments: AttachmentsService,
    private readonly log: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  export() {
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: this.now().toISOString(),
      quotes: this.quotes.exportAll(),
    } satisfies { format: string; version: number; exportedAt: string; quotes: Quote[] };
  }

  import(raw: Buffer): BackupImportResult {
    let data: unknown;
    try {
      data = JSON.parse(raw.toString('utf8'));
    } catch {
      throw badRequest('El archivo no es un JSON válido.');
    }
    if (isLegacyBackup(data)) return this.importLegacy(data);

    const parsed = backupSchema.safeParse(normalizeBackup(data));
    if (!parsed.success) throw badRequest('El archivo no es un respaldo reconocido del cotizador.');
    let imported = 0;
    for (const q of parsed.data.quotes) {
      const draft = quoteDraftSchema.parse(q);
      this.quotes.create(draft, { number: q.number });
      imported++;
    }
    return { imported, skipped: 0, attachments: 0, warnings: [] };
  }

  private importLegacy(data: unknown): BackupImportResult {
    const { quotes, warnings } = fromLegacyBackup(data);
    let attachments = 0;
    for (const lq of quotes) {
      const created = this.quotes.create(lq.draft, { number: lq.legacyNumber });
      if (created.number !== lq.legacyNumber) {
        warnings.push(`${lq.legacyNumber} ya existía: se importó como ${created.number}.`);
      }
      for (const a of lq.attachments) {
        const match = /^data:[^;]+;base64,(.+)$/s.exec(a.dataUrl);
        if (!match) continue;
        try {
          this.attachments.add(created.id, a.fileName, Buffer.from(match[1]!, 'base64'));
          attachments++;
        } catch (err) {
          this.log.warn({ quote: created.number, err: (err as Error).message }, 'Adjunto legado omitido');
          warnings.push(`${created.number}: el adjunto "${a.fileName}" no se pudo importar.`);
        }
      }
    }
    const skipped = warnings.filter((w) => w.includes('se omitió')).length;
    return { imported: quotes.length, skipped, attachments, warnings };
  }
}

/** Respaldo nuevo que todavía trae datos de licitación/APU: se normaliza antes de validar. */
function normalizeBackup(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const backup = data as Record<string, unknown>;
  if (!Array.isArray(backup.quotes)) return data;
  return { ...backup, quotes: backup.quotes.map(normalizeRetiredBidFields) };
}
