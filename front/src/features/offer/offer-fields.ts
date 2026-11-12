import { computeQuote, formatCop, type QuoteDraft } from '@ggis/domain';
import {
  offerTextValue,
  OFFER_TEXT_FIELDS,
  type OfferTextKey,
  type UnitProposalContent,
} from './proposal-content';

/**
 * Sincronización oferta → cotizador. Cada texto de la oferta que sale de un campo del cotizador
 * lleva `data-field="<clave>"`. Al guardar lo editado sobre la oferta, los cambios en esos bloques
 * se escriben en la cotización (cliente, condiciones, ítems, precios, textos de la oferta…); el resto
 * queda como edición solo de la oferta.
 *
 * Claves: `client:name`, `research:address`, `terms:scope`, `text:needTitle`,
 * `item:<id>:description|notes|quantity|unit|salePrice` y `pricing:total`.
 *
 * Precios: si cambia el precio unitario de un ítem, los demás conservan el suyo y el total sube o
 * baja; si se escribe el total, se calcula el margen necesario para llegar a él.
 */
export const FIELD_ATTR = 'data-field';

/** Props para marcar un bloque de la oferta con su campo del cotizador. */
export const field = (key: string) => ({ [FIELD_ATTR]: key });

const BLOCK = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'TR', 'H1', 'H2', 'H3', 'H4']);

