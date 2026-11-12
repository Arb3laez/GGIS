import type { PaymentKind, PaymentRow, QuoteDraft, Terms } from '../schemas';
import { newRowId } from '../factories';
import type { QuoteBreakdown } from './engine';

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  advance: 'Anticipo',
  progress: 'Corte de obra',
  final: 'Pago final',
};

/** Pago del plan con su valor en pesos (sobre el total que paga el cliente, con IVA/AIU). */
export interface ScheduledPayment extends PaymentRow {
  /** Valor de la base sobre la que se aplica el %. */
  baseAmount: number;
  amount: number;
  /** % que representa del total del contrato. */
  shareOfTotal: number;
}

export interface PaymentSchedule {
  rows: ScheduledPayment[];
  total: number;
  scheduled: number;
  /** total − programado: positivo = falta por asignar; negativo = se programó de más. */
  difference: number;
  /** El plan cubre el total (tolera el redondeo al peso de cada pago). */
  balanced: boolean;
}

/**
 * Plan equivalente a los tres porcentajes de siempre (anticipo / avance / contra entrega), para
 * cotizaciones que aún no tienen plan propio.
 */
export function legacyPaymentPlan(t: Terms): PaymentRow[] {
  const rows: Array<[PaymentKind, string, number, string]> = [
    ['advance', 'Anticipo', t.advancePct, 'Al aprobar la orden'],
    ['progress', 'Avance por ejecución', t.progressPct, 'Según avance de obra'],
    ['final', 'Contra entrega', t.onDeliveryPct, 'Al entregar'],
  ];
  return rows
    .filter(([, , pct]) => pct > 0)
    .map(([kind, concept, pct, when], i) => ({
      id: `legacy-${i}`,
      kind,
      concept,
      pct,
      base: 'total',
      itemIds: [],
      when,
    }));
}

export function effectivePaymentPlan(t: Terms): PaymentRow[] {
  return t.paymentPlan?.length ? t.paymentPlan : legacyPaymentPlan(t);
}

/**
 * Valores en pesos de cada pago. El total es lo que paga el cliente (subtotal + IVA o AIU); la
 * base de un grupo de ítems es su valor de venta llevado al total con la misma proporción, y el
 * "resto del contrato" es el total menos los ítems que ya tienen su propio pago.
 */
export function paymentSchedule(draft: QuoteDraft, breakdown: QuoteBreakdown): PaymentSchedule {
  const total = breakdown.totals.total;
  const factor = breakdown.totals.subtotal > 0 ? total / breakdown.totals.subtotal : 0;
  const lineTotal = new Map(breakdown.items.map((b) => [b.id, b.saleTotal * factor]));
  const plan = effectivePaymentPlan(draft.terms);
  const itemsWithOwnPayment = new Set(plan.filter((r) => r.base === 'items').flatMap((r) => r.itemIds));
  const ownValue = [...itemsWithOwnPayment].reduce((s, id) => s + (lineTotal.get(id) ?? 0), 0);

  const rows = plan.map((r) => {
    const baseAmount =
      r.base === 'items'
        ? r.itemIds.reduce((s, id) => s + (lineTotal.get(id) ?? 0), 0)
        : r.base === 'rest'
          ? Math.max(0, total - ownValue)
          : total;
    const amount = Math.round((baseAmount * r.pct) / 100);
    return {
      ...r,
      baseAmount: Math.round(baseAmount),
      amount,
      shareOfTotal: total > 0 ? (amount / total) * 100 : 0,
    };
  });
  const scheduled = rows.reduce((s, r) => s + r.amount, 0);
  const difference = Math.round(total - scheduled);
  return { rows, total, scheduled, difference, balanced: Math.abs(difference) <= Math.max(1, rows.length) };
}

/**
 * Porcentajes resumidos (sobre el total) por tipo de pago, para mantener al día los tres campos de
 * siempre que usan los avisos, el correo y los reportes.
 */
export function summarizePaymentPlan(schedule: PaymentSchedule): {
  advancePct: number;
  progressPct: number;
  onDeliveryPct: number;
} {
  const sum = (k: PaymentKind) =>
    Math.round(schedule.rows.filter((r) => r.kind === k).reduce((s, r) => s + r.shareOfTotal, 0) * 100) / 100;
  return { advancePct: sum('advance'), progressPct: sum('progress'), onDeliveryPct: sum('final') };
}

/** N cortes mensuales iguales (ej. 4 meses de obra al 15%). */
export function monthlyCuts(months: number, pct: number, startAt = 1): PaymentRow[] {
  return Array.from({ length: Math.max(0, Math.min(24, Math.round(months))) }, (_, i) => ({
    id: newRowId(),
    kind: 'progress' as const,
    concept: `Corte de obra ${startAt + i}`,
    pct,
    base: 'total' as const,
    itemIds: [],
    when: `Mes ${startAt + i}`,
  }));
}
