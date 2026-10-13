import type { Currency } from '../constants';
import type { ImportedRow } from '../schemas';

/**
 * Lectores tolerantes de listas de ítems (cotizaciones de proveedor o listas del cliente).
 * Son puros: reciben texto o una matriz de celdas y devuelven filas para previsualizar.
 */

/** Convierte números en formato colombiano o estadounidense ("1.234,5", "1,234.5", "$ 1.500"). */
export function parseNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let t = String(value).trim().replace(/\$/g, '').replace(/\s/g, '');
  if (!t) return 0;
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // El último separador es el decimal
    t = lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (lastComma > -1) {
    t = t.length - lastComma - 1 === 3 ? t.replace(/,/g, '') : t.replace(',', '.');
  } else if (lastDot > -1) {
    if (t.length - lastDot - 1 === 3) t = t.replace(/\./g, '');
  }
  const n = parseFloat(t);
  return Number.isNaN(n) ? 0 : n;
}

/** Moneda por pistas del texto; si no hay, montos bajos (< 10.000) se asumen USD. */
export function guessCurrency(price: number, context = ''): Currency {
  const t = context.toUpperCase();
  if (t.includes('USD') || t.includes('US$') || t.includes('DOLAR')) return 'USD';
  if (t.includes('COP') || t.includes('PESO')) return 'COP';
  return price > 0 && price < 10_000 ? 'USD' : 'COP';
}

const LETTERS3 = /[a-zA-ZáéíóúñÁÉÍÓÚÑ]{3,}/;
const LETTERS4 = /[a-zA-ZáéíóúñÁÉÍÓÚÑ]{4,}/;
const NOISE =
  /^(total|subtotal|iva|descuento|neto|retefuente|observ|nota|forma de pago|cliente|fecha|cotizaci|oferta|p[aá]gina|tel|nit|direcc|se[nñ]or|item|descripci[oó]n|cant|unidad|precio|valor)/i;

/** Extrae ítems de líneas de texto (texto plano de un PDF de proveedor). */
export function parseTextLines(text: string): ImportedRow[] {
  const out: ImportedRow[] = [];
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 3);

  for (const line of lines) {
    if (NOISE.test(line)) continue;
    const body = line.replace(/^\d{1,3}[.)\-\s]+/, '').trim();
    const matches = [...body.matchAll(/\d[\d.,]*/g)];
    if (matches.length < 2) continue;

    // Los datos (cant, vr unitario, vr total) van al final de la línea.
    const last3 = matches.slice(-3);
    const blockStart = last3[0]!.index ?? 0;
    if (LETTERS4.test(body.slice(blockStart))) {
      // Hay palabras en el bloque final → solo los dos últimos números
      const [a, b] = matches.slice(-2);
      const desc = body.slice(0, a!.index).trim();
      if (desc.length < 3 || !LETTERS3.test(desc)) continue;
      const v1 = parseNumber(a![0]);
      const v2 = parseNumber(b![0]);
      if (v2 <= 0) continue;
      out.push({ description: desc, unit: 'UN', quantity: v1 > 0 ? v1 : 1, currency: guessCurrency(v2, line), unitPrice: v2 });
      continue;
    }

    const desc = body.slice(0, blockStart).trim();
    if (desc.length < 3 || !LETTERS3.test(desc)) continue;
    const vals = last3.map((m) => parseNumber(m[0]));
    let qty = 1;
    let price = 0;
    if (vals.length === 3) {
      qty = vals[0]! > 0 ? vals[0]! : 1;
      price = vals[1]!;
    } else if (vals.length === 2) {
      qty = vals[0]! > 0 && vals[0]! < vals[1]! ? vals[0]! : 1;
      price = vals[1]!;
      if (qty > 1 && Math.abs(vals[1]! - qty * vals[0]!) < 1) price = vals[0]!;
    } else {
      price = vals[0] ?? 0;
    }
    if (price <= 0) continue;

    // Tubería vendida por tramo: si la descripción trae la longitud, se pasa a precio por ML.
    let unit = 'UN';
    let note: string | undefined;
    const isPipe = /tuber|tubo|ca[nñ]er/i.test(desc);
    const len = desc.match(/(\d+[.,]?\d*)\s*(m|mt|mts|metros|ml)\b/i);
    if (isPipe && len) {
      const meters = parseNumber(len[1]);
      if (meters > 0) {
        note = `precio por tramo de ${meters} m → por ML`;
        price = Math.round(price / meters);
        qty = qty * meters;
        unit = 'ML';
      }
    } else if (isPipe) {
      unit = 'ML';
    }
    out.push({ description: desc, unit, quantity: qty, currency: guessCurrency(price, line), unitPrice: price, ...(note ? { note } : {}) });
  }
  return out;
}

