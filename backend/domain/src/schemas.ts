import { z } from 'zod';
import {
  BUSINESS_UNITS,
  COMPLEXITIES,
  CURRENCIES,
  LOSS_REASONS,
  PAYMENT_MODES,
  PRICING_METHODS,
  QUOTE_STATUSES,
  SERVICE_TYPES,
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

export const closureSchema = z.object({
  categories: z.array(closureCategorySchema).min(1).max(50),
  entries: z.array(closureEntrySchema).max(5_000),
  actualSale: money.nullable(),
  closedOn: isoDateSchema.nullable(),
  notes: text(5_000),
  /** Costo real cargado de una sola vez en versiones antiguas (antes de la bitácora). */
  legacyActualCost: money.nullable(),
});

export const clientSchema = z.object({
  name: text(200),
  project: text(300),
  contact: text(200),
  email: z.union([z.literal(''), z.string().email().max(200)]),
  city: text(120),
});

/** Todo lo que el usuario edita de una cotización. */
export const quoteDraftSchema = z.object({
  status: quoteStatusSchema,
  lossReason: lossReasonSchema.nullable(),
  nextFollowUp: isoDateSchema.nullable(),
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
export type ClientInfo = z.infer<typeof clientSchema>;
export type QuoteDraft = z.infer<typeof quoteDraftSchema>;
export type Quote = z.infer<typeof quoteSchema>;
export type StatusChange = z.infer<typeof statusChangeSchema>;
export type CatalogEntry = z.infer<typeof catalogEntrySchema>;
export type ImportedRow = z.infer<typeof importedRowSchema>;
export type CompanyProfile = z.infer<typeof companyProfileSchema>;
