import { z } from 'zod';
import type { ImportedRow, MatchLink, MatchTargetItem } from '@ggis/domain';
import type { DocumentMime } from '../attachments/file-type';

/**
 * Lectura de cotizaciones de proveedor con IA: instrucciones, formato de respuesta y conversión
 * de la respuesta. La llamada al modelo está en openai-extractor.ts (OpenAI).
 * La llave de la API vive SOLO en el servidor (variable de entorno); el navegador nunca la ve.
 */

export const SYSTEM_PROMPT = `Extraes los ítems de cotizaciones de proveedores para una empresa colombiana de seguridad electrónica y protección contra incendios.
Devuelve cada línea de producto o servicio cotizado. Ignora totales, subtotales, IVA, descuentos, encabezados, datos de contacto y notas.
Para cada ítem:
- description: la descripción tal como aparece (modelo y referencia incluidos).
- unit: unidad corta (UN, ML, KIT, CAJA, GL…); usa "UN" si no es clara.
- quantity: cantidad cotizada; 1 si no aparece.
- unitPrice: precio unitario como número, sin símbolos ni separadores de miles. Si solo aparece el valor total de la línea, divídelo por la cantidad.
- currency: "USD" si el documento indica dólares; si no, "COP".
- reference: referencia, modelo o código del proveedor; "" si no hay.
- group: título de la sección a la que pertenece la línea (p. ej. "TORRE A", "PISO 2"); "" si el documento no agrupa.
Si el documento no contiene ítems cotizados, devuelve la lista vacía.`;

export const MATCH_PROMPT = `Eres presupuestador de una empresa colombiana de seguridad electrónica y protección contra incendios.
Recibes la lista de ítems que pide el cliente (con id, grupo, descripción, unidad y cantidad) y las líneas de una cotización de proveedor (con número de línea, grupo, referencia, descripción, cantidad y precio).
Relaciona cada línea del proveedor con el ítem o ítems del cliente que cubre. Tipos de relación:
- "direct": la línea es el ítem (puede tener otra redacción o marca).
- "shared": una línea cubre varios ítems del cliente; su cantidad es la suma (p. ej. 83 sirenas = ítem de 55 + ítem de 28). Crea un enlace por cada ítem con el mismo número de línea.
- "component": la línea es una parte que se suma al precio del ítem (base del detector, módulo de expansión del panel, accesorio obligatorio).
Reglas:
- Respeta el grupo (torre, piso, frente) cuando ambos lo traen.
- Usa la cantidad para desempatar entre ítems parecidos.
- Si una línea no corresponde a ningún ítem, no la enlaces. No inventes relaciones.
- factor: unidades de la línea por cada unidad del ítem; normalmente 1.`;

export const MATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['links'],
  properties: {
    links: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['row', 'item', 'kind', 'factor'],
        properties: {
          row: { type: 'integer' },
          item: { type: 'string' },
          kind: { type: 'string', enum: ['direct', 'shared', 'component'] },
          factor: { type: 'number' },
        },
      },
    },
  },
} as const;

const matchOutputSchema = z.object({
  links: z.array(
    z.object({
      row: z.number().int(),
      item: z.string(),
      kind: z.enum(['direct', 'shared', 'component']),
      factor: z.number(),
    }),
  ),
});

/** Esquema JSON para la salida estructurada (la API garantiza que la respuesta lo cumple). */
export const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'unit', 'quantity', 'unitPrice', 'currency', 'reference', 'group'],
        properties: {
          description: { type: 'string' },
          unit: { type: 'string' },
          quantity: { type: 'number' },
          unitPrice: { type: 'number' },
          currency: { type: 'string', enum: ['COP', 'USD'] },
          reference: { type: 'string' },
          group: { type: 'string' },
        },
      },
    },
  },
} as const;

const outputSchema = z.object({
  items: z.array(
    z.object({
      description: z.string(),
      unit: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
      currency: z.enum(['COP', 'USD']),
      reference: z.string().default(''),
      group: z.string().default(''),
    }),
  ),
});

export const EXTRACT_INSTRUCTION = 'Extrae los ítems de esta cotización de proveedor.';

/** Convierte la respuesta del modelo (cualquier proveedor) en filas para previsualizar. */
export function rowsFromModel(json: unknown): ImportedRow[] {
  const parsed = outputSchema.safeParse(json);
  if (!parsed.success)
    throw new AiExtractionError('La respuesta de la IA no tuvo el formato esperado.', true);
  return parsed.data.items
    .map((i) => {
      const reference = i.reference.trim().slice(0, 120);
      const group = i.group.trim().slice(0, 120);
      return {
        description: i.description.trim().slice(0, 500),
        unit: (i.unit.trim() || 'UN').slice(0, 20),
        quantity: i.quantity > 0 ? i.quantity : 1,
        currency: i.currency,
        unitPrice: Math.max(0, i.unitPrice),
        ...(reference ? { reference } : {}),
        ...(group ? { group } : {}),
      };
    })
    .filter((i) => i.description);
}

/** Datos para que el modelo relacione: ids cortos (I1, I2…) que luego se traducen. */
export function matchPayload(items: MatchTargetItem[], rows: ImportedRow[]) {
  const keys = items.map((_, i) => `I${i + 1}`);
  const payload = {
    itemsCliente: items.map((it, i) => ({
      id: keys[i],
      grupo: it.group ?? '',
      descripcion: it.description,
      unidad: it.unit,
      cantidad: it.quantity,
    })),
    lineasProveedor: rows.map((r, i) => ({
      linea: i,
      grupo: r.group ?? '',
      referencia: r.reference ?? '',
      descripcion: r.description,
      unidad: r.unit,
      cantidad: r.quantity,
      precioUnitario: r.unitPrice,
    })),
  };
  return { text: JSON.stringify(payload), keys };
}

/** Convierte la respuesta del modelo en relaciones con los ids reales de los ítems. */
export function linksFromModel(json: unknown, items: MatchTargetItem[], keys: string[]): MatchLink[] {
  const parsed = matchOutputSchema.safeParse(json);
  if (!parsed.success)
    throw new AiExtractionError('La respuesta de la IA no tuvo el formato esperado.', true);
  const byKey = new Map(keys.map((k, i) => [k, items[i]!.id]));
  return parsed.data.links
    .filter((l) => byKey.has(l.item))
    .map((l) => ({
      row: l.row,
      itemId: byKey.get(l.item)!,
      kind: l.kind,
      // Mismo rango que acepta la cotización al guardar (0 < factor ≤ 1000); lo demás se toma como 1.
      factor: Number.isFinite(l.factor) && l.factor > 0 && l.factor <= 1_000 ? l.factor : 1,
    }));
}

export class AiExtractionError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface AiExtractor {
  readonly enabled: boolean;
  extract(data: Buffer, mime: DocumentMime): Promise<ImportedRow[]>;
  /** Propone qué línea del proveedor va a qué ítem de la cotización (opcional). */
  match?(items: MatchTargetItem[], rows: ImportedRow[]): Promise<MatchLink[]>;
}

/** IA deshabilitada (sin llave): la importación usa el lector de texto y las reglas. */
export function disabledExtractor(): AiExtractor {
  return {
    enabled: false,
    extract: () => Promise.reject(new AiExtractionError('La lectura con IA no está configurada.', false)),
  };
}
