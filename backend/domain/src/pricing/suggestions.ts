import { THRESHOLDS } from '../constants';
import type { QuoteDraft } from '../schemas';
import { formatCop } from '../format';
import type { QuoteBreakdown, QuoteTotals } from './engine';

export interface Suggestion<T> {
  value: T;
  reasons: string[];
}

function hasImportedItems(draft: QuoteDraft): boolean {
  return draft.items.some((i) => i.currency === 'USD' || i.applyImportCost);
}

/**
 * Utilidad sugerida (15%–30%): base por monto del costo directo, ajustada por importados,
 * tipo de solución y complejidad.
 */
export function suggestMargin(draft: QuoteDraft, totals: QuoteTotals): Suggestion<number> {
  const cost = totals.directCost;
  const reasons: string[] = [];
  let pct: number;
  if (cost < 30_000_000) {
    pct = 29;
    reasons.push('proyecto pequeño (menos de $30M): los costos fijos pesan más → margen alto');
  } else if (cost <= 150_000_000) {
    pct = 24;
    reasons.push('proyecto mediano ($30M–$150M): margen intermedio');
  } else {
    pct = 18;
    reasons.push('proyecto grande (más de $150M): se compite por precio → margen menor');
  }
  if (hasImportedItems(draft)) {
    pct += 3;
    reasons.push('+3 por equipos importados (riesgo de TRM y disponibilidad)');
  }
  if (draft.solution === 'fire_suppression') {
    pct += 4;
    reasons.push('+4 por extinción de incendios (obra civil, tubería, pruebas hidráulicas)');
  } else if (draft.solution === 'fire_detection') {
    pct += 2;
    reasons.push('+2 por detección de incendios (normativa NFPA, certificaciones)');
  }
  if (draft.complexity === 'high') {
    pct += 5;
    reasons.push('+5 por complejidad alta (obra civil, integración, normativa exigente, alto riesgo)');
  } else if (draft.complexity === 'low') {
    pct -= 3;
    reasons.push('-3 por complejidad baja (instalación estándar, bajo riesgo)');
  }
  return { value: Math.max(15, Math.min(30, pct)), reasons };
}

export interface AiuSuggestion {
  adminPct: number;
  contingencyPct: number;
  profitPct: number;
}

/** AIU sugerido con los rangos usuales en Colombia: A 8–15%, I 1–8%, U 3–8%. */
export function suggestAiu(draft: QuoteDraft, totals: QuoteTotals): Suggestion<AiuSuggestion> {
  const cost = totals.directCost;
  const reasons: string[] = [];
  let A = 8;
  let I = 4;
  let U: number;
  if (cost < 30_000_000) {
    U = 8;
    reasons.push('proyecto pequeño: los costos fijos pesan más → utilidad en el tope (8%)');
  } else if (cost <= 150_000_000) {
    U = 6;
    reasons.push('proyecto mediano: utilidad intermedia (6%)');
  } else {
    U = 4;
    reasons.push('proyecto grande: se compite por precio → utilidad menor (4%)');
  }
  if (draft.solution === 'fire_suppression') {
    I = 6;
    A = 10;
    reasons.push('extinción de incendios: obra civil y tubería → imprevistos 6% y administración 10%');
  } else if (draft.solution === 'fire_detection') {
    I = 5;
    reasons.push('detección de incendios: normativa NFPA → imprevistos 5%');
  }
  if (hasImportedItems(draft)) {
    I += 1;
    reasons.push('+1 en imprevistos por equipos importados (riesgo de TRM)');
  }
  return {
    value: {
      adminPct: Math.max(8, Math.min(15, A)),
      contingencyPct: Math.max(1, Math.min(8, I)),
      profitPct: Math.max(3, Math.min(8, U)),
    },
    reasons,
  };
}

export interface NegotiationFloor {
  /** (Total − costo directo) ÷ total. */
  grossMarginPct: number;
  /** Descuento máximo sobre el subtotal antes de quedar en el costo total. */
  maxDiscountPct: number;
  /** Descuento máximo dejando 15% sobre el costo total. */
  discountKeepingFloorPct: number;
  /** Precio piso recomendado (con IVA/AIU). */
  floorPrice: number;
  belowIndustryReference: boolean;
}

