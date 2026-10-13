/**
 * Catálogos y constantes de negocio. Los códigos internos van en inglés (estables para la base de
 * datos y la API); las etiquetas en español son las que ve el usuario.
 */

export const CURRENCIES = ['COP', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const COMPLEXITIES = ['low', 'medium', 'high'] as const;
export type Complexity = (typeof COMPLEXITIES)[number];
export const COMPLEXITY_LABELS: Record<Complexity, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};

export const QUOTE_STATUSES = ['sent', 'negotiating', 'won', 'lost', 'replaced'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  sent: 'Enviada',
  negotiating: 'En negociación',
  won: 'Adjudicada',
  lost: 'Perdida',
  replaced: 'Reemplazada',
};

export const BUSINESS_UNITS = ['cctv', 'fire', 'access_control', 'anti_theft', 'solt'] as const;
export type BusinessUnit = (typeof BUSINESS_UNITS)[number];
export const BUSINESS_UNIT_LABELS: Record<BusinessUnit, string> = {
  cctv: 'CCTV',
  fire: 'Incendios',
  access_control: 'Control acceso',
  anti_theft: 'Antihurto',
  solt: 'SOLT',
};
/** Complejidad que se sugiere al elegir la unidad de negocio. */
export const DEFAULT_COMPLEXITY_BY_UNIT: Record<BusinessUnit, Complexity> = {
  fire: 'high',
  access_control: 'medium',
  cctv: 'medium',
  anti_theft: 'low',
  solt: 'low',
};

export const LOSS_REASONS = [
  'price',
  'delivery_time',
  'competition',
  'client_budget',
  'project_cancelled',
  'no_response',
  'other',
] as const;
export type LossReason = (typeof LOSS_REASONS)[number];
export const LOSS_REASON_LABELS: Record<LossReason, string> = {
  price: 'Precio muy alto',
  delivery_time: 'Tiempo de entrega',
  competition: 'Se la dieron a otro proveedor',
  client_budget: 'El cliente no tenía presupuesto',
  project_cancelled: 'El proyecto se canceló',
  no_response: 'El cliente no volvió a responder',
  other: 'Otro',
};

export const PRICING_METHODS = ['simple', 'aiu'] as const;
export type PricingMethod = (typeof PRICING_METHODS)[number];
export const PRICING_METHOD_LABELS: Record<PricingMethod, string> = {
  simple: 'Subtotal + IVA',
  aiu: 'AIU',
};

export const PAYMENT_MODES = [
  'prepaid',
  'advance_balance',
  'advance_financing',
  'cash_on_delivery',
  'credit',
] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];
export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  prepaid: 'Pago anticipado (100% antes de iniciar)',
  advance_balance: 'Anticipo + saldo contra entrega',
  advance_financing: 'Anticipo + saldo financiado a X días',
  cash_on_delivery: 'Contado contra entrega',
  credit: 'Crédito total a X días',
};

export const SOLUTIONS = [
  'cctv',
  'fire_detection',
  'fire_suppression',
  'access_control',
  'anti_theft',
  'solt',
  'custom',
] as const;
export type Solution = (typeof SOLUTIONS)[number];

/** Plantillas de ítems típicos por solución: [descripción, unidad]. */
export const SOLUTION_TEMPLATES: Record<Solution, { label: string; items: ReadonlyArray<[string, string]> }> = {
  cctv: {
    label: 'CCTV',
    items: [
      ['Cámara bala IP', 'UN'],
      ['Cámara domo IP', 'UN'],
      ['Grabador NVR', 'UN'],
      ['Switch PoE administrable', 'UN'],
      ['Cable UTP cat 6', 'ML'],
      ['Disco duro NVR', 'UN'],
      ['Gabinete / rack', 'UN'],
      ['Tubería EMT 3/4', 'ML'],
      ['Mano de obra instalación y configuración', 'UN'],
    ],
  },
  fire_detection: {
    label: 'Detección de incendios',
    items: [
      ['Panel de detección (FACP)', 'UN'],
      ['Detector de humo', 'UN'],
      ['Estación manual de alarma', 'UN'],
      ['Sirena / estrobo', 'UN'],
      ['Módulo de control', 'UN'],
      ['Baterías 12V', 'UN'],
      ['Tubería EMT 3/4', 'ML'],
      ['Cable FPLR', 'ML'],
      ['Instalación, configuración y puesta en marcha', 'UN'],
    ],
  },
  fire_suppression: {
    label: 'Extinción de incendios',
    items: [
      ['Tubería acero ranurada', 'ML'],
      ['Acople rígido', 'UN'],
      ['Codo ranurado', 'UN'],
      ['Gabinete tipo I', 'UN'],
      ['Soporte sísmico', 'UN'],
      ['Pintura anticorrosiva', 'ML'],
      ['Pruebas hidráulicas red contra incendios', 'UN'],
      ['Mano de obra instalación', 'UN'],
    ],
  },
  access_control: {
    label: 'Control de acceso',
    items: [
      ['Lector biométrico / tarjeta', 'UN'],
      ['Controladora de acceso', 'UN'],
      ['Cerradura eléctrica', 'UN'],
      ['Botón de salida', 'UN'],
      ['Fuente de poder', 'UN'],
      ['Cableado', 'ML'],
      ['Instalación y configuración', 'UN'],
    ],
  },
  anti_theft: {
    label: 'Antihurto (EAS)',
    items: [
      ['Antena EAS', 'UN'],
      ['Etiquetas de seguridad', 'UN'],
      ['Desactivador', 'UN'],
      ['Instalación y configuración', 'UN'],
    ],
  },
  solt: {
    label: 'SOLT (localización)',
    items: [
      ['Display', 'UN'],
      ['Botón de llamado', 'UN'],
      ['Localizador', 'UN'],
      ['Receptor', 'UN'],
      ['Amplificador', 'UN'],
      ['Sensor', 'UN'],
      ['Soporte', 'UN'],
    ],
  },
  custom: { label: 'Personalizada', items: [] },
};

