import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import {
  apuParamsSchema,
  bidSchema,
  blankItem,
  type ApuLine,
  type BidWorkbookImport,
  type Pricing,
  type QuoteItem,
  type Supply,
  type Terms,
} from '@ggis/domain';

/**
 * Lee el libro de "Análisis de precios" (APU) de licitación — hojas PARAMETROS, INSUMOS, APU,
 * REVISION PRECIOS, AIU, LICIFY y ACLARACIONES — y lo convierte en los datos de una cotización.
 *
 * Usa los valores calculados que guardó Excel (no evalúa fórmulas) y ubica cada bloque por sus
 * títulos, no por celdas fijas, para tolerar filas agregadas o movidas.
 */

export type BidWorkbookResult = BidWorkbookImport;

type Sheet = XLSX.WorkSheet;

const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

function findSheet(wb: XLSX.WorkBook, ...names: string[]): Sheet | null {
  const wanted = names.map(norm);
  const name = wb.SheetNames.find((n) => wanted.includes(norm(n)));
  return name ? wb.Sheets[name]! : null;
}

function lastRow(ws: Sheet): number {
  return ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).e.r + 1 : 0;
}

const cell = (ws: Sheet, addr: string) => ws[addr] as XLSX.CellObject | undefined;
const val = (ws: Sheet, addr: string) => cell(ws, addr)?.v;
const num = (ws: Sheet, addr: string): number => {
  const v = val(ws, addr);
  const n =
    typeof v === 'number'
      ? v
      : Number(
          String(v ?? '')
            .replace(/[$\s.]/g, '')
            .replace(',', '.'),
        );
  return Number.isFinite(n) ? n : 0;
};
const str = (ws: Sheet, addr: string, max = 500) =>
  String(val(ws, addr) ?? '')
    .trim()
    .slice(0, max);

/** Primera fila (1-based) cuya columna `col` cumple el patrón. */
function findRow(ws: Sheet, col: string, pattern: RegExp, from = 1): number {
  for (let r = from; r <= lastRow(ws); r++) if (pattern.test(norm(val(ws, col + r)))) return r;
  return 0;
}

/** Valor de la columna B en la fila cuya etiqueta (col A) cumple el patrón. */
function paramByLabel(ws: Sheet, pattern: RegExp): number | null {
  const r = findRow(ws, 'A', pattern);
  return r ? num(ws, 'B' + r) : null;
}

const supplyType = (code: string, kind: string): Supply['type'] => {
  const k = norm(kind);
  if (k === 'mo' || /^mo/i.test(code)) return 'MO';
  if (/^eq/i.test(code)) return 'EQ';
  if (/^sv/i.test(code)) return 'SV';
  return 'MAT';
};
const priceType = (kind: string): Supply['priceType'] => {
  const k = norm(kind);
  if (k === 'usd') return 'USD';
  if (k === 'bd' || k.includes('lista')) return 'LIST';
  return 'COP';
};

