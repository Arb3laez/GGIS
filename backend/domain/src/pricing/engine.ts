import { ITEM_COMPLEXITY_WEIGHT, SUPPLIER_VAT_RATE } from '../constants';
import type { Pricing, QuoteDraft, QuoteItem } from '../schemas';
import { costLinesSubtotal, staffSubtotal } from './labor';

/**
 * Motor de precios. Calcula todo en una sola pasada (O(n)) a partir del borrador de la
 * cotización. Es la ÚNICA implementación de las fórmulas: la usan la web (en vivo), la API
 * (al guardar, para los totales del listado) y los exportadores (Excel, oferta).
 */

export interface ItemBreakdown {
  id: string;
  /** Material unitario en COP (con TRM, nacionalización e IVA del proveedor si aplica). */
  unitMaterialCost: number;
  /** Mano de obra unitaria (% M.O. sobre la base del material, sin IVA). */
  unitLaborCost: number;
  /** Personal fijo + M.O. por actividad cargados a este ítem (total, no unitario). */
  assignedFixedLabor: number;
  /** Costo unitario efectivo (incluye la M.O. fija repartida). */
  unitCost: number;
  totalCost: number;
  saleUnitPrice: number;
  saleTotal: number;
  /** Margen del ítem sobre su precio de venta, en %. */
  marginPct: number;
  /** Sale en la oferta al cliente (tiene descripción y cantidad). */
  isBillable: boolean;
}

export interface AiuBreakdown {
  admin: number;
  contingency: number;
  profit: number;
  subtotal: number;
  vatOnProfit: number;
}

export interface QuoteTotals {
  materials: number;
  /** M.O. de instalación calculada como % del material. */
  itemLabor: number;
  laborActivities: number;
  staff: number;
  otherCosts: number;
  /** Materiales + M.O. + actividades + personal + otros. */
  directCost: number;
  policies: number;
  taxes: number;
  financing: number;
  contingency: number;
  adminCost: number;
  /**
   * Costo presupuestado: en simple es directo + pólizas + impuestos + financiamiento +
   * imprevistos + administración; en AIU es directo + A + I (sin la utilidad U).
   */
  totalCost: number;
  /** Utilidad: en simple es subtotal − costo total; en AIU es la U. */
  profit: number;
  /** Base del precio: valor de venta en simple; costo directo/subtotal de ítems en AIU. */
  subtotal: number;
  /** IVA sobre el subtotal (solo método simple; 0 en AIU). */
  vat: number;
  /** Capa AIU (solo método AIU). */
  aiu: AiuBreakdown | null;
  total: number;
}

export interface QuoteBreakdown {
  totals: QuoteTotals;
  items: ItemBreakdown[];
  /** Personal fijo + M.O. por actividad (lo que se puede cargar a ítems marcados). */
  assignableLabor: number;
  /** Ítems marcados con "¿Cargar M.O. aquí?" que reciben la M.O. fija. */
  itemsCarryingLabor: number;
}

type RateContext = Pick<QuoteDraft, 'exchangeRate' | 'importCostPct'>;

/** Precio unitario del ítem en COP, con nacionalización si aplica (sin IVA). */
export function itemBaseCop(item: QuoteItem, ctx: RateContext): number {
  const base = item.currency === 'USD' ? item.unitPrice * ctx.exchangeRate : item.unitPrice;
  return item.applyImportCost ? base * (1 + ctx.importCostPct / 100) : base;
}

export function itemUnitMaterialCost(item: QuoteItem, ctx: RateContext): number {
  const base = itemBaseCop(item, ctx);
  return item.supplierVatIncluded ? base * (1 + SUPPLIER_VAT_RATE) : base;
}

export function itemUnitLaborCost(item: QuoteItem, ctx: RateContext): number {
  return (itemBaseCop(item, ctx) * item.laborPct) / 100;
}

export function isBillable(item: QuoteItem): boolean {
  return item.description.trim().length > 0 && item.quantity > 0;
}

function carriesLabor(item: QuoteItem): boolean {
  return item.carriesFixedLabor && isBillable(item);
}

/** Recargos que se calculan sobre un costo (iguales en los dos métodos). */
export function overheadsOn(cost: number, pricing: Pricing) {
  const policies = (cost * pricing.policiesPct) / 100;
  const taxes = (cost * pricing.taxesPct) / 100;
  const financing = (cost * pricing.financingPct) / 100;
  const contingency = (cost * pricing.contingencyPct) / 100;
  const adminCost = (cost * pricing.adminPct) / 100;
  return {
    policies,
    taxes,
    financing,
    contingency,
    adminCost,
    total: cost + policies + taxes + financing + contingency + adminCost,
  };
}

