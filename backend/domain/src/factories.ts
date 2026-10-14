import {
  DEFAULT_BENEFITS_FACTOR,
  DEFAULT_CLOSURE_CATEGORIES,
  MINIMUM_WAGE_2026,
  SOLUTION_TEMPLATES,
  type Solution,
} from './constants';
import {
  apuParamsSchema,
  bidSchema,
  type CompanyProfile,
  type CostLine,
  type QuoteDraft,
  type QuoteItem,
  type StaffMember,
} from './schemas';

/** Id corto para filas dentro de una cotización (no es un id de base de datos). */
export function newRowId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function blankItem(description = '', unit = ''): QuoteItem {
  return {
    id: newRowId(),
    description,
    unit,
    quantity: 0,
    currency: 'COP',
    unitPrice: 0,
    applyImportCost: false,
    supplierVatIncluded: false,
    laborPct: 35,
    carriesFixedLabor: false,
    complexity: 'medium',
    salePriceOverride: null,
    apu: null,
    subcontractorUnitPrice: null,
  };
}

export function blankStaffMember(role = '', monthlySalary = MINIMUM_WAGE_2026, transportAllowance = true): StaffMember {
  return {
    id: newRowId(),
    role,
    monthlySalary,
    benefitsFactor: DEFAULT_BENEFITS_FACTOR,
    transportAllowance,
    days: 0,
    hasOvertime: false,
    overtime: {
      extraDay: 0,
      extraNight: 0,
      nightSurcharge: 0,
      holidayDay: 0,
      holidayNight: 0,
      holidayExtraDay: 0,
      holidayExtraNight: 0,
    },
  };
}

export function blankCostLine(concept = ''): CostLine {
  return { id: newRowId(), concept, quantity: 1, unitPrice: 0 };
}

/** Cargos típicos de un proyecto; los días inician en 0. */
export function defaultStaff(): StaffMember[] {
  return [
    blankStaffMember(
      'Ingeniero residente (incendios + seguridad electrónica: CCTV, intrusión, control de acceso)',
      3_510_000,
      false,
    ),
    blankStaffMember('Inspector SISO', MINIMUM_WAGE_2026, false),
    blankStaffMember('Técnico líder', 2_100_000, true),
    blankStaffMember('Técnico auxiliar', 2_000_000, true),
    blankStaffMember('Técnico básico ayudante', MINIMUM_WAGE_2026, true),
    blankStaffMember('Técnico almacenista', MINIMUM_WAGE_2026, true),
  ];
}

export function itemsFromTemplate(solution: Solution): QuoteItem[] {
  const tpl = SOLUTION_TEMPLATES[solution];
  return tpl.items.length ? tpl.items.map(([d, u]) => blankItem(d, u)) : [blankItem()];
}

export const DEFAULT_TERMS_TEXT = {
  scope:
    'Suministro, instalación, configuración y puesta en marcha del sistema descrito en esta oferta, según las cantidades y especificaciones relacionadas.',
  warranty:
    'Los equipos suministrados por GYG INNOVA SOLUTIONS SAS están amparados por una garantía de un (1) año por daños o fallas producidas por defectos de fabricación. Exclusiones: intervención de terceros; uso inapropiado o mala operación; sobrecargas eléctricas o defectos en la instalación eléctrica del lugar; eventos de fuerza mayor; fenómenos naturales.',
  exclusions:
    'GYG INNOVA SOLUTIONS SAS no ejecuta obras civiles; cualquier pase en muros, cárcamo, dique y demás será responsabilidad del contratante. No se incluyen repuestos que no estén discriminados en la oferta. No incluye SISO, andamios ni certificado del cuerpo de bomberos.',
  generalConditions:
    'Cualquier término o condición en la orden de compra de EL CLIENTE que difiera de estos términos no será aplicable, salvo acuerdo previo por escrito. Los precios unitarios están sujetos a modificación si cambian las especificaciones o requerimientos con los cuales se realizó esta cotización. Equipos de importación: estarán disponibles en las instalaciones del cliente según disponibilidad de stock.',
} as const;

/** Cotización nueva con los valores por defecto del cotizador. */
export function createEmptyDraft(now: Date = new Date()): QuoteDraft {
  return {
    status: 'sent',
    lossReason: null,
    nextFollowUp: null,
    client: { name: '', project: '', contact: '', email: '', city: 'Barranquilla' },
    businessUnit: null,
    complexity: 'medium',
    solution: null,
    issueDate: todayIso(now),
    validDays: 30,
    exchangeRate: 4100,
    importCostPct: 8,
    items: [blankItem()],
    staff: defaultStaff(),
    laborActivities: [],
    otherCosts: [],
    pricing: {
      method: 'simple',
      marginPct: 30,
      policiesPct: 1,
      taxesPct: 7,
      financingPct: 1,
      contingencyPct: 3,
      adminPct: 5,
      vatPct: 19,
      aiu: { adminPct: 8, contingencyPct: 4, profitPct: 4, vatOnProfitPct: 19 },
    },
    terms: {
      deliveryNational: '30 días hábiles',
      deliveryImport: '45 a 65 días hábiles',
      installationTime: '8 días hábiles',
      paymentMode: 'advance_balance',
      financingDays: 0,
      advancePct: 40,
      progressPct: 60,
      onDeliveryPct: 0,
      ...DEFAULT_TERMS_TEXT,
    },
    closure: {
      categories: DEFAULT_CLOSURE_CATEGORIES.map((c) => ({ ...c })),
      entries: [],
      actualSale: null,
      closedOn: null,
      notes: '',
      legacyActualCost: null,
    },
    supplies: [],
    apuParams: apuParamsSchema.parse({}),
    bid: bidSchema.parse({}),
  };
}

/** Copia una cotización como una nueva (estado y fecha reiniciados, cierre vacío). */
export function duplicateDraft(source: QuoteDraft, now: Date = new Date()): QuoteDraft {
  const copy = JSON.parse(JSON.stringify(source)) as QuoteDraft;
  const empty = createEmptyDraft(now);
  return {
    ...copy,
    status: 'sent',
    lossReason: null,
    nextFollowUp: null,
    issueDate: todayIso(now),
    closure: empty.closure,
  };
}

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  legalName: 'GYG INNOVA SOLUTIONS S.A.S.',
  tradeName: 'G&G Innova Solutions',
  city: 'Barranquilla, Colombia',
  address: '',
  phones: '',
  about:
    'Empresa barranquillera de seguridad electrónica y protección contra incendios. Diseñamos, instalamos y mantenemos soluciones de CCTV, control de acceso, sistemas antihurto (EAS), detección y extinción de incendios, y localización vehicular (SOLT), con equipo técnico certificado y bajo la normativa vigente (NFPA, RETIE), acompañando al cliente desde el diagnóstico hasta el soporte postventa.',
  signatoryName: '',
  signatoryTitle: 'Gerente comercial',
  signatoryContact: '',
  slogan: 'LA RESPUESTA A TU NECESIDAD',
  dropboxBasePath: 'Dropbox\\G&G INNOVA SOLUTIONS\\Cotizador GGIS',
};
