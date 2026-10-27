import { z } from 'zod';
import {
  BUSINESS_UNITS,
  COMPLEXITIES,
  CURRENCIES,
  LOSS_REASONS,
  PAYMENT_MODES,
  PRICING_METHODS,
  QUOTE_STATUSES,
  FACILITY_KINDS,
  SEND_STATUSES,
  SERVICE_TYPES,
  TEMPERATURES,
  TRANSACTION_TYPES,
  SOLUTIONS,
} from './constants';

/**
 * Esquemas de validación compartidos por la API (entrada) y la web (formularios).
 * Son la fuente única de verdad de la forma de los datos.
 */

const id = z.string().min(1).max(64);
const money = z.number().finite().min(0);
const pct = z.number().finite().min(0).max(1000);
const text = (max: number) => z.string().max(max);
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (AAAA-MM-DD)');

export const currencySchema = z.enum(CURRENCIES);
export const complexitySchema = z.enum(COMPLEXITIES);
export const quoteStatusSchema = z.enum(QUOTE_STATUSES);
export const businessUnitSchema = z.enum(BUSINESS_UNITS);
export const serviceTypeSchema = z.enum(SERVICE_TYPES);
/** Nivel de oferta: clave del catálogo FOLLOW_UP_STAGES (se admite texto de versiones anteriores; vacío = sin etapa). */
export const followUpStageSchema = z
  .string()
  .trim()
  .max(120)
  .transform((v) => v || null);
export const lossReasonSchema = z.enum(LOSS_REASONS);
export const pricingMethodSchema = z.enum(PRICING_METHODS);
export const paymentModeSchema = z.enum(PAYMENT_MODES);
export const solutionSchema = z.enum(SOLUTIONS);

export const quoteItemSchema = z.object({
  id,
  description: text(500),
  unit: text(20),
  quantity: money,
  currency: currencySchema,
  unitPrice: money,
  /** Suma el % de nacionalización + transporte a bodega. */
  applyImportCost: z.boolean(),
  /** El precio del proveedor no trae IVA y se le suma (19%). */
  supplierVatIncluded: z.boolean(),
  /** % de mano de obra de instalación sobre el material. */
  laborPct: pct,
  /** Este ítem absorbe el personal fijo + la mano de obra por actividad. */
  carriesFixedLabor: z.boolean(),
  complexity: complexitySchema,
  /** Precio de venta unitario fijado a mano; null = se calcula. */
  salePriceOverride: z.number().finite().positive().nullable(),
  /**
   * Longitud comercial del tubo en metros para ítems de tubería en ML (6, 5.8, 3, 2 o 1).
   * Es solo una ayuda de compra: no cambia el costo, que sigue siendo por ML.
   */
  pipeLengthM: z.number().finite().positive().max(100).nullable().default(null),
});

export const overtimeHoursSchema = z.object({
  extraDay: money,
  extraNight: money,
  nightSurcharge: money,
  holidayDay: money,
  holidayNight: money,
  holidayExtraDay: money,
  holidayExtraNight: money,
});

export const staffMemberSchema = z.object({
  id,
  role: text(200),
  /** Número de personas con el mismo cargo y el mismo perfil de pago. */
  quantity: z.number().int().min(1).max(999).default(1),
  monthlySalary: money,
  benefitsFactor: z.number().finite().min(0).max(5),
  transportAllowance: z.boolean(),
  days: money,
  hasOvertime: z.boolean(),
  overtime: overtimeHoursSchema,
});

export const costLineSchema = z.object({
  id,
  concept: text(200),
  quantity: money,
  unitPrice: money,
});

export const pricingSchema = z.object({
  method: pricingMethodSchema,
  /** Utilidad como % del precio de venta (margen, no recargo). */
  marginPct: z.number().finite().min(0).max(95),
  policiesPct: pct,
  taxesPct: pct,
  financingPct: pct,
  /** Imprevistos internos. */
  contingencyPct: pct,
  /** Administración interna. */
  adminPct: pct,
  /** IVA sobre el subtotal (método simple). */
  vatPct: pct,
  aiu: z.object({
    adminPct: pct,
    contingencyPct: pct,
    profitPct: pct,
    vatOnProfitPct: pct,
  }),
});

export const termsSchema = z.object({
  deliveryNational: text(200),
  deliveryImport: text(200),
  installationTime: text(200),
  paymentMode: paymentModeSchema,
  financingDays: z.number().int().min(0).max(720),
  advancePct: pct,
  progressPct: pct,
  onDeliveryPct: pct,
  scope: text(10_000),
  warranty: text(5_000),
  exclusions: text(5_000),
  generalConditions: text(5_000),
});

export const closureCategorySchema = z.object({ id, name: text(120) });
export const closureEntrySchema = z.object({
  id,
  date: isoDateSchema.or(z.literal('')),
  concept: text(300),
  amount: z.number().finite(),
  categoryId: id,
});