export function negotiationFloor(totals: QuoteTotals): NegotiationFloor {
  const grossMarginPct = totals.total > 0 ? ((totals.total - totals.directCost) / totals.total) * 100 : 0;
  const maxDiscountPct = totals.subtotal > 0 ? (totals.profit / totals.subtotal) * 100 : 0;
  const floorSubtotal = totals.totalCost * (1 + THRESHOLDS.healthyFloorMarginPct / 100);
  const discountKeepingFloorPct =
    totals.subtotal > 0 ? Math.max(0, ((totals.subtotal - floorSubtotal) / totals.subtotal) * 100) : 0;
  const floorPrice = floorSubtotal * (totals.total / (totals.subtotal || 1));
  return {
    grossMarginPct,
    maxDiscountPct,
    discountKeepingFloorPct,
    floorPrice,
    belowIndustryReference: grossMarginPct < THRESHOLDS.industryAdminReferencePct,
  };
}

export type WarningLevel = 'ok' | 'info' | 'warning' | 'danger';
export interface QuoteWarning {
  code: string;
  level: WarningLevel;
  message: string;
}

/** Validaciones y avisos comerciales que el editor muestra en vivo. */
export function quoteWarnings(draft: QuoteDraft, breakdown: QuoteBreakdown): QuoteWarning[] {
  const out: QuoteWarning[] = [];
  const { totals } = breakdown;

  const orphans = draft.items.filter(
    (i) => !i.description.trim() && i.quantity > 0 && i.unitPrice > 0,
  ).length;
  const zeroValue = draft.items.filter(
    (i, idx) => i.description.trim() && i.quantity > 0 && breakdown.items[idx]?.totalCost === 0,
  ).length;
  if (orphans > 0) {
    out.push({
      code: 'orphan-items',
      level: 'danger',
      message: `${orphans} ítem(s) con cantidad y precio pero SIN descripción: no saldrán en la oferta y descuadran el total. Ponles nombre o cantidad 0.`,
    });
  } else if (breakdown.assignableLabor > 0 && breakdown.itemsCarryingLabor === 0 && zeroValue > 0) {
    out.push({
      code: 'labor-unassigned',
      level: 'danger',
      message: `Tienes ${formatCop(breakdown.assignableLabor)} de mano de obra (personal + actividades) y ${zeroValue} ítem(s) en $0. Marca "¿Cargar M.O. aquí?" en el ítem de instalación.`,
    });
  } else if (breakdown.itemsCarryingLabor > 0) {
    out.push({
      code: 'labor-assigned',
      level: 'ok',
      message: `${formatCop(breakdown.assignableLabor)} de mano de obra cargada a ${breakdown.itemsCarryingLabor} ítem(s) · margen objetivo ${draft.pricing.marginPct}% sobre la venta.`,
    });
  }

  const billableCount = breakdown.items.filter((i) => i.isBillable).length;
  if (billableCount === 0 && totals.directCost > 0) {
    out.push({
      code: 'no-billable-items',
      level: 'danger',
      message: `Tienes ${formatCop(totals.directCost)} de costo pero ningún ítem con descripción y cantidad: la oferta saldría en $0. Agrega los ítems que vas a cobrar.`,
    });
  }

  const t = draft.terms;
  const paymentSum = t.advancePct + t.progressPct + t.onDeliveryPct;
  if (Math.abs(paymentSum - 100) >= 0.01) {
    out.push({
      code: 'payment-split',
      level: 'danger',
      message: `Los porcentajes de pago suman ${paymentSum}% — deben sumar 100%.`,
    });
  }

  if (t.financingDays > 0 && totals.subtotal > 0) {
    const monthlyRate = (totals.financing / totals.subtotal / (t.financingDays / 30)) * 100;
    const ok = monthlyRate >= THRESHOLDS.minMonthlyFinancingRatePct;
    out.push({
      code: 'financing-rate',
      level: ok ? 'ok' : 'warning',
      message: `Con ${t.financingDays} días de plazo, el ${draft.pricing.financingPct}% de financiamiento equivale a ${monthlyRate.toFixed(2)}% mensual. ${
        ok
          ? 'Cubre el costo del dinero.'
          : 'Puede quedarte corto: considera subir el % de financiamiento o pedir más anticipo.'
      }`,
    });
  }

  if (draft.pricing.method === 'aiu') {
    const a = draft.pricing.aiu;
    const aiuTotal = a.adminPct + a.contingencyPct + a.profitPct;
    out.push({
      code: 'aiu-total',
      level: aiuTotal < THRESHOLDS.lowAiuTotalPct ? 'warning' : 'info',
      message: `AIU total: ${aiuTotal.toFixed(1)}% — rango habitual en Colombia: 25%–35% en obra, menos en suministro.`,
    });
  }
  return out;
}
