import { QUOTE_STATUSES, THRESHOLDS, type BusinessUnit, type QuoteStatus } from '../constants';
import type { QuoteSummary } from '../contracts';
import { daysBetween } from '../format';

/**
 * Indicadores comerciales y de precisión del presupuesto, calculados sobre el listado de
 * cotizaciones (no necesita las cotizaciones completas).
 */

export interface StatusBucket {
  count: number;
  value: number;
}

export interface UnitStats {
  unit: BusinessUnit | null;
  quoted: number;
  won: number;
  quotedCount: number;
  wonCount: number;
  successPct: number;
}

export interface BudgetPrecision {
  projects: number;
  avgCostDeviationPct: number;
  avgBudgetMarginPct: number;
  avgActualMarginPct: number;
}

export interface ProjectAtRisk {
  id: string;
  number: string;
  label: string;
  consumedPct: number;
  sale: number;
  marginTodayPct: number;
}

export interface FollowUp {
  id: string;
  number: string;
  clientName: string;
  projectName: string;
  daysSinceIssue: number;
  nextFollowUp: string | null;
}

export interface MonthBucket {
  /** AAAA-MM */
  key: string;
  /** "Ene", "Feb"… */
  label: string;
  year: number;
  quoted: number;
  won: number;
  count: number;
}

export interface UnitMonthCell {
  unit: BusinessUnit | null;
  month: string;
  count: number;
  value: number;
}

export interface Dashboard {
  /** Total de cotizaciones registradas (todas, sin importar el estado). */
  totalQuotes: number;
  /** Últimos meses (incluido el actual), por fecha de emisión. */
  monthly: MonthBucket[];
  /** Cotizaciones por unidad de negocio y mes (para el mapa de calor). */
  unitMonth: UnitMonthCell[];
  byStatus: Record<QuoteStatus, StatusBucket>;
  /** Ganadas ÷ (ganadas + perdidas); null si no hay decididas. */
  closeRatePct: number | null;
  lossReasons: Array<{ reason: string; count: number }>;
  byUnit: UnitStats[];
  totals: UnitStats;
  precision: BudgetPrecision | null;
  inExecution: number;
  atRisk: ProjectAtRisk[];
  followUps: FollowUp[];
}

function marginPct(sale: number, cost: number): number {
  return sale > 0 ? ((sale - cost) / sale) * 100 : 0;
}

function saleOf(q: QuoteSummary): number {
  return q.actualSale || q.total || 0;
}

function executed(list: QuoteSummary[]): QuoteSummary[] {
  return list.filter((q) => q.status === 'won' && q.actualCost > 0);
}

export function budgetPrecision(list: QuoteSummary[]): BudgetPrecision | null {
  const ex = executed(list);
  if (ex.length === 0) return null;
  const n = ex.length;
  const avg = (f: (q: QuoteSummary) => number) => ex.reduce((s, q) => s + f(q), 0) / n;
  return {
    projects: n,
    avgCostDeviationPct: avg((q) => ((q.actualCost - q.budgetedCost) / (q.budgetedCost || 1)) * 100),
    avgBudgetMarginPct: avg((q) => marginPct(q.total, q.budgetedCost)),
    avgActualMarginPct: avg((q) => marginPct(saleOf(q), q.actualCost)),
  };
}

export function buildDashboard(list: QuoteSummary[], todayIso: string): Dashboard {
  const byStatus = Object.fromEntries(QUOTE_STATUSES.map((s) => [s, { count: 0, value: 0 }])) as Record<
    QuoteStatus,
    StatusBucket
  >;
  const units = new Map<BusinessUnit | null, UnitStats>();
  const totals: UnitStats = { unit: null, quoted: 0, won: 0, quotedCount: 0, wonCount: 0, successPct: 0 };
  const losses = new Map<string, number>();

  for (const q of list) {
    byStatus[q.status].count++;
    byStatus[q.status].value += q.total;
    const u = units.get(q.businessUnit) ?? {
      unit: q.businessUnit,
      quoted: 0,
      won: 0,
      quotedCount: 0,
      wonCount: 0,
      successPct: 0,
    };
    for (const acc of [u, totals]) {
      acc.quoted += q.total;
      acc.quotedCount++;
      if (q.status === 'won') {
        acc.won += q.total;
        acc.wonCount++;
      }
    }
    units.set(q.businessUnit, u);
    if (q.status === 'lost' && q.lossReason) losses.set(q.lossReason, (losses.get(q.lossReason) ?? 0) + 1);
  }
  for (const u of [...units.values(), totals]) {
    u.successPct = u.quotedCount > 0 ? (u.wonCount / u.quotedCount) * 100 : 0;
  }

  const decided = byStatus.won.count + byStatus.lost.count;
  // En ejecución: adjudicadas sin cerrar y, de las que están en negociación, las que ya tienen
  // costos registrados en la auditoría.
  const inExecution = list.filter(
    (q) =>
      !q.closedOn &&
      q.budgetedCost > 0 &&
      (q.status === 'won' || (q.status === 'negotiating' && q.actualCost > 0)),
  );
  const atRisk = inExecution
    .map((q) => {
      const sale = saleOf(q);
      return {
        id: q.id,
        number: q.number,
        label: q.projectName || q.clientName || q.number,
        consumedPct: (q.actualCost / (q.budgetedCost || 1)) * 100,
        sale,
        marginTodayPct: marginPct(sale, q.actualCost),
      };
    })
    .filter((p) => p.consumedPct >= 60)
    .sort((a, b) => a.marginTodayPct - b.marginTodayPct);

  return {
    totalQuotes: list.length,
    monthly: monthlyActivity(list, todayIso),
    unitMonth: unitMonthMatrix(list, todayIso),
    byStatus,
    closeRatePct: decided > 0 ? (byStatus.won.count / decided) * 100 : null,
    lossReasons: [...losses.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    byUnit: [...units.values()],
    totals,
    precision: budgetPrecision(list),
    inExecution: inExecution.length,
    atRisk,
    followUps: pendingFollowUps(list, todayIso),
  };
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Los últimos `count` meses terminando en el mes de `todayIso` (claves AAAA-MM, en orden). */
export function lastMonths(todayIso: string, count = 6): Array<{ key: string; label: string; year: number }> {
  const [y, m] = todayIso.split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (count - 1 - i), 1));
    return {
      key: d.toISOString().slice(0, 7),
      label: MONTH_LABELS[d.getUTCMonth()]!,
      year: d.getUTCFullYear(),
    };
  });
}

