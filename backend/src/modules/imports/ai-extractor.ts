import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { ImportedRow } from '@ggis/domain';
import type { DocumentMime } from '../attachments/file-type';
import type { Logger } from '../../lib/logger';

/**
 * Extrae los ítems de una cotización de proveedor (PDF o imagen) con Claude.
 * La llave de la API vive SOLO en el servidor (variable de entorno); el navegador nunca la ve.
 */

const SYSTEM_PROMPT = `Extraes los ítems de cotizaciones de proveedores para una empresa colombiana de seguridad electrónica y protección contra incendios.
Devuelve cada línea de producto o servicio cotizado. Ignora totales, subtotales, IVA, descuentos, encabezados, datos de contacto y notas.
Para cada ítem:
- description: la descripción tal como aparece (modelo y referencia incluidos).
- unit: unidad corta (UN, ML, KIT, CAJA, GL…); usa "UN" si no es clara.
- quantity: cantidad cotizada; 1 si no aparece.
- unitPrice: precio unitario como número, sin símbolos ni separadores de miles. Si solo aparece el valor total de la línea, divídelo por la cantidad.
- currency: "USD" si el documento indica dólares; si no, "COP".
Si el documento no contiene ítems cotizados, devuelve la lista vacía.`;

/** Esquema JSON para la salida estructurada (la API garantiza que la respuesta lo cumple). */
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'unit', 'quantity', 'unitPrice', 'currency'],
        properties: {
          description: { type: 'string' },
          unit: { type: 'string' },
          quantity: { type: 'number' },
          unitPrice: { type: 'number' },
          currency: { type: 'string', enum: ['COP', 'USD'] },
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
    }),
  ),
});

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
}

export function createAiExtractor(cfg: { apiKey?: string; model: string }, log: Logger): AiExtractor {
  if (!cfg.apiKey) {
    return {
      enabled: false,
      extract: () =>
        Promise.reject(new AiExtractionError('La extracción con IA no está configurada.', false)),
    };
  }
  const client = new Anthropic({ apiKey: cfg.apiKey, maxRetries: 2, timeout: 120_000 });

  return {
    enabled: true,
    async extract(data, mime) {
      const base64 = data.toString('base64');
      const document: Anthropic.Beta.Messages.BetaContentBlockParam =
        mime === 'application/pdf'
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
          : { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } };

      let response: Anthropic.Beta.Messages.BetaMessage;
      try {
        response = await client.beta.messages.create({
          model: cfg.model,
          max_tokens: 16_000,
          system: SYSTEM_PROMPT,
          // Si un clasificador de seguridad rechaza por error un documento legítimo, el servidor
          // reintenta con el modelo de respaldo recomendado en vez de devolver el rechazo.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
          messages: [
            {
              role: 'user',
              content: [
                document,
                { type: 'text', text: 'Extrae los ítems de esta cotización de proveedor.' },
              ],
            },
          ],
        });
      } catch (err) {
        if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
          log.error({ status: err.status }, 'IA: credencial rechazada');
          throw new AiExtractionError('La llave de la API de IA no es válida.', false);
        }
        if (err instanceof Anthropic.BadRequestError) {
          log.warn({ status: err.status, message: err.message }, 'IA: solicitud rechazada');
          throw new AiExtractionError('El documento no se pudo procesar con IA.', false);
        }
        if (err instanceof Anthropic.RateLimitError) {
          throw new AiExtractionError('Límite de uso de la IA alcanzado. Intenta en un momento.', true);
        }
        if (err instanceof Anthropic.APIConnectionError) {
          throw new AiExtractionError('No hay conexión con el servicio de IA.', true);
        }
        if (err instanceof Anthropic.APIError) {
          log.warn({ status: err.status }, 'IA: error del servicio');
          throw new AiExtractionError('El servicio de IA no respondió correctamente.', true);
        }
        throw err;
      }

      if (response.stop_reason === 'refusal') {
        throw new AiExtractionError('La IA no pudo procesar este documento.', false);
      }
      if (response.stop_reason === 'max_tokens') {
        throw new AiExtractionError('El documento tiene demasiados ítems para leerlo de una vez.', false);
      }
      const text = response.content
        .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      let parsed: z.infer<typeof outputSchema>;
      try {
        parsed = outputSchema.parse(JSON.parse(text));
      } catch {
        throw new AiExtractionError('La respuesta de la IA no tuvo el formato esperado.', true);
      }
      log.info(
        {
          items: parsed.items.length,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        'IA: extracción completada',
      );
      return parsed.items
        .map((i) => ({
          description: i.description.trim().slice(0, 500),
          unit: (i.unit.trim() || 'UN').slice(0, 20),
          quantity: i.quantity > 0 ? i.quantity : 1,
          currency: i.currency,
          unitPrice: Math.max(0, i.unitPrice),
        }))
        .filter((i) => i.description);
    },
  };
}
