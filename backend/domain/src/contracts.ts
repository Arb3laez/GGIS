import type { BusinessUnit, LossReason, QuoteStatus, ServiceType } from './constants';
import type { ImportedRow } from './schemas';

/**
 * Contratos de la API (lo que viaja entre web y servidor y no es una entidad editable).
 */

/** Fila del listado de cotizaciones; la calcula el servidor al guardar. */
export interface QuoteSummary {
  id: string;
  number: string;
  clientName: string;
  projectName: string;
  issueDate: string;
  validDays: number;
  status: QuoteStatus;
  businessUnit: BusinessUnit | null;
  serviceType: ServiceType | null;
  lossReason: LossReason | null;
  nextFollowUp: string | null;
  /** Total de la oferta (con IVA/AIU). */
  total: number;
  /** Costo total presupuestado. */
  budgetedCost: number;
  /** Costo real acumulado de la bitácora (0 si no hay). */
  actualCost: number;
  /** Valor real cobrado (0 si no se ha ingresado). */
  actualSale: number;
  closedOn: string | null;
  updatedAt: string;
  /** OT de la cotización que esta sustituye (si es una nueva versión). */
  supersedesNumber: string | null;
  /** OT de la cotización que sustituye a esta (si quedó como Sustituida). */
  supersededByNumber: string | null;
}

export interface AttachmentMeta {
  id: string;
  quoteId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface CatalogItem {
  id: string;
  description: string;
  unit: string;
  currency: 'COP' | 'USD';
  unitPrice: number;
  laborPct: number;
  updatedAt: string;
}

export interface ExchangeRateInfo {
  rate: number;
  /** "trm-oficial" (Superfinanciera vía datos.gov.co) o "mercado" (respaldo). */
  source: 'trm-oficial' | 'mercado';
  /** Fecha de vigencia de la tasa (AAAA-MM-DD). */
  validOn: string;
  fetchedAt: string;
}

export interface ImportPreview {
  rows: ImportedRow[];
  method: 'spreadsheet' | 'ai' | 'pdf-text' | 'text';
  /** Mensaje para el usuario (p. ej. cuántas filas vienen sin precio). */
  message: string;
  attachment?: AttachmentMeta;
}

export interface BackupImportResult {
  imported: number;
  skipped: number;
  attachments: number;
  warnings: string[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
