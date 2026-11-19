import type { ImportedRow } from '../schemas';
import { parseNumber } from './parse';

/** Fragmento de texto de un PDF con su posición (origen abajo a la izquierda, como en PDF). */
export interface TextFragment {
  page: number;
  x: number;
  y: number;
  str: string;
  height?: number;
}

export interface LayoutResult {
  rows: ImportedRow[];
  /** La suma de los valores totales coincide con un subtotal escrito en el documento. */
  verified: boolean;
  /** Suma de los valores totales de las filas leídas. */
  total: number;
}

interface Line {
  page: number;
  y: number;
  frags: Array<{ x: number; s: string }>;
}

interface NumberToken {
  value: number;
  x: number;
  frag: string;
}

/** Fragmento que solo es un valor: "352.00", "$ 156,288", "COP 3,823,721.68", "127". */
const NUMERIC_FRAG =
  /^(?:(?:COP|USD|US\$|\$)\s*)?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?(?:\s*(?:COP|USD))?$|^(?:(?:COP|USD|US\$|\$)\s*)?\d+(?:[.,]\d+)?$/i;
/** Palabras de columnas que no son parte de la descripción. */
const NOISE_FRAG =
  /^(?:\*[A-Z]|COP|USD|US\$|\$|EN STOCK|STOCK|DISPONIBLE|INMEDIATA|UN|UND|UNID|ML|MTS?|GL|KG|CAJA)$/i;
const UNIT_FRAG = /^(UN|UND|UNID|ML|MTS?|GL|KG|CAJA)$/i;
const CODE = /^[A-Z0-9][A-Z0-9\-./]{2,}$/i;

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.002);

function toLines(fragments: TextFragment[], tolerance: number): Line[] {
  const sorted = fragments
    .filter((f) => f.str.trim())
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const f of sorted) {
    const last = lines[lines.length - 1];
    if (last && last.page === f.page && Math.abs(last.y - f.y) <= tolerance)
      last.frags.push({ x: f.x, s: f.str.trim() });
    else lines.push({ page: f.page, y: f.y, frags: [{ x: f.x, s: f.str.trim() }] });
  }
  for (const l of lines) l.frags.sort((a, b) => a.x - b.x);
  return lines;
}

const numbersOf = (lines: Line[]): NumberToken[] =>
  lines.flatMap((l) =>
    l.frags
      .filter((f) => NUMERIC_FRAG.test(f.s))
      .map((f) => ({ value: parseNumber(f.s.replace(/[A-Z$]/gi, '')), x: f.x, frag: f.s })),
  );

interface Triple {
  quantity: number;
  unitPrice: number;
  total: number;
}

/**
 * Busca cantidad × valor unitario = valor total entre los números de un renglón (admite una
 * columna de descuento en %). Es la prueba de que el renglón es un ítem y no una dirección, un
 * teléfono o una resolución.
 */
function findTriple(nums: NumberToken[], minX: number): Triple | null {
  const pool = nums.filter((n) => n.x >= minX && n.value > 0);
  const discounts = nums.filter((n) => n.value >= 0 && n.value < 100).map((n) => n.value);
  let best: (Triple & { score: number }) | null = null;
  for (const t of pool)
    for (const a of pool)
      for (const b of pool) {
        if (a === b || a === t || b === t || a.x > b.x) continue;
        const product = a.value * b.value;
        const ok =
          near(product, t.value) || discounts.some((d) => d > 0 && near(product * (1 - d / 100), t.value));
        if (!ok) continue;
        // La cantidad va antes que el valor unitario y el total es el número más a la derecha.
        const score = t.x + (Number.isInteger(a.value) ? 1 : 0);
        if (!best || score > best.score)
          best = { quantity: a.value, unitPrice: b.value, total: t.value, score };
      }
  return best ? { quantity: best.quantity, unitPrice: best.unitPrice, total: best.total } : null;
}

const upperTitle = (s: string) => {
  const t = s.replace(/\d+$/, '').trim();
  return t.length >= 3 &&
    t.length <= 40 &&
    /[A-ZÁÉÍÓÚÑ]{3}/.test(t) &&
    t === t.toUpperCase() &&
    !/[:$]/.test(t)
    ? t
    : null;
};

/**
 * Lee la tabla de una cotización en PDF a partir de las posiciones del texto, sin IA:
 * 1. Un ítem es un renglón (o 2–3 renglones muy juntos) donde cantidad × valor unitario = total.
 * 2. Los renglones de texto cercanos se le pegan como descripción (descripciones de varias líneas).
 * 3. Los títulos en mayúscula entre ítems ("TORRE MAR") son el grupo de los ítems que siguen.
 * Si la suma de los totales coincide con un valor del documento (el subtotal), queda verificado.
 */