/** Valor final real de una línea de la cotización (ítem, cargo de personal, actividad u otro costo). */
export const lineActualSchema = z.object({
  /** Valor final que en realidad se pagó por la línea (null = aún sin registrar). */
  actual: money.nullable().default(null),
  /** Solo en Personal: lo que se le dio al cargo (abono, liquidación y bonificaciones). */
  advance: money.default(0),
  settlement: money.default(0),
  bonus: money.default(0),
  note: text(300).default(''),
});

export const closureSchema = z.object({
  categories: z.array(closureCategorySchema).min(1).max(50),
  entries: z.array(closureEntrySchema).max(5_000),
  /**
   * Comparativo por ítem: valor final real de cada línea de la cotización, con clave
   * "item:<id>", "staff:<id>", "activity:<id>" u "other:<id>".
   */
  lineActuals: z.record(z.string().max(80), lineActualSchema).default({}),
  actualSale: money.nullable(),
  closedOn: isoDateSchema.nullable(),
  notes: text(5_000),
  /** Costo real cargado de una sola vez en versiones antiguas (antes de la bitácora). */
  legacyActualCost: money.nullable(),
});

export const followUpSchema = z.object({
  temperature: z.enum(TEMPERATURES).nullable().default(null),
  sendStatus: z.enum(SEND_STATUSES).nullable().default(null),
  /** Fecha estimada de cierre. */
  closeDate: isoDateSchema.nullable().default(null),
  /** Observación del seguimiento. */
  note: text(2_000).default(''),
});

/** Investigación comercial del cliente (búsqueda web): empresa, sedes, proyecto y texto para la oferta. */
export const clientResearchSchema = z.object({
  researchedOn: isoDateSchema,
  /** A qué se dedica la empresa. */
  summary: text(3_000),
  sector: text(200),
  /** Ubicación principal (dirección o ciudad) para el mapa. */
  location: text(300),
  /** Dirección principal del cliente (si es pública). */
  address: text(300).default(''),
  /** Sede o lugar donde se haría el proyecto. */
  projectSite: text(300).default(''),
  facilities: z
    .array(
      z.object({
        name: text(200),
        city: text(120),
        address: text(300),
        kind: z.enum(FACILITY_KINDS),
      }),
    )
    .max(12),
  /** De qué se trata (o puede tratarse) el proyecto. */
  project: text(1_500),
  /** Riesgos propios de la unidad de negocio en sus instalaciones. */
  risks: z.array(text(300)).max(8),
  /** Texto sugerido para la oferta ("Entendemos su operación…"). */
  proposalText: text(3_000),
  /** Tipo de instalación para la imagen alusiva de la biblioteca G&G. */
  imageTheme: z.enum(FACILITY_KINDS),
  sources: z.array(z.object({ title: text(300), url: z.string().url().max(2_000) })).max(15),
  /** Descripciones para generar las imágenes alusivas con IA (editables). */
  imagePrompts: z
    .object({ need: text(1_000), solution: text(1_000) })
    .default({ need: '', solution: '' }),
  /** Imágenes generadas con IA (adjuntos de la cotización); null = se usa la biblioteca G&G. */
  images: z
    .object({ need: z.string().uuid().nullable(), solution: z.string().uuid().nullable() })
    .default({ need: null, solution: null }),
  /** Fotos reales tomadas de la web (adjuntos de la cotización) con su fuente para el crédito. */
  photos: z
    .array(
      z.object({
        attachmentId: z.string().uuid(),
        sourceUrl: z.string().url().max(2_000),
        sourceTitle: text(300),
        credit: text(200),
      }),
    )
    .max(12)
    .default([]),
  /** Mapa de Google Maps de la ubicación (adjunto de la cotización); null = sin mapa. */
  mapImage: z.string().uuid().nullable().default(null),
});

/** Busca fotos reales del cliente en las páginas fuente de la investigación. */
export const researchPhotosRequestSchema = z.object({
  quoteId: z.string().uuid(),
  pages: z
    .array(z.object({ url: z.string().url().max(2_000), title: text(300).default('') }))
    .min(1)
    .max(15),
});

/** Genera el mapa de Google Maps de la ubicación del cliente o del proyecto. */
export const researchMapRequestSchema = z.object({
  quoteId: z.string().uuid(),
  query: z.string().trim().min(3).max(300),
});

export const RESEARCH_IMAGE_SLOTS = ['need', 'solution'] as const;
export type ResearchImageSlot = (typeof RESEARCH_IMAGE_SLOTS)[number];

/** Pedido de una imagen alusiva generada con IA para la oferta. */
export const researchImageRequestSchema = z.object({
  quoteId: z.string().uuid(),
  slot: z.enum(RESEARCH_IMAGE_SLOTS),
  prompt: z.string().trim().min(10).max(1_000),
});

/** Lo que se envía para investigar a un cliente. */
export const clientResearchRequestSchema = z.object({
  clientName: z.string().trim().min(2).max(200),
  identification: text(30).default(''),
  project: text(300).default(''),
  city: text(120).default(''),
  businessUnit: businessUnitSchema.nullable().default(null),
  serviceType: serviceTypeSchema.nullable().default(null),
  /** Alcance cotizado (descripciones de los ítems) para entender qué se le va a hacer. */
  scope: text(1_500).default(''),
});