/** Margen sobre la venta acotado a [0, 95]%. */
export function marginFraction(pricing: Pricing): number {
  return Math.min(Math.max(pricing.marginPct, 0), 95) / 100;
}

/**
 * Del subtotal (valor de venta) al total que paga el cliente según el método.
 * - simple: subtotal + IVA sobre el subtotal.
 * - AIU: subtotal + A + I + U (sobre el subtotal) + IVA solo sobre la U.
 */
export function finalizeFromSubtotal(
  subtotal: number,
  pricing: Pricing,
  /** true = cada valor se redondea al peso (lo que se factura). */
  roundToPeso = false,
): Pick<QuoteTotals, 'vat' | 'aiu' | 'total'> {
  const r = (x: number) => (roundToPeso ? Math.round(x) : x);
  if (pricing.method === 'simple') {
    const vat = r((subtotal * pricing.vatPct) / 100);
    return { vat, aiu: null, total: subtotal + vat };
  }
  const a = pricing.aiu;
  const exactAdmin = (subtotal * a.adminPct) / 100;
  const exactContingency = (subtotal * a.contingencyPct) / 100;
  const exactProfit = (subtotal * a.profitPct) / 100;
  const admin = r(exactAdmin);
  const contingency = r(exactContingency);
  const profit = r(exactProfit);
  const aiuSubtotal = subtotal + admin + contingency + profit;
  // El IVA se calcula sobre la utilidad exacta, no sobre la ya redondeada: así el total
  // coincide al peso con la oferta comercial y con el AIU del pliego.
  const vatOnProfit = r((exactProfit * a.vatOnProfitPct) / 100);
  return {
    vat: 0,
    aiu: { admin, contingency, profit, subtotal: aiuSubtotal, vatOnProfit },
    total: aiuSubtotal + vatOnProfit,
  };
}