/** Valor cotizado y adjudicado por mes de emisión. */
export function monthlyActivity(list: QuoteSummary[], todayIso: string, count = 6): MonthBucket[] {
  const months = lastMonths(todayIso, count).map((mo) => ({ ...mo, quoted: 0, won: 0, count: 0 }));
  const byKey = new Map(months.map((mo) => [mo.key, mo]));
  for (const q of list) {
    const b = byKey.get(q.issueDate.slice(0, 7));
    if (!b) continue;
    b.quoted += q.total;
    b.count++;
    if (q.status === 'won') b.won += q.total;
  }
  return months;
}

/** Conteo y valor por unidad de negocio × mes (solo unidades con actividad en el periodo). */
export function unitMonthMatrix(list: QuoteSummary[], todayIso: string, count = 6): UnitMonthCell[] {
  const keys = new Set(lastMonths(todayIso, count).map((mo) => mo.key));
  const cells = new Map<string, UnitMonthCell>();
  for (const q of list) {
    const month = q.issueDate.slice(0, 7);
    if (!keys.has(month)) continue;
    const id = `${q.businessUnit ?? '-'}|${month}`;
    const c = cells.get(id) ?? { unit: q.businessUnit, month, count: 0, value: 0 };
    c.count++;
    c.value += q.total;
    cells.set(id, c);
  }
  return [...cells.values()];
}

/** Ofertas enviadas/en negociación cuyo seguimiento venció (o con más de 7 días sin seguimiento). */
export function pendingFollowUps(list: QuoteSummary[], todayIso: string): FollowUp[] {
  return list
    .filter((q) => q.status === 'sent' || q.status === 'negotiating')
    .map((q) => {
      const days = daysBetween(q.issueDate, todayIso);
      const due = q.nextFollowUp ? q.nextFollowUp <= todayIso : days > THRESHOLDS.followUpAfterDays;
      return { q, days, due };
    })
    .filter((x) => x.due)
    .sort((a, b) => (a.q.nextFollowUp ?? a.q.issueDate).localeCompare(b.q.nextFollowUp ?? b.q.issueDate))
    .map(({ q, days }) => ({
      id: q.id,
      number: q.number,
      clientName: q.clientName,
      projectName: q.projectName,
      daysSinceIssue: days,
      nextFollowUp: q.nextFollowUp,
    }));
}

export interface HistoricalRecommendation {
  projects: number;
  avgCostDeviationPct: number;
  avgActualMarginPct: number;
  advice: string | null;
}

/** Recomendación de precio según proyectos cerrados de la misma unidad de negocio. */
export function historicalRecommendation(
  list: QuoteSummary[],
  unit: BusinessUnit,
  excludeId?: string,
): HistoricalRecommendation | null {
  const p = budgetPrecision(list.filter((q) => q.businessUnit === unit && q.id !== excludeId));
  if (!p) return null;
  let advice: string | null = null;
  if (p.avgCostDeviationPct < -15) {
    advice =
      'Tus costos reales suelen quedar bastante por debajo de lo presupuestado en este tipo de proyecto — considera bajar el precio de referencia para ser más competitivo sin perder margen.';
  } else if (p.avgCostDeviationPct > 10) {
    advice =
      'Tus costos reales suelen superar lo presupuestado en este tipo de proyecto — considera subir el % de imprevistos o de M.O. para no quedarte corto.';
  }
  return {
    projects: p.projects,
    avgCostDeviationPct: p.avgCostDeviationPct,
    avgActualMarginPct: p.avgActualMarginPct,
    advice,
  };
}
