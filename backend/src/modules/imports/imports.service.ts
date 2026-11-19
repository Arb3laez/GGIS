import {
  completeLinks,
  evaluateLinks,
  formatCop,
  matchPrices,
  parsePastedText,
  type ImportedRow,
  type ImportPreview,
  type MatchTargetItem,
  type PriceMatchResult,
} from '@ggis/domain';
import { badRequest } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import type { AttachmentsService } from '../attachments/attachments.service';
import { isSpreadsheet, sniffDocumentType } from '../attachments/file-type';
import { AiExtractionError, type AiExtractor } from './ai-extractor';
import { readPdfLayout, readPdfText, readSpreadsheet } from './readers';

/** Mejor asociación: más ítems con precio, menos líneas sueltas y menos ítems por revisar. */
const matchScore = (r: PriceMatchResult) =>
  r.items.filter((i) => i.status === 'ok').length * 2 +
  r.items.filter((i) => i.status === 'review').length -
  r.unmatchedRows.length * 2;

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

  /**
   * Relaciona las líneas de los proveedores con los ítems existentes (no crea ítems). Primero las
   * reglas del dominio (exactas con cantidades, torres, material); solo si dejan ítems o líneas
   * sin relacionar y la IA está configurada, se prueba la IA y se queda el mejor resultado. La
   * evaluación (precios, cantidades, lo que no se relacionó) siempre la hace el dominio.
   */
  async matchPrices(items: MatchTargetItem[], rows: ImportedRow[]): Promise<PriceMatchResult> {
    const rules = matchPrices(items, rows);
    // Si todas las líneas del proveedor encontraron su ítem, la IA no puede mejorar nada: los ítems
    // sin precio son los que ningún documento trae.
    if (rules.unmatchedRows.length === 0 || !this.ai.enabled || !this.ai.match) return rules;
    try {
      const links = await this.ai.match(items, rows);
      const ai = evaluateLinks(items, rows, completeLinks(items, rows, links), 'ai');
      return matchScore(ai) > matchScore(rules) ? ai : rules;
    } catch (err) {
      if (!(err instanceof AiExtractionError)) throw err;
      this.log.warn({ reason: err.message }, 'Asociación con IA falló; se usan las reglas');
      return { ...rules, message: `${rules.message} (La IA no respondió: ${err.message})` };
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

    // PDF con texto cuya tabla cuadra con su subtotal: lectura exacta, sin gastar IA.
    if (mime === 'application/pdf') {
      try {
        const layout = await readPdfLayout(data);
        if (layout.verified) {
          return {
            rows: layout.rows,
            method: 'pdf-text',
            message: `Se leyeron ${layout.rows.length} ítems del PDF y su suma cuadra con el subtotal del documento (${layout.rows[0]!.currency === 'USD' ? `US$${layout.total.toLocaleString('es-CO')}` : formatCop(layout.total)}).`,
            ...withAttachment,
          };
        }
      } catch (err) {
        this.log.warn({ err }, 'No se pudo leer la tabla del PDF por posiciones');
      }
    }

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
