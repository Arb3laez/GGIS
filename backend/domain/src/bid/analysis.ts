import type { PriceReviewStatus } from '../constants';
import type { QuoteDraft } from '../schemas';
import type { QuoteBreakdown } from '../pricing/engine';

/**
 * Análisis de licitación (hojas REVISION PRECIOS, AIU y LICIFY del Excel):
 * revisión del subcontratista, topes del pliego y datos para la plataforma de licitación.
 */

/** Umbrales del Excel: > +50% MUY ALTO · > +20% ALTO · < −50% MUY BAJO · < −20% BAJO · resto OK. */
export function reviewStatus(diff: number): PriceReviewStatus {
  if (diff > 0.5) return 'very_high';
  if (diff > 0.2) return 'high';
  if (diff < -0.5) return 'very_low';
  if (diff < -0.2) return 'low';
  return 'ok';
}

export interface SubcontractorRow {
  id: string;
  description: string;
  quantity: number;
  /** Costo directo unitario propio (APU o costeo simple). */
  ownUnitCost: number;
  /** Precio unitario de la oferta (redondeado). */
  offerUnitPrice: number;
  subUnitPrice: number;
  /** subcontratista ÷ propio − 1. */
  diff: number;
  status: PriceReviewStatus;
  subTotal: number;
  offerTotal: number;
  /** Sobrecosto del subcontratista frente a la oferta (positivo = más caro). */
  overcost: number;
}

export interface SubcontractorReview {
  rows: SubcontractorRow[];
  /** Ítems facturables sin precio del subcontratista. */
  missing: number;
  subTotal: number;
  /** Total de la oferta (costo directo) de los mismos ítems. */
  offerTotal: number;
  diff: number;
  /** Valor sin IVA − costo del subcontratista − administración (negativo = se pierde dinero). */
  resultIfSubcontracted: number;
  /** Precio máximo de subcontrato que conserva imprevistos + utilidad (= costo directo de la oferta). */
  maxSubcontractPrice: number;
  /** Reducción que tendría que hacer el subcontratista sobre lo cotizado. */
  requiredReduction: number;
  topOvercosts: SubcontractorRow[];
}

export interface CapCheck {
  key: 'materials' | 'labor' | 'admin';
  label: string;
  value: number;
  sharePct: number;
  maxPct: number;
  ok: boolean;
}

export interface BidAnalysis {
  /** Valor total sin IVA (base de los topes). */
  totalWithoutVat: number;
  supplyTotal: number;
  installTotal: number;
  /** Mano de obra (solo M.O., con prestaciones) para el tope del pliego. */
  laborOnlyTotal: number;
  review: SubcontractorReview | null;
  caps: CapCheck[];
  /** Utilidad mínima (en %) para cumplir el tope de materiales; null si no aplica. */
  minProfitPctForMaterialsCap: number | null;
  licify: {
    supply: number;
    installation: number;
    directCost: number;
    adminPct: number;
    contingencyPct: number;
    profitPct: number;
    vatPct: number;
    total: number;
  };
  /** Líneas de APU con precio estimado (verificar antes de adjudicar). */
  estimatedApuLines: number;
  estimatedSupplies: number;
}

