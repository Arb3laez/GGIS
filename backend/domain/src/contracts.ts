import type {
  BusinessUnit,
  LossReason,
  QuoteStatus,
  SendStatus,
  ServiceType,
  Temperature,
  TransactionType,
} from './constants';
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
  /** Contacto del cliente y su teléfono (para el listado tipo CRM). */
  contactName: string;
  contactPhone: string;
  contactPhone2: string;
  /** NIT / CC del cliente. */
  identification: string;
  transactionType: TransactionType;
  temperature: Temperature | null;
  sendStatus: SendStatus | null;
  closeDate: string | null;
  /** Observación del seguimiento. */
  note: string;
  issueDate: string;
  validDays: number;
  status: QuoteStatus;
  businessUnit: BusinessUnit | null;
  serviceType: ServiceType | null;
  lossReason: LossReason | null;
  nextFollowUp: string | null;
  /** Etapa del seguimiento comercial y desde cuándo está en ella. */
  stage: string | null;
  stageUpdatedOn: string | null;
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
