import DOMPurify from 'dompurify';

/**
 * Cambios de texto hechos a mano sobre la oferta. No se guarda una foto fija del documento: se
 * guarda cada bloque cambiado (su texto original y su nuevo contenido) y se vuelve a aplicar sobre
 * la oferta recién armada desde la cotización. Así, si cambia el precio o los ítems, la oferta se
 * actualiza y las notas escritas a mano se conservan.
 */
export interface OfferEdit {
  /** Etiqueta del bloque (P, TD, DIV…). */
  tag: string;
  /** Texto original del bloque en la oferta generada (sin espacios repetidos). */
  from: string;
  /** Contenido nuevo del bloque (HTML limpio). */
  html: string;
}

export const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

export const cleanHtml = (html: string) =>
  DOMPurify.sanitize(html, { FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'link', 'meta'] });

/** Quita la envoltura que agrega la vista de la oferta editada (div con display: contents). */
export function unwrapDoc(root: HTMLElement): HTMLElement {
  const only = root.children.length === 1 ? root.children[0] : null;
  return only instanceof HTMLElement &&
    only.tagName === 'DIV' &&
    /display:\s*contents/.test(only.getAttribute('style') ?? '')
    ? only
    : root;
}

/** Documento suelto (no se muestra) para comparar y aplicar cambios sin tocar la página. */
export function parseFragment(html: string): HTMLElement {
  const root = document.implementation.createHTMLDocument('').createElement('div');
  root.innerHTML = html;
  return root;
}

const directText = (el: Element) =>
  norm(
    [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join(' '),
  );
const childTags = (el: Element) => [...el.children].map((c) => c.tagName).join(',');

/** Solo cambió un valor en dinero o una cifra suelta (p. ej. un precio que se recalculó). */
const onlyNumbersChanged = (a: string, b: string) => {
  const strip = (s: string) => s.replace(/[\d$.,%\s-]/g, '');
  return a !== b && strip(a) === strip(b) && (a.includes('$') || strip(a) === '');
};

/**
 * Compara la oferta generada (`base`) con la editada (`edited`), que nacen iguales. Recorre ambos
 * árboles a la par y registra el bloque más pequeño cuyo contenido propio cambió (texto directo o
 * estructura de hijos); dentro de un bloque registrado no se sigue bajando.
 * `ignoreNumberChanges` sirve para convertir ofertas editadas antiguas sin revivir precios viejos.
 */
export function diffEdits(
  base: Element,
  edited: Element,
  opts: { ignoreNumberChanges?: boolean } = {},
  out: OfferEdit[] = [],
): OfferEdit[] {
  // Oferta antigua con filas distintas a las actuales (p. ej. se agregó un ítem): se emparejan los
  // hijos por su texto sin cifras en vez de por posición, para no mezclar filas de ítems distintos.
  if (
    opts.ignoreNumberChanges &&
    base.tagName === edited.tagName &&
    childTags(base) !== childTags(edited) &&
    directText(base) === directText(edited) &&
    base.children.length > 0
  ) {
    const key = (el: Element) =>
      `${el.tagName}|${norm(el.textContent)
        .replace(/[\d$.,%\s]/g, '')
        .slice(0, 30)}`;
    let from = 0;
    for (const b of base.children) {
      const k = key(b);
      for (let t = from; t < edited.children.length; t++) {
        if (key(edited.children[t]!) === k) {
          diffEdits(b, edited.children[t]!, opts, out);
          from = t + 1;
          break;
        }
      }
    }
    return out;
  }
  const changedHere =
    base.tagName !== edited.tagName ||
    childTags(base) !== childTags(edited) ||
    directText(base) !== directText(edited);
  if (changedHere) {
    const from = norm(base.textContent);
    const to = norm(edited.textContent);
    const skip = from === to ? norm(base.innerHTML) === norm(edited.innerHTML) : false;
    // Al convertir ofertas antiguas no se toman bloques con dinero: traerían precios ya recalculados.
    const legacyMoney = opts.ignoreNumberChanges && (from.includes('$') || onlyNumbersChanged(from, to));
    if (!skip && !legacyMoney && from) {
      out.push({ tag: base.tagName, from, html: cleanHtml(edited.innerHTML) });
    }
    return out;
  }
  for (let i = 0; i < base.children.length; i++) diffEdits(base.children[i]!, edited.children[i]!, opts, out);
  return out;
}

/**
 * Aplica los cambios sobre la oferta recién generada: cada cambio busca, en orden, el primer bloque
 * de la misma etiqueta con el mismo texto original. Devuelve los que no encontraron su bloque
 * (porque ese texto cambió en la cotización), para avisarle al usuario.
 */
export function applyEdits(root: Element, edits: OfferEdit[]): OfferEdit[] {
  const used = new Set<Element>();
  const missed: OfferEdit[] = [];
  for (const e of edits) {
    const target = [...root.getElementsByTagName(e.tag)].find(
      (el) => !used.has(el) && ![...used].some((u) => u.contains(el)) && norm(el.textContent) === e.from,
    );
    if (!target) {
      missed.push(e);
      continue;
    }
    target.innerHTML = cleanHtml(e.html);
    used.add(target);
  }
  return missed;
}