export const clientSchema = z.object({
  name: text(200),
  project: text(300),
  contact: text(200),
  /** Teléfono / celular del contacto. */
  phone: text(40).default(''),
  /** Segundo número de contacto. */
  phone2: text(40).default(''),
  /** Identificación del cliente (NIT / CC). */
  identification: text(30).default(''),
  email: z.union([z.literal(''), z.string().email().max(200)]),
  city: text(120),
});

/** Todo lo que el usuario edita de una cotización. */
export const quoteDraftSchema = z.object({
  status: quoteStatusSchema,
  lossReason: lossReasonSchema.nullable(),
  nextFollowUp: isoDateSchema.nullable(),
  /** En qué va la conversación con el cliente (todas las cotizaciones; null = sin etapa). */
  stage: followUpStageSchema.nullable().default(null),
  /** Fecha en que se cambió la etapa por última vez (la pone el servidor). */
  stageUpdatedOn: isoDateSchema.nullable().default(null),
  /** Tipo de transacción (Cotización u Orden de trabajo). */
  transactionType: z.enum(TRANSACTION_TYPES).default('quote'),
  /** Seguimiento comercial (columnas del Excel CRM Ventas). */
  followUp: followUpSchema.default({}),
  /** Investigación comercial del cliente (null = aún sin investigar). */
  research: clientResearchSchema.nullable().default(null),
  client: clientSchema,
  businessUnit: businessUnitSchema.nullable(),
  serviceType: serviceTypeSchema.nullable().default(null),
  complexity: complexitySchema,
  solution: solutionSchema.nullable(),
  issueDate: isoDateSchema,
  validDays: z.number().int().min(1).max(365),
  /** TRM COP/USD aplicada a los ítems en dólares. */
  exchangeRate: z.number().finite().positive(),
  /** % de nacionalización + transporte a bodega. */
  importCostPct: pct,
  items: z.array(quoteItemSchema).max(2_000),
  staff: z.array(staffMemberSchema).max(200),
  laborActivities: z.array(costLineSchema).max(500),
  otherCosts: z.array(costLineSchema).max(500),
  pricing: pricingSchema,
  terms: termsSchema,
  closure: closureSchema,
  /** OT de la cotización que esta sustituye (nueva → anterior). */
  supersedesNumber: z.string().max(40).nullable().default(null),
  /** OT de la cotización que sustituye a esta (anterior → nueva). */
  supersededByNumber: z.string().max(40).nullable().default(null),
});

export const quoteSchema = quoteDraftSchema.extend({
  id: z.string().uuid(),
  number: z.string(),
  version: z.number().int().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const statusChangeSchema = z.object({
  status: quoteStatusSchema,
  lossReason: lossReasonSchema.nullable().optional(),
  /** Si viene, cambia también la etapa del seguimiento (null = sin etapa). */
  stage: followUpStageSchema.nullable().optional(),
});

export const catalogEntrySchema = z.object({
  description: z.string().trim().min(3).max(500),
  unit: text(20),
  currency: currencySchema,
  unitPrice: money,
  laborPct: pct,
});

export const importedRowSchema = z.object({
  description: z.string().min(1).max(500),
  unit: text(20),
  quantity: money,
  currency: currencySchema,
  unitPrice: money,
  note: z.string().max(300).optional(),
});

export const companyProfileSchema = z.object({
  legalName: text(200),
  tradeName: text(200),
  city: text(120),
  address: text(300),
  phones: text(200),
  about: text(2_000),
  signatoryName: text(200),
  signatoryTitle: text(200),
  signatoryContact: text(300),
  slogan: text(200),
  /** Ruta base de Dropbox en el equipo del usuario (se le agrega la unidad de negocio). */
  dropboxBasePath: text(500),
});

export type QuoteItem = z.infer<typeof quoteItemSchema>;
export type OvertimeHours = z.infer<typeof overtimeHoursSchema>;
export type StaffMember = z.infer<typeof staffMemberSchema>;
export type CostLine = z.infer<typeof costLineSchema>;
export type Pricing = z.infer<typeof pricingSchema>;
export type Terms = z.infer<typeof termsSchema>;
export type ClosureCategory = z.infer<typeof closureCategorySchema>;
export type ClosureEntry = z.infer<typeof closureEntrySchema>;
export type Closure = z.infer<typeof closureSchema>;
export type LineActual = z.infer<typeof lineActualSchema>;
export type ClientInfo = z.infer<typeof clientSchema>;
export type QuoteFollowUp = z.infer<typeof followUpSchema>;
export type ClientResearch = z.infer<typeof clientResearchSchema>;
export type ClientResearchRequest = z.infer<typeof clientResearchRequestSchema>;
export type ResearchImageRequest = z.infer<typeof researchImageRequestSchema>;
export type QuoteDraft = z.infer<typeof quoteDraftSchema>;
export type Quote = z.infer<typeof quoteSchema>;
export type StatusChange = z.infer<typeof statusChangeSchema>;
export type CatalogEntry = z.infer<typeof catalogEntrySchema>;
export type ImportedRow = z.infer<typeof importedRowSchema>;
export type CompanyProfile = z.infer<typeof companyProfileSchema>;
