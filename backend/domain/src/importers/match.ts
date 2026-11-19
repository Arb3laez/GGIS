import type { Currency } from '../constants';
import type { ImportedRow } from '../schemas';

/**
 * Asociación de precios: relaciona las líneas de una cotización de proveedor con los ítems que
 * ya tiene la cotización (normalmente la lista del cliente), en vez de agregarlas como ítems
 * nuevos. Es puro: recibe las dos listas y devuelve qué línea va a qué ítem, el precio que
 * resulta y lo que no se pudo relacionar.
 *
 * Relaciones que contempla:
 * - direct: una línea → un ítem.
 * - shared: una línea → varios ítems (el proveedor agrupó cantidades: 83 sirenas = 55 + 28).
 * - component: varias líneas → un ítem; sus precios se suman (detector + base, panel + módulo).
 */

export interface MatchTargetItem {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  group?: string | null;
  clientRef?: string | null;
}

export type MatchLinkKind = 'direct' | 'shared' | 'component';

export interface MatchLink {
  /** Índice de la línea del proveedor. */
  row: number;
  itemId: string;
  kind: MatchLinkKind;
  /** Unidades de la línea por cada unidad del ítem. */
  factor: number;
}

export type ItemMatchStatus = 'ok' | 'review' | 'none';

export interface ItemPriceMatch {
  itemId: string;
  links: MatchLink[];
  /** Costo unitario que resulta de las líneas asociadas (suma de componentes). */
  unitPrice: number;
  currency: Currency;
  status: ItemMatchStatus;
  warnings: string[];
}

export interface UnmatchedRow {
  row: number;
  reason: string;
}

export interface PriceMatchResult {
  method: 'ai' | 'rules';
  items: ItemPriceMatch[];
  unmatchedRows: UnmatchedRow[];
  message: string;
}

// ---------------------------------------------------------------- Normalización

/** Conceptos del negocio (detección de incendio, canalización…) a los que se reducen los textos. */
const PHRASES: Array<[RegExp, string]> = [
  // Menciones de compatibilidad ("para paneles VS") no describen el equipo.
  [/\b(para|compatible con|con) (los |las |el |la )?(panel\w*|central\w*)( \w{1,4}\b)?/g, ' '],
  [/alarmas? de humo|detector(es)? de humo autonom\w*|autonom\w*|\d+ pilas|pilas alcalinas/g, ' smokealarm '],
  [/doble tecnolog\w*|humo y calor|multisensor\w*|termovelocimetric\w*|fototermic\w*/g, ' dualdetector '],
  [/detector(es)? (de )?humo|humo (optico|fotoelectric\w*)|smoke detector/g, ' smokedetector '],
  [/bases? (para |de )?(los )?detector\w*|bases? estandar|detector base/g, ' basepart '],
  [/modulos? de expansion\w*|expansion\w*|\bslc\b/g, ' expansionpart '],
  [/fuentes? (de )?(poder|alimentacion)|power supply|fuentes?\b/g, ' psu '],
  [/estacion(es)? manual(es)?|pull station|avisador(es)? manual(es)?/g, ' pullstation '],
  [/sirenas?|bocinas?|\bhorn\w*/g, ' horn '],
  [/estrob\w*|strobe\w*/g, ' strobe '],
  [/panel\w*|centrales?\b|central de|\bfacp\b|bucles?|lazos?\b|\bloops?\b/g, ' panel '],
  [/modulos?\b/g, ' module '],
  [/entradas?\b|monitor\w*/g, ' input '],
  [/salidas?\b|\brele\w*/g, ' output '],
  [/tuberias?|tubos?\b/g, ' pipe '],
  [/curvas?\b|codos?\b/g, ' elbow '],
  [/adaptador\w*|terminal\w*/g, ' adapter '],
  [/cielo|techo|ceiling/g, ' ceiling '],
  [/pared|muro|\bwall\b/g, ' wall '],
  [/\bnacs?\b/g, ' nac '],
];

const CORE = new Set([
  'smokealarm',
  'dualdetector',
  'smokedetector',
  'basepart',
  'expansionpart',
  'psu',
  'pullstation',
  'horn',
  'strobe',
  'panel',
  'module',
  'input',
  'output',
  'pipe',
  'elbow',
  'adapter',
  'nac',
]);

/** Piezas que no se cotizan solas: se suman al ítem del equipo principal. */
const ACCESSORY_HOSTS: Record<string, string[]> = {
  basepart: ['smokedetector', 'dualdetector'],
  expansionpart: ['panel'],
};