export function analyzeBid(draft: QuoteDraft, breakdown: QuoteBreakdown): BidAnalysis {
  const { totals } = breakdown;
  const totalWithoutVat = totals.aiu ? totals.aiu.subtotal : totals.subtotal;
  const billable = draft.items.map((it, i) => ({ it, b: breakdown.items[i]! })).filter(({ b }) => b.isBillable);

  const supplyTotal = billable.reduce((s, { it, b }) => s + b.unitSupplyCost * it.quantity, 0);
  const installTotal = totals.subtotal - supplyTotal;
  const laborOnlyTotal = billable.reduce(
    (s, { it, b }) => s + (b.apu ? b.apu.labor : b.unitLaborCost) * it.quantity + b.assignedFixedLabor,
    0,
  );

  // ---- Revisión del subcontratista
  const priced = billable.filter(({ it }) => it.subcontractorUnitPrice !== null);
  let review: SubcontractorReview | null = null;
  if (priced.length > 0) {
    const rows: SubcontractorRow[] = priced.map(({ it, b }) => {
      const sub = it.subcontractorUnitPrice ?? 0;
      const diff = b.unitCost > 0 ? sub / b.unitCost - 1 : 0;
      const subTotal = sub * it.quantity;
      return {
        id: it.id,
        description: it.description,
        quantity: it.quantity,
        ownUnitCost: b.unitCost,
        offerUnitPrice: b.saleUnitPrice,
        subUnitPrice: sub,
        diff,
        status: reviewStatus(diff),
        subTotal,
        offerTotal: b.saleTotal,
        overcost: subTotal - b.saleTotal,
      };
    });
    const subTotal = rows.reduce((s, r) => s + r.subTotal, 0);
    const offerTotal = rows.reduce((s, r) => s + r.offerTotal, 0);
    const admin = totals.aiu?.admin ?? 0;
    review = {
      rows,
      missing: billable.length - priced.length,
      subTotal,
      offerTotal,
      diff: offerTotal > 0 ? subTotal / offerTotal - 1 : 0,
      resultIfSubcontracted: totalWithoutVat - subTotal - admin,
      maxSubcontractPrice: offerTotal,
      requiredReduction: subTotal > 0 ? Math.max(0, 1 - offerTotal / subTotal) : 0,
      topOvercosts: rows
        .filter((r) => r.overcost > 0)
        .sort((a, b) => b.overcost - a.overcost)
        .slice(0, 8),
    };
  }

  // ---- Topes del pliego (sobre el valor sin IVA)
  const caps = draft.bid.caps;
  const officeAndSite = breakdown.adminBreakdown ? breakdown.adminBreakdown.officeAndSite : (totals.aiu?.admin ?? totals.adminCost);
  const share = (v: number) => (totalWithoutVat > 0 ? (v / totalWithoutVat) * 100 : 0);
  const capChecks: CapCheck[] = [
    { key: 'materials', label: 'Materiales y equipos', value: supplyTotal, maxPct: caps.materialsMaxPct },
    { key: 'labor', label: 'Mano de obra', value: laborOnlyTotal, maxPct: caps.laborMaxPct },
    { key: 'admin', label: 'Administración de obra y oficina', value: officeAndSite, maxPct: caps.adminMaxPct },
  ].map((c) => ({ ...(c as Omit<CapCheck, 'sharePct' | 'ok'>), sharePct: share(c.value), ok: share(c.value) <= c.maxPct }));

  // Utilidad mínima para que materiales ≤ tope (fórmula del Excel, solo con AIU sobre el costo directo).
  const cd = totals.subtotal;
  const minProfit =
    totals.aiu && cd > 0 && caps.materialsMaxPct > 0
      ? Math.max(
          0,
          (supplyTotal / (caps.materialsMaxPct / 100) / cd - 1 - breakdown.aiuAdminPct / 100 - draft.pricing.aiu.contingencyPct / 100) * 100,
        )
      : null;

  const index = new Map(draft.supplies.map((s) => [s.id, s]));
  const estimatedApuLines = billable.reduce((s, { b }) => s + (b.apu?.estimatedLines ?? 0), 0);

  return {
    totalWithoutVat,
    supplyTotal,
    installTotal,
    laborOnlyTotal,
    review,
    caps: capChecks,
    minProfitPctForMaterialsCap: minProfit,
    licify: {
      supply: supplyTotal,
      installation: installTotal,
      directCost: cd,
      adminPct: breakdown.aiuAdminPct,
      contingencyPct: draft.pricing.aiu.contingencyPct,
      profitPct: draft.pricing.aiu.profitPct,
      vatPct: draft.pricing.method === 'simple' ? draft.pricing.vatPct : draft.pricing.aiu.vatOnProfitPct,
      total: totals.total,
    },
    estimatedApuLines,
    estimatedSupplies: [...index.values()].filter((s) => s.estimated).length,
  };
}
