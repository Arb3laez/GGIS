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

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * AIU sugerido para el cliente: parte de 10/4/4 y ajusta por tamaño, solución, complejidad,
 * tipo de servicio, mano de obra, importados y forma de pago, dentro de los rangos usuales en
 * Colombia (A 8–15%, I 1–8%, U 3–8%). Se aplica sobre el subtotal, como en v68.
 */
export function suggestAiu(draft: QuoteDraft, totals: QuoteTotals): Suggestion<AiuSuggestion> {
  const cost = totals.directCost;
  const reasons: string[] = ['base: A 10% · I 4% · U 4%'];
  let A = 10;
  let I = 4;
  let U = 4;

  if (cost < 30_000_000) {
    A += 2;
    U += 2;
    reasons.push('proyecto pequeño (<$30M): los costos fijos pesan más → +2 A y +2 U');
  } else if (cost <= 150_000_000) {
    A += 1;
    U += 1;
    reasons.push('proyecto mediano ($30M–$150M): +1 A y +1 U');
  } else {
    A -= 1;
    U -= 1;
    reasons.push('proyecto grande (>$150M): se compite por precio → −1 A y −1 U');
  }

  switch (draft.solution) {
    case 'fire_suppression':
      A += 2;
      I += 2;
      reasons.push('extinción de incendios: obra civil, tubería y pruebas hidráulicas → +2 A y +2 I');
      break;
    case 'fire_detection':
      A += 1;
      I += 1;
      reasons.push('detección de incendios: normativa NFPA y certificaciones → +1 A y +1 I');
      break;
    case 'access_control':
      I += 1;
      reasons.push('control de acceso: integración y coordinación con obra → +1 I');
      break;
    case 'anti_theft':
      A -= 1;
      reasons.push('antihurto: instalación estándar y bajo riesgo → −1 A');
      break;
    case 'solt':
      A -= 1;
      reasons.push('SOLT: instalación repetitiva y bajo riesgo → −1 A');
      break;
    default:
      break;
  }

  switch (draft.serviceType) {
    case 'supply_install':
      A += 1;
      I += 1;
      reasons.push('suministro + instalación: supervisión de montaje → +1 A y +1 I');
      break;
    case 'preventive':
      A -= 1;
      I += 1;
      reasons.push('mantenimiento preventivo: menos administración pero visitas programadas → −1 A y +1 I');
      break;
    case 'corrective':
      A -= 1;
      I += 2;
      reasons.push('mantenimiento correctivo: diagnóstico incierto y atención urgente → −1 A y +2 I');
      break;
    case 'supply_only':
      A -= 2;
      U -= 1;
      reasons.push('solo suministro: sin operación en obra → −2 A y −1 U');
      break;
    default:
      break;
  }

  if (draft.complexity === 'high') {
    A += 2;
    I += 2;
    reasons.push('complejidad alta: más coordinación y riesgo → +2 A y +2 I');
  } else if (draft.complexity === 'low') {
    A -= 1;
    I -= 1;
    reasons.push('complejidad baja: instalación estándar → −1 A y −1 I');
  }

  const labor = totals.itemLabor + totals.laborActivities + totals.staff;
  const laborShare = cost > 0 ? labor / cost : 0;
  if (laborShare > 0.4) {
    A += 1;
    I += 1;
    reasons.push('mano de obra >40% del costo: más supervisión y variabilidad → +1 A y +1 I');
  } else if (laborShare < 0.15) {
    A -= 1;
    reasons.push('mano de obra <15% del costo: proyecto principalmente de suministro → −1 A');
  }

  if (hasImportedItems(draft)) {
    I += 1;
    reasons.push('equipos importados: riesgo de TRM y disponibilidad → +1 I');
  }

  const t = draft.terms;
  if (t.financingDays > 30 || t.advancePct < 30) {
    A += 1;
    I += 1;
    reasons.push('pago con financiación o anticipo bajo: más costo financiero → +1 A y +1 I');
  } else if (t.advancePct >= 50) {
    A -= 1;
    reasons.push('anticipo ≥50%: menor necesidad de financiación → −1 A');
  }

  const value: AiuSuggestion = {
    adminPct: clamp(A, 8, 15),
    contingencyPct: clamp(I, 1, 8),
    profitPct: clamp(U, 3, 8),
  };
  const total = value.adminPct + value.contingencyPct + value.profitPct;
  reasons.push(
    `AIU total ${total.toFixed(0)}% — rango habitual en Colombia: 25%–35% en obra, menos en suministro.`,
  );
  return { value, reasons };
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
      message: `${formatCop(breakdown.assignableLabor)} de mano de obra cargada a ${breakdown.itemsCarryingLabor} ítem(s) · precio de venta calculado para dejar ${draft.pricing.marginPct}% de margen sobre la venta.`,
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
    // Igual que v68: siempre informa el total y avisa en rojo si queda por debajo del 15%.
    const low = aiuTotal < THRESHOLDS.lowAiuTotalPct;
    out.push({
      code: 'aiu-total',
      level: low ? 'danger' : 'info',
      message: low
        ? `AIU total: ${aiuTotal.toFixed(1)}% — quedas por debajo del rango habitual en Colombia (25%–35% en obra). Revisa si cubre tu gasto administrativo real.`
        : `AIU total: ${aiuTotal.toFixed(1)}% — rango habitual en Colombia: 25%–35% en obra, menos en suministro.`,
    });
    if (a.adminPct < 5 || a.adminPct > 20) {
      out.push({
        code: 'aiu-admin',
        level: 'warning',
        message: `Administración A ${a.adminPct}% fuera del rango habitual 5%–20%.`,
      });
    }
    if (a.contingencyPct < 1 || a.contingencyPct > 10) {
      out.push({
        code: 'aiu-contingency',
        level: 'warning',
        message: `Imprevistos I ${a.contingencyPct}% fuera del rango habitual 1%–10%.`,
      });
    }
    if (a.profitPct < 3 || a.profitPct > 15) {
      out.push({
        code: 'aiu-profit',
        level: 'warning',
        message: `Utilidad U ${a.profitPct}% fuera del rango habitual 3%–15%.`,
      });
    }
  }
  return out;
}