export function computeQuote(draft: QuoteDraft): QuoteBreakdown {
  const ctx: RateContext = { exchangeRate: draft.exchangeRate, importCostPct: draft.importCostPct };

  const staff = staffSubtotal(draft.staff);
  const laborActivities = costLinesSubtotal(draft.laborActivities);
  const otherCosts = costLinesSubtotal(draft.otherCosts);
  const assignableLabor = staff + laborActivities;
  const carriers = draft.items.filter(carriesLabor);
  const laborPerCarrier = carriers.length > 0 ? assignableLabor / carriers.length : 0;

  // 1) Costos por ítem: precio unitario + % de M.O. (y la M.O. fija repartida si se marcó).
  let materials = 0;
  let itemLabor = 0;
  const partial = draft.items.map((item) => {
    const unitMaterialCost = itemUnitMaterialCost(item, ctx);
    const unitLaborCost = itemUnitLaborCost(item, ctx);
    const assignedFixedLabor = carriesLabor(item) ? laborPerCarrier : 0;
    const totalCost = (unitMaterialCost + unitLaborCost) * item.quantity + assignedFixedLabor;
    materials += unitMaterialCost * item.quantity;
    itemLabor += unitLaborCost * item.quantity;
    return { item, unitMaterialCost, unitLaborCost, assignedFixedLabor, totalCost };
  });

  // 2) Totales de costo y precio objetivo (exacto, con decimales).
  // En AIU la base es el costo directo: A/I/U reemplazan el margen y los costos internos.
  const directCost = materials + itemLabor + laborActivities + staff + otherCosts;
  const aiuMode = draft.pricing.method === 'aiu';
  const oh = aiuMode
    ? { policies: 0, taxes: 0, financing: 0, contingency: 0, adminCost: 0, total: directCost }
    : overheadsOn(directCost, draft.pricing);
  const costBeforeAiu = oh.total;
  const targetSubtotal = aiuMode
    ? directCost
    : costBeforeAiu / (1 - marginFraction(draft.pricing));

  // 3) Reparto del precio SOLO entre los ítems que salen en la oferta (con descripción y cantidad).
  // Los que tienen precio fijado lo conservan; el resto se reparte el remanente según su costo
  // ponderado por complejidad. Los ítems que no salen en la oferta no se llevan parte del precio.
  const hasOverride = (i: QuoteItem) => (i.salePriceOverride ?? 0) > 0;
  const billable = partial.filter((p) => isBillable(p.item));
  const overrideSum = billable
    .filter((p) => hasOverride(p.item))
    .reduce((s, p) => s + Math.round(p.item.salePriceOverride ?? 0) * p.item.quantity, 0);
  const toDistribute = billable.filter((p) => !hasOverride(p.item));
  // Si los ítems a repartir no tienen costo propio (p. ej. todo el costo es personal), se reparte
  // en proporción a la cantidad para que el precio quede en las líneas de la oferta.
  const byCost = toDistribute.some((p) => p.totalCost > 0);
  const weightOf = (p: (typeof partial)[number]) =>
    byCost ? p.totalCost * ITEM_COMPLEXITY_WEIGHT[p.item.complexity] : p.item.quantity;
  const weightedBase = toDistribute.reduce((s, p) => s + weightOf(p), 0);
  const remainder = targetSubtotal - overrideSum;

  // 4) Facturación: precio unitario en pesos enteros y total de línea = cantidad × unitario, exacto.
  const items: ItemBreakdown[] = partial.map((p) => {
    const { item } = p;
    const billed = isBillable(item);
    let saleUnitPrice = 0;
    if (billed && hasOverride(item)) {
      saleUnitPrice = Math.round(item.salePriceOverride ?? 0);
    } else if (billed && weightedBase > 0) {
      saleUnitPrice = Math.round((remainder * (weightOf(p) / weightedBase)) / item.quantity);
    }
    // Con cantidades decimales (p. ej. metros) el total de la línea se redondea al peso.
    const saleTotal = billed ? Math.round(saleUnitPrice * item.quantity) : 0;
    const unitCost = item.quantity > 0 ? p.totalCost / item.quantity : p.unitMaterialCost + p.unitLaborCost;
    const marginPct = saleUnitPrice > 0 ? ((saleUnitPrice - unitCost) / saleUnitPrice) * 100 : 0;
    return {
      id: item.id,
      unitMaterialCost: p.unitMaterialCost,
      unitLaborCost: p.unitLaborCost,
      assignedFixedLabor: p.assignedFixedLabor,
      unitCost,
      totalCost: p.totalCost,
      saleUnitPrice,
      saleTotal,
      marginPct,
      isBillable: billed,
    };
  });

  // 5) El subtotal es la suma de las líneas facturadas: la oferta siempre cuadra a la vista del
  // cliente. Sin ítems facturables no hay nada que cobrar (la web muestra un aviso).
  const subtotal = items.reduce((s, i) => s + i.saleTotal, 0);

  // 6) IVA o AIU sobre el subtotal. En AIU el costo presupuestado es el costo directo
  // más la administración y los imprevistos (A + I); la utilidad es U.
  const final = finalizeFromSubtotal(subtotal, draft.pricing, true);
  const totalCost = aiuMode
    ? subtotal + (final.aiu?.admin ?? 0) + (final.aiu?.contingency ?? 0)
    : costBeforeAiu;
  const profit = aiuMode ? (final.aiu?.profit ?? 0) : subtotal - costBeforeAiu;

  return {
    totals: {
      materials,
      itemLabor,
      laborActivities,
      staff,
      otherCosts,
      directCost,
      policies: oh.policies,
      taxes: oh.taxes,
      financing: oh.financing,
      contingency: oh.contingency,
      adminCost: oh.adminCost,
      totalCost,
      profit,
      subtotal,
      ...final,
    },
    items,
    assignableLabor,
    itemsCarryingLabor: carriers.length,
  };
}

/**
 * Precio de venta necesario para lograr un % de utilidad sobre la venta partiendo de un costo
 * (por ejemplo, el costo real de ejecución), con los mismos porcentajes y método de la cotización.
 */
export function priceForTargetMargin(cost: number, targetMarginPct: number, pricing: Pricing) {
  if (pricing.method === 'aiu') {
    // En AIU se busca que U / total = margen objetivo. A e I se mantienen como porcentajes
    // del costo y el IVA se aplica solo sobre U.
    const a = pricing.aiu;
    const m = Math.min(Math.max(targetMarginPct, 0), 95) / 100;
    const v = a.vatOnProfitPct / 100;
    const denom = 1 - m * (1 + v);
    if (denom <= 0) {
      const final = finalizeFromSubtotal(cost, pricing);
      return { subtotal: cost, ...final };
    }
    const profitPct = Math.min(
      95,
      ((m * (1 + a.adminPct / 100 + a.contingencyPct / 100)) / denom) * 100,
    );
    const final = finalizeFromSubtotal(cost, {
      ...pricing,
      aiu: { ...a, profitPct },
    });
    return { subtotal: cost, ...final };
  }
  const base = overheadsOn(cost, pricing).total;
  const subtotal = base / (1 - targetMarginPct / 100);
  const final = finalizeFromSubtotal(subtotal, pricing);
  return { subtotal, ...final };
}