export function readBidWorkbook(data: Buffer): BidWorkbookResult {
  const wb = XLSX.read(data, { type: 'buffer', cellFormula: true });
  const warnings: string[] = [];

  const shParams = findSheet(wb, 'PARAMETROS', 'PARÁMETROS');
  const shSupplies = findSheet(wb, 'INSUMOS');
  const shApu = findSheet(wb, 'APU');
  if (!shSupplies || !shApu) {
    throw new Error('El archivo no tiene las hojas INSUMOS y APU del análisis de precios.');
  }

  // ---------------- PARAMETROS
  let exchangeRate: number | null = null;
  const params = apuParamsSchema.parse({});
  let contractMonths: number | null = null;
  let fieldMonths: number | null = null;
  if (shParams) {
    exchangeRate = paramByLabel(shParams, /^trm/);
    const pct = (v: number | null) => (v === null ? null : v <= 1 ? v * 100 : v);
    params.importFactor = paramByLabel(shParams, /factor de importacion/) ?? params.importFactor;
    params.wastePct = pct(paramByLabel(shParams, /desperdicio/)) ?? params.wastePct;
    params.escalationFactor = paramByLabel(shParams, /escalamiento/) ?? params.escalationFactor;
    params.toolsPctOfLabor = pct(paramByLabel(shParams, /herramienta/)) ?? params.toolsPctOfLabor;
    contractMonths = paramByLabel(shParams, /plazo total/);
    fieldMonths = paramByLabel(shParams, /personal en campo/);
  } else {
    warnings.push('No se encontró la hoja PARAMETROS: se usan los parámetros por defecto.');
  }

  // ---------------- INSUMOS
  const supplies: Supply[] = [];
  const supplyIdByCode = new Map<string, string>();
  const supHeader = findRow(shSupplies, 'A', /^codigo$/);
  for (let r = (supHeader || 4) + 1; r <= lastRow(shSupplies); r++) {
    const code = str(shSupplies, 'A' + r, 20);
    if (!code) continue;
    const kind = str(shSupplies, 'E' + r);
    const source = str(shSupplies, 'G' + r, 300);
    const s: Supply = {
      id: randomUUID(),
      code,
      description: str(shSupplies, 'B' + r, 300),
      unit: str(shSupplies, 'C' + r, 20),
      type: supplyType(code, kind),
      baseValue: Math.max(0, num(shSupplies, 'D' + r)),
      priceType: priceType(kind),
      source,
      estimated: /estimad|verificar|cotizar/i.test(source),
    };
    supplies.push(s);
    supplyIdByCode.set(code.toUpperCase(), s.id);
  }

  // ---------------- APU
  const apuByItem = new Map<string, ApuLine[]>();
  const apuDescByItem = new Map<string, { description: string; unit: string }>();
  let current = '';
  const apuHeader = findRow(shApu, 'A', /^item$/);
  for (let r = (apuHeader || 4) + 1; r <= lastRow(shApu); r++) {
    const itemCode = str(shApu, 'A' + r, 20);
    const code = str(shApu, 'C' + r, 20);
    const kind = str(shApu, 'B' + r).toUpperCase();
    if (itemCode && !code) {
      current = itemCode;
      apuByItem.set(current, []);
      apuDescByItem.set(current, { description: str(shApu, 'D' + r), unit: str(shApu, 'E' + r, 20) });
      continue;
    }
    if (!current || !code || kind === 'HER') continue; // la herramienta se calcula con el parámetro
    const supplyId = supplyIdByCode.get(code.toUpperCase());
    if (!supplyId) {
      warnings.push(`APU ${current}: el insumo ${code} no está en la hoja INSUMOS, se omitió.`);
      continue;
    }
    apuByItem.get(current)!.push({
      id: randomUUID().slice(0, 12),
      supplyId,
      quantity: Math.max(0, num(shApu, 'F' + r)),
      yieldPerDay: Math.max(0, num(shApu, 'G' + r)),
      applyWaste: num(shApu, 'I' + r) > 0,
    });
  }

  // ---------------- REVISION PRECIOS (cantidades y precios del subcontratista)
  const items: QuoteItem[] = [];
  const shReview = findSheet(wb, 'REVISION PRECIOS', 'REVISIÓN PRECIOS');
  if (shReview) {
    const header = findRow(shReview, 'A', /^item$/);
    for (let r = (header || 4) + 1; r <= lastRow(shReview); r++) {
      const itemCode = str(shReview, 'A' + r, 20);
      if (!itemCode) continue;
      const sub = num(shReview, 'E' + r);
      items.push({
        ...blankItem(`${str(shReview, 'B' + r)}`, str(shReview, 'C' + r, 20)),
        quantity: Math.max(0, num(shReview, 'D' + r)),
        laborPct: 0,
        apu: apuByItem.get(itemCode) ?? null,
        subcontractorUnitPrice: sub > 0 ? sub : null,
      });
      if (!apuByItem.has(itemCode)) warnings.push(`Ítem ${itemCode}: no tiene APU en la hoja APU.`);
    }
  } else {
    warnings.push('No se encontró la hoja REVISION PRECIOS: los ítems se crean desde el APU con cantidad 0.');
    for (const [code, lines] of apuByItem) {
      const d = apuDescByItem.get(code)!;
      items.push({ ...blankItem(d.description, d.unit), laborPct: 0, apu: lines });
    }
  }

  // ---------------- AIU (administración desglosada, I, U y topes)
  const bid = bidSchema.parse({});
  if (contractMonths !== null) bid.contractMonths = contractMonths;
  if (fieldMonths !== null) bid.fieldMonths = fieldMonths;
  const aiu: Partial<Pricing['aiu']> = {};
  const shAiu = findSheet(wb, 'AIU');
  if (shAiu) {
    const asPct = (v: number) => (v <= 1 ? v * 100 : v);
    const a1 = findRow(shAiu, 'A', /^a\.1/);
    const a2 = findRow(shAiu, 'A', /^a\.2/);
    const a2End = findRow(shAiu, 'A', /^subtotal administracion/);
    const a3 = findRow(shAiu, 'A', /^a\.3/);
    const a3End = findRow(shAiu, 'A', /^subtotal otros indirectos/);
    if (a1 && a2) {
      for (let r = a1 + 1; r < a2; r++) {
        const role = str(shAiu, 'A' + r, 200);
        if (!role) continue;
        const months = cell(shAiu, 'D' + r);
        const formula = String(months?.f ?? '');
        const m = num(shAiu, 'D' + r);
        // Si la fórmula apunta al plazo del contrato (o el valor coincide), es "contrato"; si no, "campo".
        const period =
          /B\$?11\b/.test(formula) || (!formula && m === bid.contractMonths) ? 'contract' : 'field';
        bid.adminPersonnel.push({
          id: randomUUID().slice(0, 12),
          role,
          monthlyCost: num(shAiu, 'B' + r),
          dedicationPct: asPct(num(shAiu, 'C' + r)),
          period,
        });
      }
    }
    if (a2 && a2End) {
      for (let r = a2 + 1; r < a2End; r++) {
        const concept = str(shAiu, 'A' + r, 200);
        if (concept)
          bid.adminExpenses.push({ id: randomUUID().slice(0, 12), concept, value: num(shAiu, 'B' + r) });
      }
    }
    if (a3 && a3End) {
      for (let r = a3 + 1; r < a3End; r++) {
        const concept = str(shAiu, 'A' + r, 200);
        if (concept)
          bid.adminIndirects.push({
            id: randomUUID().slice(0, 12),
            concept,
            pct: asPct(num(shAiu, 'C' + r)),
          });
      }
    }
    if (bid.adminPersonnel.length || bid.adminExpenses.length || bid.adminIndirects.length)
      bid.adminMode = 'breakdown';
    const imp = findRow(shAiu, 'A', /^% imprevistos/);
    const util = findRow(shAiu, 'A', /^% utilidad/);
    if (imp) aiu.contingencyPct = asPct(num(shAiu, 'E' + imp));
    if (util) aiu.profitPct = asPct(num(shAiu, 'E' + util));
    const capRow = (re: RegExp) => findRow(shAiu, 'A', re);
    const mat = capRow(/^materiales y equipos/);
    const mo = capRow(/^mano de obra/);
    const adm = capRow(/^administracion de obra/);
    if (mat || mo || adm) {
      bid.caps.enabled = true;
      if (mat) bid.caps.materialsMaxPct = asPct(num(shAiu, 'D' + mat)) || bid.caps.materialsMaxPct;
      if (mo) bid.caps.laborMaxPct = asPct(num(shAiu, 'D' + mo)) || bid.caps.laborMaxPct;
      if (adm) bid.caps.adminMaxPct = asPct(num(shAiu, 'D' + adm)) || bid.caps.adminMaxPct;
    }
  }

  // ---------------- LICIFY (condiciones comerciales)
  const terms: Partial<Terms> = {};
  let validDays: number | null = null;
  const shLicify = findSheet(wb, 'LICIFY');
  if (shLicify) {
    const byLabel = (re: RegExp) => {
      const r = findRow(shLicify, 'A', re);
      return r ? val(shLicify, 'B' + r) : undefined;
    };
    const pctOf = (v: unknown) => (typeof v === 'number' ? (v <= 1 ? v * 100 : v) : undefined);
    const delivery = byLabel(/^tiempo de entrega/);
    if (delivery) terms.installationTime = String(delivery).slice(0, 200);
    const validity = byLabel(/^validez/);
    const vd = Number(String(validity ?? '').match(/\d+/)?.[0]);
    if (vd) validDays = vd;
    const warranty = byLabel(/^garantia/);
    if (warranty) {
      const r = findRow(shLicify, 'A', /^garantia/);
      terms.warranty = `${warranty}. ${str(shLicify, 'C' + r, 1000)}`.trim().slice(0, 5000);
    }
    const adv = pctOf(byLabel(/^anticipo/));
    const prog = pctOf(byLabel(/^cortes de obra/));
    const del = pctOf(byLabel(/^contra entrega/));
    if (adv !== undefined) terms.advancePct = adv;
    if (prog !== undefined) terms.progressPct = prog;
    if (del !== undefined) terms.onDeliveryPct = del;
  }

  // ---------------- ACLARACIONES
  const shClar = findSheet(wb, 'ACLARACIONES');
  if (shClar) {
    const header = findRow(shClar, 'B', /^tema$/);
    for (let r = (header || 3) + 1; r <= lastRow(shClar); r++) {
      const topic = str(shClar, 'B' + r, 200);
      if (!topic) continue;
      bid.clarifications.push({
        id: randomUUID().slice(0, 12),
        topic,
        observation: str(shClar, 'C' + r, 2000),
        impact: str(shClar, 'D' + r, 1000),
      });
    }
  }

  return {
    exchangeRate,
    apuParams: params,
    supplies,
    items,
    aiu,
    bid,
    terms,
    validDays,
    summary: {
      supplies: supplies.length,
      estimatedSupplies: supplies.filter((s) => s.estimated).length,
      items: items.length,
      itemsWithApu: items.filter((i) => i.apu?.length).length,
      itemsWithSubcontractorPrice: items.filter((i) => i.subcontractorUnitPrice !== null).length,
      clarifications: bid.clarifications.length,
    },
    warnings,
  };
}
