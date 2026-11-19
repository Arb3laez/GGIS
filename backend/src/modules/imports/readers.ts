import * as XLSX from 'xlsx';
import { extractTextItems } from 'unpdf';
import {
  parseQuoteLayout,
  parseSheetRows,
  parseTextLines,
  type ImportedRow,
  type LayoutResult,
  type TextFragment,
} from '@ggis/domain';

/** Lee la primera hoja de un Excel/CSV y devuelve los ítems detectados. */
export function readSpreadsheet(data: Buffer): ImportedRow[] {
  const wb = XLSX.read(data, { type: 'buffer', cellFormula: false, cellHTML: false });
  const first = wb.SheetNames[0];
  const sheet = first ? wb.Sheets[first] : undefined;
  if (!sheet) return [];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  return parseSheetRows(aoa);
}

async function pdfFragments(data: Buffer): Promise<TextFragment[]> {
  const { items } = await extractTextItems(new Uint8Array(data));
  return items.flatMap((page, p) =>
    page.map((it) => ({ page: p, x: it.x, y: it.y, str: it.str, height: it.height })),
  );
}

/**
 * Lee la tabla de una cotización en PDF con texto, sin IA: solo toma renglones donde
 * cantidad × valor unitario = valor total (ver `parseQuoteLayout`). `verified` indica que la suma
 * coincide con el subtotal del documento.
 */
export async function readPdfLayout(data: Buffer): Promise<LayoutResult> {
  return parseQuoteLayout(await pdfFragments(data));
}

/**
 * Método alterno (sin IA) para PDF con texto. Primero la lectura por posiciones y aritmética; si
 * no encuentra nada, reconstruye las líneas y aplica el lector de líneas del dominio.
 */
export async function readPdfText(data: Buffer): Promise<ImportedRow[]> {
  const fragments = await pdfFragments(data);
  const layout = parseQuoteLayout(fragments);
  if (layout.rows.length) return layout.rows;

  const byPage = new Map<number, TextFragment[]>();
  for (const f of fragments) byPage.set(f.page, [...(byPage.get(f.page) ?? []), f]);
  let text = '';
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    const lines = new Map<number, Array<{ x: number; s: string }>>();
    for (const it of byPage.get(page)!) {
      const y = Math.round(it.y);
      const line = lines.get(y) ?? [];
      line.push({ x: it.x, s: it.str });
      lines.set(y, line);
    }
    // De arriba hacia abajo (en PDF el origen está abajo) y de izquierda a derecha.
    for (const y of [...lines.keys()].sort((a, b) => b - a)) {
      const line = lines
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .map((o) => o.s)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (line) text += line + '\n';
    }
  }
  return parseTextLines(text);
}
