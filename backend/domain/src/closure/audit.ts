import { costLineTotal, staffMemberQuantity, staffMemberTotal } from '../pricing/labor';
import type { QuoteBreakdown, QuoteTotals } from '../pricing/engine';
import type { LineActual, QuoteDraft } from '../schemas';

/**
 * Auditoría del cierre: toda la cotización, línea por línea, con lo cotizado y lo que en
 * realidad se pagó. En Personal se registra lo que se le dio a cada cargo (abono, liquidación y
 * bonificaciones) y si ya se le pagó.
 */

export type WorkerPayStatus = 'unpaid' | 'pending' | 'paid' | 'overpaid';
export const WORKER_PAY_STATUS_LABELS: Record<WorkerPayStatus, string> = {
  unpaid: 'Sin pagos',
  pending: 'Pendiente',
  paid: 'Pagado',
  overpaid: 'Pagado de más',
};

export interface LinePayments {
  advance: number;
  settlement: number;
  bonus: number;
  /** Todo lo dado: abono + liquidación + bonificaciones. */
  paid: number;
  /** Lo que falta por pagar de lo cotizado (la bonificación es un pago adicional, no descuenta). */
  balance: number;
  status: WorkerPayStatus;
}

/** Estado de pago de un cargo de personal: lo cotizado frente a abono + liquidación. */
export function linePayments(
  quoted: number,
  a: Pick<LineActual, 'advance' | 'settlement' | 'bonus'> | undefined,
): LinePayments {
  const advance = a?.advance ?? 0;
  const settlement = a?.settlement ?? 0;
  const bonus = a?.bonus ?? 0;
  const balance = quoted - advance - settlement;
  let status: WorkerPayStatus;
  if (advance + settlement === 0) status = 'unpaid';
  else if (balance > 0.5) status = 'pending';
  else if (balance < -0.5) status = 'overpaid';
  else status = 'paid';
  return { advance, settlement, bonus, paid: advance + settlement + bonus, balance, status };
}

export type LineSection = 'items' | 'staff' | 'activities' | 'others' | 'overheads';
export const LINE_SECTION_LABELS: Record<LineSection, string> = {
  items: 'Ítems de la cotización',
  staff: 'Personal fijo',
  activities: 'Mano de obra por actividad',
  others: 'Otros costos del proyecto',
  overheads: 'Pólizas, impuestos y costos internos',
};

export interface LineAuditRow {
  key: string;
  section: LineSection;
  description: string;
  /** Cantidad y unidad cotizadas, en texto ("10 und", "2 personas · 15 días"). */
  quantity: string;
  /** Valor cotizado de la línea (costo). */
  quoted: number;
  /**
   * Precio final para comparar (null = sin registrar). En Personal solo cuando ya se pagó por
   * completo: mientras tenga saldo, el saldo no es un ahorro.
   */
  actual: number | null;
  /** Lo que ya se gastó en la línea (en Personal, todo lo dado aunque falte saldo). */
  spent: number;
  deviation: number | null;
  deviationPct: number | null;
  note: string;
  /** Solo en Personal: abono, liquidación, bonificaciones, saldo y estado. */
  payments?: LinePayments;
}

export interface LineAuditSection {
  section: LineSection;
  label: string;
  rows: LineAuditRow[];
  quoted: number;
  /** Suma de los precios finales registrados. */
  actual: number;
  /** Lo gastado hasta hoy en la sección. */
  spent: number;
  /** Cotizado de las líneas que ya tienen precio final (para comparar manzana con manzana). */
  quotedRecorded: number;
  recorded: number;
}

export interface LineAudit {
  sections: LineAuditSection[];
  quoted: number;
  actual: number;
  spent: number;
  quotedRecorded: number;
  recorded: number;
  total: number;
}

const fmtQty = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toLocaleString('es-CO', { maximumFractionDigits: 2 });

const OVERHEADS: Array<[key: string, label: string, pick: (t: QuoteTotals) => number]> = [
  ['policies', 'Pólizas', (t) => t.policies],
  ['taxes', 'Impuestos', (t) => t.taxes],
  ['financing', 'Financiamiento', (t) => t.financing],
  ['contingency', 'Imprevistos internos', (t) => t.contingency],
  ['admin', 'Administración interna', (t) => t.adminCost],
];

/** Claves de las líneas que existen hoy en la cotización (los valores de líneas borradas no cuentan). */
function currentKeys(draft: QuoteDraft): Set<string> {
  return new Set([
    ...draft.items.map((i) => `item:${i.id}`),
    ...draft.staff.map((m) => `staff:${m.id}`),
    ...draft.laborActivities.map((l) => `activity:${l.id}`),
    ...draft.otherCosts.map((l) => `other:${l.id}`),
    ...OVERHEADS.map(([k]) => `overhead:${k}`),
  ]);
}