const STOP = new Set(
  'de del la el los las para con y en a o por un una und unidad sdi tl ul cd mts mt ml incluido incluida tipo color rojo roja red blanco gris serie listado ref'.split(
    ' ',
  ),
);

interface Profile {
  core: Set<string>;
  tokens: Set<string>;
  material: 'pvc' | 'emt' | null;
  diameter: string | null;
  group: string;
}

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const normGroup = (g?: string | null) =>
  g
    ? strip(g)
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
    : '';

function profile(description: string, group?: string | null): Profile {
  let t = ` ${strip(description)} `;
  const material = /\bemt\b/.test(t) ? 'emt' : /pvc|conduit/.test(t) ? 'pvc' : null;
  const dm = t.match(/(\d+)\s*\/\s*(\d+)/);
  const diameter = dm ? `${dm[1]}/${dm[2]}` : null;
  t = t
    .replace(/(\d+)\s*\/\s*(\d+)\s*("|”|pulg\w*)?/g, ' ')
    .replace(/[øØ"”'´]/g, ' ')
    .replace(/\bemt\b|pvc\w*|conduit\w*/g, ' ');
  for (const [re, rep] of PHRASES) t = t.replace(re, rep);
  const tokens = new Set(
    t.split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w) && !/^\d/.test(w)),
  );
  const core = new Set([...tokens].filter((w) => CORE.has(w)));
  return { core, tokens, material, diameter, group: normGroup(group) };
}

/** Parecido de textos 0..1: cubre lo que pide el ítem (60 %) y lo que dice la línea (40 %). */
function textScore(item: Profile, row: Profile): number {
  const a = item.core.size ? item.core : item.tokens;
  const b = item.core.size ? row.core : row.tokens;
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return 0.6 * (inter / a.size) + 0.4 * (inter / b.size);
}

/** Cantidades equivalentes (el proveedor redondea: 398 ≈ 398,18). */
export function sameQuantity(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(0.5, 0.01 * Math.max(a, b));
}

const groupRelation = (a: Profile, b: Profile) => (!a.group || !b.group ? 0 : a.group === b.group ? 1 : -1);

const MIN_TEXT = 0.5;

// ---------------------------------------------------------------- Asociación por reglas

interface Candidate {
  row: number;
  itemIds: string[];
  score: number;
}

/**
 * Propone las relaciones con reglas: parecido de conceptos, cantidades, grupo (torre), material
 * y diámetro. Asigna de mayor a menor puntaje; cada línea y cada ítem se usan una sola vez como
 * equipo principal. Al final cuelga los accesorios (bases, módulos de expansión) de su equipo.
 */
export function proposeLinks(items: MatchTargetItem[], rows: ImportedRow[]): MatchLink[] {
  const ip = items.map((i) => profile(i.description, i.group));
  const rp = rows.map((r) => profile(`${r.description} ${r.reference ?? ''}`, r.group));

  const pairScore = (ii: number, ri: number): number | null => {
    const t = textScore(ip[ii]!, rp[ri]!);
    if (t < MIN_TEXT) return null;
    const g = groupRelation(ip[ii]!, rp[ri]!);
    let s = t + 0.15 * g;
    if (g < 0) s -= 0.25;
    const mi = ip[ii]!.material;
    const mr = rp[ri]!.material;
    if (mi && mr) s += mi === mr ? 0.1 : -0.3;
    const di = ip[ii]!.diameter;
    const dr = rp[ri]!.diameter;
    if (di && dr && di !== dr) s -= 0.3;
    return s;
  };

  const isAccessory = (ri: number) => Object.keys(ACCESSORY_HOSTS).some((k) => rp[ri]!.core.has(k));

  const candidates: Candidate[] = [];
  rows.forEach((row, ri) => {
    if (isAccessory(ri)) return;
    const scored: Array<{ ii: number; s: number }> = [];
    items.forEach((item, ii) => {
      const s = pairScore(ii, ri);
      if (s === null) return;
      scored.push({ ii, s });
      candidates.push({
        row: ri,
        itemIds: [item.id],
        score: s + (sameQuantity(row.quantity, item.quantity) ? 0.35 : 0),
      });
    });
    // Reparto: la cantidad de la línea es la suma de 2 o 3 ítems parecidos.
    const pool = scored
      .filter((c) => c.s >= 0.6)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8);
    for (let a = 0; a < pool.length; a++)
      for (let b = a + 1; b < pool.length; b++) {
        const pair = [pool[a]!, pool[b]!];
        const tryCombo = (combo: typeof pair) => {
          const total = combo.reduce((acc, c) => acc + items[c.ii]!.quantity, 0);
          if (!sameQuantity(total, row.quantity)) return;
          if (combo.some((c) => sameQuantity(items[c.ii]!.quantity, row.quantity))) return;
          const avg = combo.reduce((acc, c) => acc + c.s, 0) / combo.length;
          candidates.push({ row: ri, itemIds: combo.map((c) => items[c.ii]!.id), score: avg + 0.35 });
        };
        tryCombo(pair);
        for (let c = b + 1; c < pool.length; c++) tryCombo([...pair, pool[c]!]);
      }
  });

  // Mayor puntaje primero; en empate, se respeta el orden de la lista (ítem y línea).
  const order = new Map(items.map((i, idx) => [i.id, idx]));
  candidates.sort(
    (a, b) => b.score - a.score || order.get(a.itemIds[0]!)! - order.get(b.itemIds[0]!)! || a.row - b.row,
  );

  const usedRows = new Set<number>();
  const usedItems = new Set<string>();
  const links: MatchLink[] = [];
  for (const c of candidates) {
    if (usedRows.has(c.row) || c.itemIds.some((id) => usedItems.has(id))) continue;
    usedRows.add(c.row);
    for (const id of c.itemIds) {
      usedItems.add(id);
      links.push({ row: c.row, itemId: id, kind: c.itemIds.length > 1 ? 'shared' : 'direct', factor: 1 });
    }
  }

  // Accesorios: al ítem del equipo que los lleva, mismo grupo y misma cantidad de preferencia.
  rows.forEach((row, ri) => {
    if (!isAccessory(ri)) return;
    const kinds = Object.keys(ACCESSORY_HOSTS).filter((k) => rp[ri]!.core.has(k));
    const hosts = new Set(kinds.flatMap((k) => ACCESSORY_HOSTS[k]!));
    let bestId: string | null = null;
    let bestScore = -Infinity;
    for (let ii = 0; ii < items.length; ii++) {
      const item = items[ii]!;
      if (![...ip[ii]!.core].some((w) => hosts.has(w))) continue;
      const g = groupRelation(ip[ii]!, rp[ri]!);
      if (g < 0) continue;
      const s = g + (sameQuantity(item.quantity, row.quantity) ? 2 : 0) + (usedItems.has(item.id) ? 0.5 : 0);
      if (s > bestScore) {
        bestScore = s;
        bestId = item.id;
      }
    }
    if (bestId) links.push({ row: ri, itemId: bestId, kind: 'component', factor: 1 });
  });

  return links;
}

// ---------------------------------------------------------------- Evaluación

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ','));
const PIPE_LENGTH = /(\d+(?:[.,]\d+)?)\s*(m|mt|mts|metros)\b/i;