/** Texto visible de un bloque editado, con saltos de línea (br, párrafos y viñetas). */
export function elementText(el: Element): string {
  let out = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? '';
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.tagName === 'BR') {
      out += '\n';
      return;
    }
    const block = BLOCK.has(node.tagName);
    if (block && out && !out.endsWith('\n')) out += '\n';
    node.childNodes.forEach(walk);
    if (block && !out.endsWith('\n')) out += '\n';
  };
  el.childNodes.forEach(walk);
  return out
    .split('\n')
    .map((l) => l.replace(/[ \t\xa0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Texto de cada campo marcado (si un campo sale en varios trozos, se unen en orden). */
export function collectFields(root: Element): Map<string, string> {
  const map = new Map<string, string[]>();
  root.querySelectorAll(`[${FIELD_ATTR}]`).forEach((el) => {
    const key = el.getAttribute(FIELD_ATTR)!;
    map.set(key, [...(map.get(key) ?? []), elementText(el)]);
  });
  return new Map([...map].map(([k, parts]) => [k, parts.join('\n')]));
}

/** Campos cuyo texto cambió entre la oferta generada y la editada. */
export function fieldChanges(base: Element, edited: Element): Array<[string, string]> {
  const before = collectFields(base);
  const after = collectFields(edited);
  return [...after].filter(([k, v]) => before.has(k) && before.get(k) !== v);
}

/**
 * Aplica precios unitarios (fijados en el ítem) y/o el total deseado ajustando el margen:
 * el subtotal objetivo = subtotal actual + lo que cambian los ítems editados, o el que da el total
 * escrito; el margen sale de costo total ÷ subtotal objetivo. Así los demás ítems conservan su precio.
 */
function applyPrices(
  draft: QuoteDraft,
  prices: Array<{ id: string; price: number }>,
  total: number | null,
  result: FieldSyncResult,
): void {
  const before = computeQuote(draft);
  let target = before.totals.subtotal;
  for (const { id, price } of prices) {
    const item = draft.items.find((i) => i.id === id)!;
    const old = before.items.find((b) => b.id === id)?.saleUnitPrice ?? 0;
    target += (price - old) * item.quantity;
    item.salePriceOverride = price > 0 ? price : null;
  }
  if (total !== null) {
    if (before.totals.subtotal <= 0) {
      result.errors.push('No se puede fijar el total: la oferta no tiene ítems con precio.');
      return;
    }
    // IVA o AIU son porcentajes del subtotal: total = subtotal × k.
    target = total / (before.totals.total / before.totals.subtotal);
  }
  const cost = before.totals.totalCost;
  if (target <= cost) {
    result.errors.push(
      `Con ese valor la oferta queda por debajo del costo (${formatCop(cost)} antes de IVA/AIU); no se cambió el margen.`,
    );
    return;
  }
  draft.pricing.marginPct = Math.min(95, Math.round((1 - cost / target) * 1_000_000) / 10_000);
  const after = computeQuote(draft);
  result.updated.unshift(
    `Margen ajustado a ${draft.pricing.marginPct.toLocaleString('es-CO', { maximumFractionDigits: 2 })}% · total ${formatCop(after.totals.total)}`,
  );
}

/** "$1.234.567" o "1.234,5" → número (formato colombiano). null si no se entiende. */
export function parseNumber(text: string): number | null {
  const clean = text.replace(/[^\d,.-]/g, '');
  if (!/\d/.test(clean)) return null;
  const normalized = clean.includes(',')
    ? clean.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(clean)
      ? clean.replace(/\./g, '')
      : clean;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

const LIMITS: Record<string, number> = {
  'client:name': 200,
  'client:project': 300,
  'client:city': 120,
  'research:address': 300,
  'research:projectSite': 300,
  'research:proposalText': 3_000,
  'terms:deliveryNational': 200,
  'terms:deliveryImport': 200,
  'terms:installationTime': 200,
  'terms:scope': 10_000,
  'terms:warranty': 5_000,
  'terms:exclusions': 5_000,
  'terms:generalConditions': 5_000,
  'terms:paymentNote': 2_000,
};

export interface FieldSyncResult {
  /** Descripción legible de lo que se actualizó en la cotización. */
  updated: string[];
  /** Valores que no se pudieron interpretar (p. ej. un precio con letras). */
  errors: string[];
}

const TEXT_KEYS = new Set<string>(OFFER_TEXT_FIELDS.map((f) => f.key));
const TEXT_LABELS = new Map(OFFER_TEXT_FIELDS.map((f) => [f.key as string, `${f.page} · ${f.label}`]));

/**
 * Escribe en la cotización los cambios hechos sobre la oferta. `template` son los textos de la
 * plantilla: si un texto vuelve a quedar igual a la plantilla, se quita el cambio guardado.
 */
export function applyFieldChanges(
  draft: QuoteDraft,
  changes: Array<[string, string]>,
  template: UnitProposalContent,
): FieldSyncResult {
  const result: FieldSyncResult = { updated: [], errors: [] };
  draft.offerTexts ??= {};
  // Los precios y el total van al final: se calculan sobre la cotización ya actualizada.
  const prices: Array<{ id: string; price: number }> = [];
  let total: number | null = null;
  // Las notas antes que la descripción: las líneas extra de la descripción se suman a las notas.
  const ordered = [...changes].sort(
    ([a], [b]) => Number(b.endsWith(':notes')) - Number(a.endsWith(':notes')),
  );
  for (const [key, raw] of ordered) {
    const [scope, name, prop] = key.split(':') as [string, string, string | undefined];
    const text = raw.slice(0, LIMITS[key] ?? 5_000);
    if (scope === 'client' && (name === 'name' || name === 'project' || name === 'city')) {
      draft.client[name] = text.replace(/\n+/g, ' ');
      result.updated.push(
        `Cliente · ${name === 'name' ? 'nombre' : name === 'project' ? 'proyecto' : 'ciudad'}`,
      );
    } else if (scope === 'research' && draft.research) {
      if (name === 'address' || name === 'projectSite' || name === 'proposalText') {
        draft.research[name] = name === 'proposalText' ? text : text.replace(/\n+/g, ' ');
        result.updated.push(
          `Investigación · ${name === 'proposalText' ? 'texto para la oferta' : name === 'address' ? 'dirección' : 'sitio del proyecto'}`,
        );
      }
    } else if (
      scope === 'terms' &&
      name in draft.terms &&
      typeof draft.terms[name as keyof typeof draft.terms] === 'string'
    ) {
      (draft.terms as Record<string, unknown>)[name] = text;
      result.updated.push('Condiciones de la oferta');
    } else if (scope === 'text' && TEXT_KEYS.has(name)) {
      const k = name as OfferTextKey;
      if (text === offerTextValue(template, k)) delete draft.offerTexts[k];
      else draft.offerTexts[k] = text;
      result.updated.push(`Textos de la oferta · ${TEXT_LABELS.get(k)}`);
    } else if (scope === 'item') {
      const item = draft.items.find((i) => i.id === name);
      if (!item) continue;
      const label = item.description.slice(0, 40) || 'ítem';
      if (prop === 'description') {
        const [first = '', ...rest] = text.split('\n');
        item.description = first.trim().slice(0, 500);
        const extra = rest.join('\n').trim();
        if (extra) item.notes = [extra, item.notes].filter(Boolean).join('\n').slice(0, 3_000);
        result.updated.push(`Ítem «${label}» · descripción`);
      } else if (prop === 'notes') {
        item.notes = text.slice(0, 3_000);
        result.updated.push(`Ítem «${label}» · detalle`);
      } else if (prop === 'unit') {
        item.unit = text.replace(/\n+/g, ' ').slice(0, 20);
        result.updated.push(`Ítem «${label}» · unidad`);
      } else if (prop === 'quantity' || prop === 'salePrice') {
        const n = parseNumber(text);
        if (n === null || n < 0) {
          result.errors.push(
            `Ítem «${label}»: «${text}» no es un ${prop === 'quantity' ? 'número' : 'precio'} válido.`,
          );
        } else if (prop === 'quantity') {
          item.quantity = n;
          result.updated.push(`Ítem «${label}» · cantidad`);
        } else {
          prices.push({ id: item.id, price: Math.round(n) });
          result.updated.push(`Ítem «${label}» · precio unitario de venta`);
        }
      }
    } else if (scope === 'pricing' && name === 'total') {
      const n = parseNumber(raw);
      if (n === null || n <= 0) result.errors.push(`«${raw}» no es un total válido.`);
      else total = n;
    }
  }
  if (prices.length || total !== null) applyPrices(draft, prices, total, result);
  result.updated = [...new Set(result.updated)];
  return result;
}
