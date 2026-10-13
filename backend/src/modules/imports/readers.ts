import * as XLSX from 'xlsx';
import { extractTextItems } from 'unpdf';
import { parseSheetRows, parseTextLines, type ImportedRow } from '@ggis/domain';

/** Lee la primera hoja de un Excel/CSV y devuelve los ítems detectados. */
export function readSpreadsheet(data: Buffer): ImportedRow[] {
  const wb = XLSX.read(data, { type: 'buffer', cellFormula: false, cellHTML: false });
  const first = wb.SheetNames[0];
  const sheet = first ? wb.Sheets[first] : undefined;
  if (!sheet) return [];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  return parseSheetRows(aoa);
}

/**
 * Método alterno (sin IA) para PDF con texto: reconstruye las líneas agrupando los fragmentos por
 * su posición vertical y luego aplica el lector de líneas del dominio.
 */
export async function readPdfText(data: Buffer): Promise<ImportedRow[]> {
  const { items } = await extractTextItems(new Uint8Array(data));
  let text = '';
  for (const page of items) {
    const lines = new Map<number, Array<{ x: number; s: string }>>();
    for (const it of page) {
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