/** Lo gastado según el comparativo: precios finales + todo lo dado al personal. */
export function lineAuditSpent(draft: QuoteDraft): number {
  const keys = currentKeys(draft);
  return Object.entries(draft.closure.lineActuals ?? {})
    .filter(([k]) => keys.has(k))
    .reduce(
      (s, [k, a]) => s + (k.startsWith('staff:') ? a.advance + a.settlement + a.bonus : (a.actual ?? 0)),
      0,
    );
}

/**
 * Espejo de toda la cotización para el cierre: cada ítem, cargo de personal, actividad, otro
 * costo y costo interno, con su valor cotizado (costo) y lo que en realidad se pagó al lado.
 * Los ítems se comparan por su costo propio (material + M.O. del ítem), sin la M.O. fija que se
 * les reparte, porque esa ya aparece en Personal y en M.O. por actividad.
 */
export function auditLines(draft: QuoteDraft, breakdown: QuoteBreakdown): LineAudit {
  const actuals = draft.closure.lineActuals ?? {};
  const row = (
    key: string,
    section: LineSection,
    description: string,
    quantity: string,
    quoted: number,
  ): LineAuditRow => {
    const a = actuals[key];
    let actual = a?.actual ?? null;
    let spent = actual ?? 0;
    let payments: LinePayments | undefined;
    if (section === 'staff') {
      payments = linePayments(quoted, a);
      actual = payments.status === 'paid' || payments.status === 'overpaid' ? payments.paid : null;
      spent = payments.paid;
    }
    const deviation = actual == null ? null : actual - quoted;
    return {
      key,
      section,
      description,
      quantity,
      quoted,
      actual,
      spent,
      deviation,
      deviationPct: deviation == null || quoted <= 0 ? null : (deviation / quoted) * 100,
      note: a?.note ?? '',
      payments,
    };
  };

  const items = draft.items
    .map((it, i) => ({ it, b: breakdown.items[i] }))
    .filter(({ it }) => it.description.trim() || it.quantity > 0)
    .map(({ it, b }) =>
      row(
        `item:${it.id}`,
        'items',
        it.description || '(sin descripción)',
        `${fmtQty(it.quantity)} ${it.unit}`.trim(),
        b ? (b.unitMaterialCost + b.unitLaborCost) * it.quantity : 0,
      ),
    );
  const staff = draft.staff.map((m) => {
    const n = staffMemberQuantity(m);
    return row(
      `staff:${m.id}`,
      'staff',
      m.role || '(sin cargo)',
      `${n} ${n === 1 ? 'persona' : 'personas'} · ${fmtQty(m.days)} días`,
      staffMemberTotal(m),
    );
  });
  const lines = (section: 'activities' | 'others', list: QuoteDraft['laborActivities']) =>
    list.map((l) =>
      row(
        `${section === 'activities' ? 'activity' : 'other'}:${l.id}`,
        section,
        l.concept || '(sin concepto)',
        fmtQty(l.quantity),
        costLineTotal(l),
      ),
    );
  const overheads = OVERHEADS.map(([k, label, pick]) =>
    row(`overhead:${k}`, 'overheads', label, '', pick(breakdown.totals)),
  ).filter((r) => r.quoted > 0 || r.actual != null);

  const sections: LineAuditSection[] = (
    [
      ['items', items],
      ['staff', staff],
      ['activities', lines('activities', draft.laborActivities)],
      ['others', lines('others', draft.otherCosts)],
      ['overheads', overheads],
    ] as Array<[LineSection, LineAuditRow[]]>
  )
    .filter(([, rows]) => rows.length > 0)
    .map(([section, rows]) => {
      const recordedRows = rows.filter((r) => r.actual != null);
      return {
        section,
        label: LINE_SECTION_LABELS[section],
        rows,
        quoted: rows.reduce((s, r) => s + r.quoted, 0),
        actual: recordedRows.reduce((s, r) => s + (r.actual ?? 0), 0),
        spent: rows.reduce((s, r) => s + r.spent, 0),
        quotedRecorded: recordedRows.reduce((s, r) => s + r.quoted, 0),
        recorded: recordedRows.length,
      };
    });

  const sum = (k: 'quoted' | 'actual' | 'spent' | 'quotedRecorded' | 'recorded') =>
    sections.reduce((s, x) => s + x[k], 0);
  return {
    sections,
    quoted: sum('quoted'),
    actual: sum('actual'),
    spent: sum('spent'),
    quotedRecorded: sum('quotedRecorded'),
    recorded: sum('recorded'),
    total: sections.reduce((s, x) => s + x.rows.length, 0),
  };
}