export function parseQuoteLayout(fragments: TextFragment[]): LayoutResult {
  const heights = fragments
    .map((f) => f.height ?? 0)
    .filter((h) => h > 0)
    .sort((a, b) => a - b);
  const h = heights.length ? heights[Math.floor(heights.length / 2)]! : 8;
  const lines = toLines(fragments, Math.max(0.6, h * 0.25));

  // Texto que se repite en todas las páginas (encabezados, pies): nunca es grupo.
  const pages = new Set(lines.map((l) => l.page));
  const textPages = new Map<string, Set<number>>();
  for (const l of lines) {
    const t = l.frags.map((f) => f.s).join(' ');
    textPages.set(t, (textPages.get(t) ?? new Set()).add(l.page));
  }
  const repeated = (t: string) => pages.size > 1 && (textPages.get(t)?.size ?? 0) > 1;

  // 1. Renglones ancla: la ventana más corta (≤ ~1,3 renglones de alto) que cumple la aritmética.
  interface Rec {
    anchors: number[];
    triple: Triple;
    lines: number[];
  }
  const recs: Rec[] = [];
  const anchorOf = new Map<number, number>();
  const span = h * 1.3;
  for (let i = 0; i < lines.length; i++) {
    for (let j = i; j < lines.length; j++) {
      if (lines[j]!.page !== lines[i]!.page || lines[i]!.y - lines[j]!.y > span) break;
      const window = lines.slice(i, j + 1);
      // Los números a la izquierda de todo el texto son el nº de ítem, no cantidades.
      const textX = window.flatMap((l) => l.frags.filter((f) => !NUMERIC_FRAG.test(f.s)).map((f) => f.x));
      const minX = textX.length ? Math.min(...textX) : -Infinity;
      const triple = findTriple(numbersOf(window), minX);
      if (!triple) continue;
      const idx = Array.from({ length: j - i + 1 }, (_, k) => i + k);
      for (const k of idx) anchorOf.set(k, recs.length);
      recs.push({ anchors: idx, triple, lines: [...idx] });
      i = j;
      break;
    }
  }
  if (!recs.length) return { rows: [], verified: false, total: 0 };

  // 2. Cada renglón suelto va al ítem más cercano de la misma página (si está a menos de ~2 renglones).
  const groupAt = new Map<number, string>();
  lines.forEach((line, li) => {
    if (anchorOf.has(li)) return;
    let best = -1;
    let dist = Infinity;
    recs.forEach((r, ri) => {
      for (const a of r.anchors) {
        const al = lines[a]!;
        if (al.page !== line.page) continue;
        const d = Math.abs(al.y - line.y);
        if (d < dist) {
          dist = d;
          best = ri;
        }
      }
    });
    const text = line.frags.map((f) => f.s).join(' ');
    if (best >= 0 && dist <= h * 2) {
      recs[best]!.lines.push(li);
      return;
    }
    const title =
      !repeated(text) && line.frags.every((f) => !NUMERIC_FRAG.test(f.s) || /^\d+$/.test(f.s))
        ? upperTitle(
            line.frags
              .filter((f) => !/^\d+$/.test(f.s))
              .map((f) => f.s)
              .join(' '),
          )
        : null;
    if (title) groupAt.set(li, title);
  });

  // 3. Filas: descripción por columnas (izquierda a derecha) y, en cada columna, de arriba abajo.
  const firstLine = (r: Rec) => Math.min(...r.lines);
  const ordered = [...recs].sort((a, b) => firstLine(a) - firstLine(b));
  let group: string | undefined;
  let nextTitle = 0;
  const titles = [...groupAt.entries()].sort((a, b) => a[0] - b[0]);
  const rows: ImportedRow[] = [];
  let total = 0;
  for (const r of ordered) {
    const start = firstLine(r);
    while (nextTitle < titles.length && titles[nextTitle]![0] < start) group = titles[nextTitle++]![1];
    const frags = r.lines
      .sort((a, b) => a - b)
      .flatMap((li) => lines[li]!.frags.map((f) => ({ ...f, y: lines[li]!.y })));
    const textFrags = frags.filter((f) => !NUMERIC_FRAG.test(f.s) && !NOISE_FRAG.test(f.s));
    const minX = textFrags.length ? Math.min(...textFrags.map((f) => f.x)) : 0;
    const columns = new Map<number, typeof textFrags>();
    for (const f of textFrags) {
      const col = Math.round(f.x / 12);
      columns.set(col, [...(columns.get(col) ?? []), f]);
    }
    const parts = [...columns.keys()]
      .sort((a, b) => a - b)
      .flatMap((c) =>
        columns
          .get(c)!
          .sort((a, b) => b.y - a.y)
          .map((f) => f.s),
      );
    // Código del proveedor: una sola palabra con números en la primera columna de texto.
    let reference: string | undefined;
    const first = textFrags.find((f) => f.x === minX);
    const isCode = (s: string) => CODE.test(s) && (/\d/.test(s) || (/-/.test(s) && s === s.toUpperCase()));
    if (first && isCode(first.s) && parts.length > 1) {
      reference = first.s;
      parts.splice(parts.indexOf(first.s), 1);
    }
    let description = parts.join(' ').replace(/\s+/g, ' ').trim();
    if (reference) description = description.replace(`[${reference}]`, '').replace(/\s+/g, ' ').trim();
    if (!/[a-záéíóúñ]{3}/i.test(description)) continue;
    const allText = frags.map((f) => f.s).join(' ');
    const unit = frags.find((f) => UNIT_FRAG.test(f.s))?.s.toUpperCase() ?? 'UN';
    rows.push({
      description: description.slice(0, 500),
      unit,
      quantity: r.triple.quantity,
      currency: /\bUSD\b|US\$/i.test(allText) ? 'USD' : 'COP',
      unitPrice: r.triple.unitPrice,
      ...(reference ? { reference: reference.slice(0, 120) } : {}),
      ...(group ? { group } : {}),
    });
    total += r.triple.total;
  }

  // 4. Verificación: algún número del documento (fuera de los ítems) es la suma de los totales.
  const used = new Set(recs.flatMap((r) => r.anchors));
  const others = numbersOf(lines.filter((_, li) => !used.has(li)));
  const verified = rows.length > 0 && others.some((n) => near(n.value, total));
  return { rows, verified, total };
}