/**
 * Calcula el precio de cada ítem con las relaciones dadas (de la IA o de las reglas) y revisa
 * cantidades, material, moneda y lo que quedó sin relacionar.
 */
export function evaluateLinks(
  items: MatchTargetItem[],
  rows: ImportedRow[],
  rawLinks: MatchLink[],
  method: 'ai' | 'rules',
): PriceMatchResult {
  const ids = new Set(items.map((i) => i.id));
  const seen = new Set<string>();
  const links = rawLinks.filter((l) => {
    const key = `${l.row}:${l.itemId}`;
    if (!ids.has(l.itemId) || l.row < 0 || l.row >= rows.length || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const byRow = new Map<number, MatchLink[]>();
  for (const l of links) byRow.set(l.row, [...(byRow.get(l.row) ?? []), l]);

  const ip = new Map(items.map((i) => [i.id, profile(i.description, i.group)]));
  const label = (it: MatchTargetItem) => (it.clientRef ? `ítem ${it.clientRef}` : `"${it.description}"`);

  const result: ItemPriceMatch[] = items.map((item) => {
    const own = links.filter((l) => l.itemId === item.id);
    if (!own.length) {
      return { itemId: item.id, links: [], unitPrice: 0, currency: 'COP', status: 'none', warnings: [] };
    }
    const warnings: string[] = [];
    const currencies = new Set(own.map((l) => rows[l.row]!.currency));
    const currency = rows[own[0]!.row]!.currency;
    if (currencies.size > 1) warnings.push('Las líneas asociadas vienen en monedas distintas (COP y USD).');
    const unitPrice = own.reduce((acc, l) => acc + rows[l.row]!.unitPrice * l.factor, 0);
    const iprof = ip.get(item.id)!;

    const mains = own.filter((l) => l.kind !== 'component');
    if (!mains.length) {
      warnings.push(
        'Solo se encontró el accesorio (p. ej. la base): falta el equipo principal en la cotización del proveedor.',
      );
    }
    for (const l of own) {
      const row = rows[l.row]!;
      const rprof = profile(row.description, row.group);
      // Cantidad: en un reparto se compara contra la suma de los ítems que comparten la línea.
      const sharers = l.kind === 'shared' ? (byRow.get(l.row) ?? []).filter((x) => x.kind === 'shared') : [l];
      const expected = sharers.reduce(
        (acc, x) => acc + (items.find((i) => i.id === x.itemId)?.quantity ?? 0) * x.factor,
        0,
      );
      if (expected > 0 && !sameQuantity(row.quantity, expected)) {
        const ratio = row.quantity / expected;
        const comma = Math.abs(ratio - 10) < 0.2 || Math.abs(ratio - 0.1) < 0.002;
        warnings.push(
          `Cantidad distinta: el proveedor cotizó ${fmtQty(row.quantity)} y ${l.kind === 'shared' ? 'los ítems suman' : 'el Excel pide'} ${fmtQty(expected)}${comma ? ' (posible error de coma)' : ''}.`,
        );
      }
      if (l.kind === 'shared' && sharers.length > 1) {
        const others = sharers
          .filter((x) => x.itemId !== item.id)
          .map((x) => items.find((i) => i.id === x.itemId))
          .filter((x): x is MatchTargetItem => !!x)
          .map(label);
        if (others.length)
          warnings.push(`Precio compartido con ${others.join(', ')} (misma línea del proveedor).`);
      }
      if (iprof.material && rprof.material && iprof.material !== rprof.material) {
        warnings.push(
          `Material distinto: el Excel pide ${iprof.material.toUpperCase()} y el proveedor cotizó ${rprof.material.toUpperCase()}.`,
        );
      }
      if (iprof.diameter && rprof.diameter && iprof.diameter !== rprof.diameter) {
        warnings.push(
          `Diámetro distinto: el Excel pide ${iprof.diameter}" y el proveedor cotizó ${rprof.diameter}".`,
        );
      }
      const len = row.description.match(PIPE_LENGTH);
      if (iprof.core.has('pipe') && len && row.unit.toUpperCase() !== 'ML') {
        warnings.push(
          `El proveedor cotiza por tubo de ${len[1]} m. Si la cantidad del Excel está en metros, se necesitan ${fmtQty(Math.ceil(item.quantity / Number(len[1]!.replace(',', '.'))))} tubos, no ${fmtQty(row.quantity)}.`,
        );
      }
    }
    return {
      itemId: item.id,
      links: own,
      unitPrice,
      currency,
      status: warnings.length ? 'review' : 'ok',
      warnings,
    };
  });

  const linkedRows = new Set(links.map((l) => l.row));
  const rowProfiles = rows.map((r) => profile(r.description, r.group));
  const unmatchedRows: UnmatchedRow[] = [];
  rows.forEach((row, ri) => {
    if (linkedRows.has(ri) || row.unitPrice <= 0) return;
    let best: MatchTargetItem | null = null;
    let bestScore = 0;
    for (const item of items) {
      const s = textScore(ip.get(item.id)!, rowProfiles[ri]!);
      if (s > bestScore) {
        bestScore = s;
        best = item;
      }
    }
    unmatchedRows.push({
      row: ri,
      reason:
        best && bestScore >= MIN_TEXT
          ? `Se parece a ${label(best)}, pero ese ítem ya quedó con otra línea o la cantidad/grupo no coincide.`
          : 'No se identificó ningún ítem del Excel que corresponda a esta línea.',
    });
  });

  const priced = result.filter((r) => r.status !== 'none').length;
  const review = result.filter((r) => r.status === 'review').length;
  const parts = [`${priced} de ${items.length} ítems quedaron con precio`];
  if (review) parts.push(`${review} para revisar`);
  if (unmatchedRows.length) parts.push(`${unmatchedRows.length} líneas del proveedor sin relacionar`);
  return { method, items: result, unmatchedRows, message: `${parts.join(' · ')}.` };
}

/** Asociación completa con reglas (sin IA). */
export function matchPrices(items: MatchTargetItem[], rows: ImportedRow[]): PriceMatchResult {
  return evaluateLinks(items, rows, proposeLinks(items, rows), 'rules');
}
