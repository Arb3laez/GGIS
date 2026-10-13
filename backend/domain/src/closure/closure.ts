import { DEFAULT_CLOSURE_CATEGORIES } from '../constants';
import type { Closure, ClosureCategory, QuoteDraft } from '../schemas';
import { priceForTargetMargin, type QuoteTotals } from '../pricing/engine';

/** Costo real: suma de la bitácora; si está vacía, el valor cargado de una sola vez (legado). */
export function actualCost(closure: Closure): number {
  const fromLog = closure.entries.reduce((s, e) => s + e.amount, 0);
  return fromLog > 0 ? fromLog : (closure.legacyActualCost ?? 0);
}

export function costByCategory(closure: Closure): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of closure.categories) out[c.id] = 0;
  for (const e of closure.entries) out[e.categoryId] = (out[e.categoryId] ?? 0) + e.amount;
  return out;
}

/**
 * Quita una categoría moviendo sus costos a "Otros costos del proyecto" (o a la primera que
 * quede). Debe quedar al menos una categoría.
 */
export function removeClosureCategory(closure: Closure, categoryId: string): Closure {
  if (closure.categories.length <= 1) throw new Error('Debe quedar al menos una categoría.');
  const remaining = closure.categories.filter((c) => c.id !== categoryId);
  const target: ClosureCategory | undefined = remaining.find((c) => c.id === 'otros') ?? remaining[0];
  return {
    ...closure,
    categories: remaining,
    entries: closure.entries.map((e) =>
      e.categoryId === categoryId && target ? { ...e, categoryId: target.id } : e,
    ),
  };
}

export function ensureClosureCategories(closure: Closure): Closure {
  return closure.categories.length > 0
    ? closure
    : { ...closure, categories: DEFAULT_CLOSURE_CATEGORIES.map((c) => ({ ...c })) };
}

export type HealthLevel = 'ok' | 'warning' | 'danger';

export interface ClosureAnalysis {
  hasActualCost: boolean;
  isClosed: boolean;
  budgetCost: number;
  budgetSale: number;
  budgetProfit: number;
  budgetMarginPct: number;
  actualCost: number;
  actualSale: number;
  /** El valor real cobrado fue ingresado (si no, se usa el presupuestado). */
  actualSaleProvided: boolean;
  actualProfit: number;
  actualMarginPct: number;
  costDeviation: number;
  costDeviationPct: number;
  profitDeviation: number;
  /** % del presupuesto de costo consumido hasta hoy. */
  consumedPct: number;
  consumedLevel: HealthLevel;
  consumedMessage: string | null;
  /** Margen que queda hoy sobre el valor de venta. */
  marginTodayPct: number;
  marginTodayLevel: HealthLevel;
  /** Precio que se debió cobrar con el costo real para 15% y 20% de utilidad. */
  targetPrices: Array<{ marginPct: number; total: number; subtotal: number }>;
  soldAboveHealthyRange: boolean;
  /** El costo real superó el presupuesto en más de 10%. */
  overBudget: boolean;
  /** La utilidad real quedó por encima de 25%. */
  unusuallyHighMargin: boolean;
}

/**
 * Comparativo presupuestado vs. real para proyectos adjudicados (auditoría paralela).
 * Nota: el "valor de venta" presupuestado es el total de la oferta (con IVA/AIU), igual que en
 * la versión original del cotizador.
 */
export function analyzeClosure(draft: QuoteDraft, totals: QuoteTotals): ClosureAnalysis {
  const budgetCost = totals.totalCost;
  const budgetSale = totals.total;
  const budgetProfit = budgetSale - budgetCost;
  const cost = actualCost(draft.closure);
  const actualSaleProvided = (draft.closure.actualSale ?? 0) > 0;
  const sale = actualSaleProvided ? (draft.closure.actualSale ?? 0) : budgetSale;
  const profit = sale - cost;
  const costDeviation = cost - budgetCost;
  const costDeviationPct = budgetCost > 0 ? (costDeviation / budgetCost) * 100 : 0;
  const consumedPct = budgetCost > 0 ? Math.min((cost / budgetCost) * 100, 999) : 0;
  const marginTodayPct = sale > 0 ? ((sale - cost) / sale) * 100 : 0;
  const actualMarginPct = sale > 0 ? (profit / sale) * 100 : 0;

  let consumedLevel: HealthLevel = 'ok';
  let consumedMessage: string | null = null;
  if (consumedPct >= 100) {
    consumedLevel = 'danger';
    consumedMessage =
      'Ya superaste el 100% del costo presupuestado — cada peso que se gaste de aquí en adelante es utilidad que se está perdiendo.';
  } else if (consumedPct >= 85) {
    consumedLevel = 'danger';
    consumedMessage =
      'Llevas consumido más del 85% del presupuesto y el proyecto aún no está cerrado — revisa qué falta por gastar.';
  } else if (consumedPct >= 70) {
    consumedLevel = 'warning';
    consumedMessage = 'Ya pasaste el 70% del presupuesto — vigila de cerca lo que queda por gastar.';
  }

  const targetPrices = [15, 20].map((marginPct) => {
    const p = priceForTargetMargin(cost, marginPct, draft.pricing);
    return { marginPct, total: p.total, subtotal: p.subtotal };
  });

  return {
    hasActualCost: cost > 0,
    isClosed: !!draft.closure.closedOn,
    budgetCost,
    budgetSale,
    budgetProfit,
    budgetMarginPct: budgetSale > 0 ? (budgetProfit / budgetSale) * 100 : 0,
    actualCost: cost,
    actualSale: sale,
    actualSaleProvided,
    actualProfit: profit,
    actualMarginPct,
    costDeviation,
    costDeviationPct,
    profitDeviation: profit - budgetProfit,
    consumedPct,
    consumedLevel,
    consumedMessage,
    marginTodayPct,
    marginTodayLevel: marginTodayPct >= 15 ? 'ok' : marginTodayPct >= 5 ? 'warning' : 'danger',
    targetPrices,
    soldAboveHealthyRange: sale >= (targetPrices[0]?.total ?? 0),
    overBudget: costDeviationPct > 10,
    unusuallyHighMargin: actualMarginPct > 25,
  };
}
