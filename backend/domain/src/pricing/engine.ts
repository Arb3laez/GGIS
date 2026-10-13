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
  /** Costo total = directo + pólizas + impuestos + financiamiento + imprevistos + administración. */
  totalCost: number;
  /** Utilidad esperada: subtotal − costo total. */
  profit: number;
  /** Valor de venta antes de IVA/AIU. */
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
export function finalizeFromSubtotal(subtotal: number, pricing: Pricing): Pick<QuoteTotals, 'vat' | 'aiu' | 'total'> {
  if (pricing.method === 'simple') {
    const vat = (subtotal * pricing.vatPct) / 100;
    return { vat, aiu: null, total: subtotal + vat };
  }
  const a = pricing.aiu;
  const admin = (subtotal * a.adminPct) / 100;
  const contingency = (subtotal * a.contingencyPct) / 100;
  const profit = (subtotal * a.profitPct) / 100;
  const aiuSubtotal = subtotal + admin + contingency + profit;
  const vatOnProfit = (profit * a.vatOnProfitPct) / 100;
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

  // 1) Costos por ítem
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

  // 2) Totales
  const directCost = materials + itemLabor + laborActivities + staff + otherCosts;
  const oh = overheadsOn(directCost, draft.pricing);
  const totalCost = oh.total;
  const m = marginFraction(draft.pricing);
  const subtotal = totalCost / (1 - m);
  const profit = subtotal - totalCost;
  const final = finalizeFromSubtotal(subtotal, draft.pricing);

  // 3) Reparto del subtotal entre ítems: los que tienen precio fijado lo conservan; el resto se
  // reparte el remanente según su costo ponderado por complejidad. La suma cuadra con el subtotal.
  const hasOverride = (i: QuoteItem) => (i.salePriceOverride ?? 0) > 0;
  const overrideSum = draft.items
    .filter(hasOverride)
    .reduce((s, i) => s + (i.salePriceOverride ?? 0) * i.quantity, 0);
  const weightOf = (p: (typeof partial)[number]) => p.totalCost * ITEM_COMPLEXITY_WEIGHT[p.item.complexity];
  const weightedBase = partial.filter((p) => !hasOverride(p.item)).reduce((s, p) => s + weightOf(p), 0);
  const remainder = subtotal - overrideSum;

  const items: ItemBreakdown[] = partial.map((p) => {
    const { item } = p;
    const saleTotal = hasOverride(item)
      ? (item.salePriceOverride ?? 0) * item.quantity
      : weightedBase > 0
        ? remainder * (weightOf(p) / weightedBase)
        : 0;
    const saleUnitPrice = hasOverride(item)
      ? (item.salePriceOverride ?? 0)
      : item.quantity > 0
        ? saleTotal / item.quantity
        : 0;
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
      isBillable: isBillable(item),
    };
  });

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
  const base = overheadsOn(cost, pricing).total;
  const subtotal = base / (1 - targetMarginPct / 100);
  const final = finalizeFromSubtotal(subtotal, pricing);
  return { subtotal, ...final };
}
