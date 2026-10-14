import { parsePastedText, type ImportPreview } from '@ggis/domain';
import { badRequest } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import type { AttachmentsService } from '../attachments/attachments.service';
import { isSpreadsheet, sniffDocumentType } from '../attachments/file-type';
import { AiExtractionError, type AiExtractor } from './ai-extractor';
import { readBidWorkbook, type BidWorkbookResult } from './bid-workbook';
import { readPdfText, readSpreadsheet } from './readers';

/**
 * Importación de ítems. Siempre devuelve una PREVISUALIZACIÓN: el usuario revisa y confirma en
 * la web antes de que los ítems entren a la cotización.
 */
export class ImportsService {
  constructor(
    private readonly ai: AiExtractor,
    private readonly attachments: AttachmentsService,
    private readonly log: Logger,
  ) {}

  get aiEnabled(): boolean {
    return this.ai.enabled;
  }

  fromSpreadsheet(fileName: string, data: Buffer): ImportPreview {
    if (!isSpreadsheet(data, fileName))
      throw badRequest('El archivo no es un Excel (.xlsx, .xls) ni un CSV.');
    let rows;
    try {
      rows = readSpreadsheet(data);
    } catch {
      throw badRequest('No se pudo leer el archivo. Intenta con "Pegar filas".');
    }
    if (rows.length === 0) {
      return {
        rows,
        method: 'spreadsheet',
        message: 'No se identificó una columna de descripción. Revisa el archivo o usa "Pegar filas".',
      };
    }
    const withoutPrice = rows.filter((r) => r.unitPrice <= 0).length;
    return {
      rows,
      method: 'spreadsheet',
      message:
        withoutPrice > 0
          ? `Se detectaron ${rows.length} ítems (${withoutPrice} sin precio — parece una lista del cliente). Al elegir cada nombre del catálogo se autocompleta el precio si ya lo habías cotizado.`
          : `Se detectaron ${rows.length} ítems. Revísalos antes de importar.`,
    };
  }

  /** Libro de análisis de precios (APU) de licitación → datos completos para la cotización. */
  fromBidWorkbook(fileName: string, data: Buffer): BidWorkbookResult {
    if (!isSpreadsheet(data, fileName) || /\.csv$/i.test(fileName)) {
      throw badRequest('El análisis de precios debe ser un Excel (.xlsx o .xls).');
    }
    try {
      return readBidWorkbook(data);
    } catch (err) {
      throw badRequest((err as Error).message || 'No se pudo leer el análisis de precios.');
    }
  }

  fromText(text: string): ImportPreview {
    const rows = parsePastedText(text);
    return { rows, method: 'text', message: `Se detectaron ${rows.length} filas.` };
  }

  /** PDF o imagen: se adjunta a la cotización (si se indica) y se intenta leer con IA y luego con texto. */
  async fromDocument(fileName: string, data: Buffer, quoteId?: string): Promise<ImportPreview> {
    const mime = sniffDocumentType(data);
    if (!mime) throw badRequest('Solo se aceptan PDF o imágenes (PNG, JPG, WEBP).');
    const attachment = quoteId ? this.attachments.add(quoteId, fileName, data) : undefined;
    const withAttachment = attachment ? { attachment } : {};

    let aiFailure: string | null = null;
    if (this.ai.enabled) {
      try {
        const rows = await this.ai.extract(data, mime);
        if (rows.length) {
          return {
            rows,
            method: 'ai',
            message: `Se detectaron ${rows.length} ítems con IA. Revísalos antes de importar.`,
            ...withAttachment,
          };
        }
        aiFailure = 'La IA no detectó ítems en el documento.';
      } catch (err) {
        if (!(err instanceof AiExtractionError)) throw err;
        this.log.warn({ reason: err.message }, 'Extracción con IA falló; se usa el método alterno');
        aiFailure = err.message;
      }
    }

    if (mime === 'application/pdf') {
      try {
        const rows = await readPdfText(data);
        if (rows.length) {
          return {
            rows,
            method: 'pdf-text',
            message: `Se detectaron ${rows.length} ítems leyendo el texto del PDF${aiFailure ? ` (${aiFailure})` : ''}. Revísalos antes de importar.`,
            ...withAttachment,
          };
        }
      } catch (err) {
        this.log.warn({ err }, 'No se pudo leer el texto del PDF');
      }
    }
    const reason = aiFailure ?? (this.ai.enabled ? '' : 'La lectura con IA no está configurada.');
    return {
      rows: [],
      method: this.ai.enabled ? 'ai' : 'pdf-text',
      message:
        `${attachment ? 'El documento quedó adjunto, pero no' : 'No'} se pudieron detectar ítems automáticamente. ${reason} Agrégalos a mano o con "Pegar filas".`.trim(),
      ...withAttachment,
    };
  }
}
