import { SUPPLIER_VAT_RATE } from '../constants';
import type { ApuLine, ApuParams, QuoteDraft, QuoteItem, Supply } from '../schemas';

/**
 * Análisis de precios unitarios (APU), con las mismas fórmulas del Excel de licitación:
 *
 *   precio insumo (COP sin IVA) = USD: valor × TRM × factor importación
 *                                 LIST: valor × factor escalamiento
 *                                 COP: valor
 *   cantidad efectiva            = 1 / rendimiento   (si hay rendimiento)   ó   cantidad
 *   valor parcial                = cantidad efectiva × (1 + desperdicio) × precio × factor IVA
 *   factor IVA                   = 1 para mano de obra; 1 + IVA para equipos, materiales y servicios
 *   herramienta                  = % herramienta × mano de obra
 *   total APU                    = suministro (EQ + MAT) + mano de obra + herramienta + servicios
 */

export type ApuContext = Pick<QuoteDraft, 'exchangeRate'> & { params: ApuParams };

export function supplyUnitPrice(supply: Supply, ctx: ApuContext): number {
  switch (supply.priceType) {
    case 'USD':
      return supply.baseValue * ctx.exchangeRate * ctx.params.importFactor;
    case 'LIST':
      return supply.baseValue * ctx.params.escalationFactor;
    default:
      return supply.baseValue;
  }
}

export function effectiveQuantity(line: ApuLine): number {
  return line.yieldPerDay > 0 ? 1 / line.yieldPerDay : line.quantity;
}

export function apuLineValue(line: ApuLine, supply: Supply, ctx: ApuContext): number {
  const waste = line.applyWaste ? ctx.params.wastePct / 100 : 0;
  const vatFactor = supply.type === 'MO' ? 1 : 1 + SUPPLIER_VAT_RATE;
  return effectiveQuantity(line) * (1 + waste) * supplyUnitPrice(supply, ctx) * vatFactor;
}

export interface ApuBreakdown {
  /** Equipos y materiales (con IVA de compra). */
  supply: number;
  /** Mano de obra (con prestaciones, sin IVA). */
  labor: number;
  /** Herramienta menor y equipo (% de la mano de obra). */
  tools: number;
  /** Servicios (pruebas, certificaciones, planos…), con IVA. */
  services: number;
  /** Costo directo unitario del ítem. */
  total: number;
  /** Líneas cuyo insumo ya no existe en la base (se ignoran en el cálculo). */
  missingSupplies: number;
  /** Líneas con precio estimado (hay que verificarlo antes de adjudicar). */
  estimatedLines: number;
}

export function hasApu(item: QuoteItem): boolean {
  return Array.isArray(item.apu) && item.apu.length > 0;
}

export function computeApu(
  lines: readonly ApuLine[],
  supplies: ReadonlyMap<string, Supply>,
  ctx: ApuContext,
): ApuBreakdown {
  let supply = 0;
  let labor = 0;
  let services = 0;
  let missingSupplies = 0;
  let estimatedLines = 0;
  for (const line of lines) {
    const s = supplies.get(line.supplyId);
    if (!s) {
      missingSupplies++;
      continue;
    }
    if (s.estimated) estimatedLines++;
    const value = apuLineValue(line, s, ctx);
    if (s.type === 'MO') labor += value;
    else if (s.type === 'SV') services += value;
    else supply += value;
  }
  const tools = (ctx.params.toolsPctOfLabor / 100) * labor;
  return { supply, labor, tools, services, total: supply + labor + tools + services, missingSupplies, estimatedLines };
}

export function supplyIndex(draft: Pick<QuoteDraft, 'supplies'>): Map<string, Supply> {
  return new Map(draft.supplies.map((s) => [s.id, s]));
}

export function apuContext(draft: Pick<QuoteDraft, 'exchangeRate' | 'apuParams'>): ApuContext {
  return { exchangeRate: draft.exchangeRate, params: draft.apuParams };
}

/** APU del ítem (o null si el ítem usa el costeo simple). */
export function itemApu(item: QuoteItem, draft: QuoteDraft, index = supplyIndex(draft)): ApuBreakdown | null {
  return hasApu(item) ? computeApu(item.apu!, index, apuContext(draft)) : null;
}
