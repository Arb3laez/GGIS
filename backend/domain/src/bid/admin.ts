import type { Bid } from '../schemas';

/**
 * Administración desglosada (hoja AIU del Excel de licitación):
 *   A.1 personal  = costo mensual × dedicación × meses (contrato o campo)
 *   A.2 gastos generales de obra y oficina (valores fijos)
 *   A.3 otros indirectos = % × costo directo (pólizas, ICA, GMF, costo financiero…)
 *   % administración = (A.1 + A.2 + A.3) ÷ costo directo, redondeado a 4 decimales (como el Excel)
 */
export interface AdminBreakdown {
  personnel: number;
  expenses: number;
  indirects: number;
  /** A.1 + A.2 (es lo que cuenta para el tope de administración del pliego). */
  officeAndSite: number;
  total: number;
  /** % de administración sobre el costo directo (ej. 23.02). */
  pct: number;
}

export function adminPersonCost(person: Bid['adminPersonnel'][number], bid: Pick<Bid, 'contractMonths' | 'fieldMonths'>): number {
  const months = person.period === 'contract' ? bid.contractMonths : bid.fieldMonths;
  return person.monthlyCost * (person.dedicationPct / 100) * months;
}

export function computeAdminBreakdown(bid: Bid, directCost: number): AdminBreakdown {
  const personnel = bid.adminPersonnel.reduce((s, p) => s + adminPersonCost(p, bid), 0);
  const expenses = bid.adminExpenses.reduce((s, e) => s + e.value, 0);
  const indirects = bid.adminIndirects.reduce((s, i) => s + (i.pct / 100) * directCost, 0);
  const total = personnel + expenses + indirects;
  const pct = directCost > 0 ? Math.round((total / directCost) * 10_000) / 100 : 0;
  return { personnel, expenses, indirects, officeAndSite: personnel + expenses, total, pct };
}