/** Atajos de "Mano de obra por actividad". */
export const LABOR_ACTIVITY_PRESETS = [
  'Instalación y montaje de equipos',
  'Tendido de tubería y cableado',
  'Configuración y programación',
  'Pruebas y puesta en marcha',
  'Desmonte de equipos existentes',
  'Capacitación al personal del cliente',
] as const;

/** Atajos de "Otros costos del proyecto". */
export const OTHER_COST_PRESETS = [
  'Herramienta menor y consumibles',
  'Alquiler de escalera / andamio',
  'Alquiler de elevador / plataforma',
  'Transporte interno de materiales',
  'Transporte a otra ciudad',
  'Viáticos y alojamiento del personal',
  'Licencia de app / software',
  'Diseño e ingeniería',
] as const;

// ---------------------------------------------------------------------------
// Parámetros laborales Colombia 2026
// ---------------------------------------------------------------------------

/** Salario mínimo 2026 (Decretos 1469/1470 de 2025, vigencia transitoria por Decreto 0159 de 2026). */
export const MINIMUM_WAGE_2026 = 1_750_905;
/** Auxilio de transporte 2026. */
export const TRANSPORT_ALLOWANCE_2026 = 249_095;
/** Jornada legal 42 h/semana → (42 h ÷ 6 días) × 30 = 210 h/mes (Ley 2101 de 2021). */
export const MONTHLY_HOURS_2026 = 210;
/** Factor prestacional por defecto (cesantías, prima, vacaciones, salud, pensión, caja). */
export const DEFAULT_BENEFITS_FACTOR = 1.58;
/**
 * Recargos (Art. 168 CST, Ley 2466 de 2025). Jornada nocturna desde las 7:00 p.m.
 * Dominical/festivo 90% desde jul. 2026 (sube a 100% en jul. 2027).
 */
export const SURCHARGES = {
  extraDay: 0.25,
  extraNight: 0.75,
  night: 0.35,
  holiday: 0.9,
} as const;

/** IVA que el proveedor puede traer incluido en el precio de compra. */
export const SUPPLIER_VAT_RATE = 0.19;

/** Peso relativo con el que cada ítem absorbe margen según su complejidad. */
export const ITEM_COMPLEXITY_WEIGHT: Record<Complexity, number> = { low: 0.8, medium: 1, high: 1.25 };

/** Categorías por defecto de la bitácora de costos reales (mismas del Resumen). */
export const DEFAULT_CLOSURE_CATEGORIES: ReadonlyArray<{ id: string; name: string }> = [
  { id: 'materiales', name: 'Materiales' },
  { id: 'mano_obra', name: 'Mano de obra' },
  { id: 'otros', name: 'Otros costos del proyecto' },
  { id: 'polizas', name: 'Pólizas' },
  { id: 'impuestos', name: 'Impuestos' },
  { id: 'financiamiento', name: 'Financiamiento' },
  { id: 'administracion', name: 'Administración' },
  { id: 'imprevistos', name: 'Imprevistos' },
];

/** Umbrales usados en las alertas comerciales. */
export const THRESHOLDS = {
  /** Margen mínimo "sano" sobre la venta para el piso de negociación. */
  healthyFloorMarginPct: 15,
  /** Referencia de la industria: gasto administrativo ≈ 28% de la venta. */
  industryAdminReferencePct: 28,
  /** Tasa mensual mínima que debe cubrir el % de financiamiento. */
  minMonthlyFinancingRatePct: 1.2,
  /** Días sin seguimiento antes de marcar una oferta como pendiente. */
  followUpAfterDays: 7,
  /** AIU total por debajo de este valor se marca como bajo. */
  lowAiuTotalPct: 15,
} as const;