function findColumn(headers: string[], candidates: string[]): number {
  for (const cand of candidates) {
    const idx = headers.findIndex((h) => h.toLowerCase().trim().includes(cand));
    if (idx > -1) return idx;
  }
  return -1;
}

const cellText = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/**
 * Lee una hoja (matriz de celdas). Busca el encabezado en las primeras 12 filas: debe tener una
 * palabra de "descripción" y otra de "cantidad/precio". Sirve tanto para cotizaciones de proveedor
 * (con precios) como para listas del cliente (solo descripciones).
 */
export function parseSheetRows(aoa: unknown[][]): ImportedRow[] {
  if (!aoa || aoa.length < 2) return [];
  const rowText = (i: number) => (aoa[i] ?? []).map((h) => cellText(h).toLowerCase()).join(' ');
  const limit = Math.min(12, aoa.length);
  let headerIdx = -1;
  for (let i = 0; i < limit; i++) {
    const t = rowText(i);
    if (/descrip|item|equipo|producto|material/.test(t) && /cant|und|unidad|precio|valor|costo/.test(t)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    headerIdx = 0;
    for (let i = 0; i < limit; i++) {
      if (/descrip|item|equipo|producto|material/.test(rowText(i))) {
        headerIdx = i;
        break;
      }
    }
  }
  const headers = (aoa[headerIdx] ?? []).map(cellText);
  const descIdx = Math.max(
    0,
    findColumn(headers, ['descripcion', 'descripción', 'item', 'equipo', 'producto', 'material', 'detalle']),
  );
  const unitIdx = findColumn(headers, ['unidad', 'und', 'u.m']);
  const qtyIdx = findColumn(headers, ['cantidad', 'cant']);
  const priceIdx = findColumn(headers, [
    'precio unitario',
    'valor unitario',
    'costo unitario',
    'precio unit',
    'valor unit',
    'vr unitario',
    'p. unit',
    'precio',
    'valor',
    'costo',
  ]);
  const headerTxt = headers.join(' ');

  const rows: ImportedRow[] = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row) continue;
    const desc = cellText(row[descIdx]).trim();
    if (desc.length < 3) continue;
    if (/^(total|subtotal|iva|descuento|neto|retefuente)/i.test(desc)) continue;
    const qty = qtyIdx > -1 ? parseNumber(row[qtyIdx]) : 0;
    const price = priceIdx > -1 ? parseNumber(row[priceIdx]) : 0;
    // Si la hoja tiene columna de cantidad o precio, la fila debe traer al menos uno.
    if ((qtyIdx > -1 || priceIdx > -1) && qty <= 0 && price <= 0) continue;
    rows.push({
      description: desc.slice(0, 500),
      unit: unitIdx > -1 ? cellText(row[unitIdx]).trim().slice(0, 20) || 'UN' : 'UN',
      quantity: qty > 0 ? qty : 1,
      currency: price > 0 ? guessCurrency(price, `${headerTxt} ${desc}`) : 'COP',
      unitPrice: price,
    });
  }
  return rows;
}

/** Filas pegadas: "Descripción<TAB>Cantidad<TAB>Precio" (o separadas por coma). */
export function parsePastedText(text: string): ImportedRow[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.includes('\t') ? line.split('\t') : line.split(',');
      const price = parseNumber(parts[2] ?? '0');
      return {
        description: (parts[0] ?? '').trim().slice(0, 500),
        unit: 'UN',
        quantity: parseNumber(parts[1]) || 1,
        currency: 'COP' as const,
        unitPrice: price,
      };
    })
    .filter((r) => r.description);
}
