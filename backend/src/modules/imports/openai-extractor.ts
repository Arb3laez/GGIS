import OpenAI from 'openai';
import type { Logger } from '../../lib/logger';
import type { DocumentMime } from '../attachments/file-type';
import {
  AiExtractionError,
  EXTRACT_INSTRUCTION,
  linksFromModel,
  MATCH_PROMPT,
  MATCH_SCHEMA,
  matchPayload,
  OUTPUT_SCHEMA,
  rowsFromModel,
  SYSTEM_PROMPT,
  type AiExtractor,
} from './ai-extractor';

/**
 * Lectura de cotizaciones de proveedor y asociación de precios con OpenAI. Usa las mismas
 * instrucciones y el mismo formato de respuesta que la versión con Claude; se usa cuando no hay
 * llave de Anthropic pero sí de OpenAI (la misma de la investigación de clientes).
 * La llave vive SOLO en el servidor.
 */
export function createOpenAiExtractor(cfg: { apiKey: string; model: string }, log: Logger): AiExtractor {
  const client = new OpenAI({ apiKey: cfg.apiKey, maxRetries: 2, timeout: 180_000 });

  function mapError(err: unknown): never {
    if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) {
      log.error({ status: err.status }, 'IA (OpenAI): credencial rechazada');
      throw new AiExtractionError('La llave de la API de OpenAI no es válida.', false);
    }
    if (err instanceof OpenAI.BadRequestError || err instanceof OpenAI.NotFoundError) {
      log.warn({ status: err.status, message: err.message }, 'IA (OpenAI): solicitud rechazada');
      throw new AiExtractionError('El documento no se pudo procesar con IA.', false);
    }
    if (err instanceof OpenAI.RateLimitError) {
      throw new AiExtractionError('Límite de uso de la IA alcanzado. Intenta en un momento.', true);
    }
    if (err instanceof OpenAI.APIConnectionError) {
      throw new AiExtractionError('No hay conexión con el servicio de IA.', true);
    }
    if (err instanceof OpenAI.APIError) {
      log.warn({ status: err.status }, 'IA (OpenAI): error del servicio');
      throw new AiExtractionError('El servicio de IA no respondió correctamente.', true);
    }
    throw err;
  }

  /** Llama al modelo con salida estructurada (JSON Schema estricto) y devuelve el JSON. */
  async function call(
    instructions: string,
    content: OpenAI.Responses.ResponseInputMessageContentList,
    schema: Record<string, unknown>,
    name: string,
    task: string,
  ): Promise<unknown> {
    let response: OpenAI.Responses.Response;
    try {
      response = await client.responses.create({
        model: cfg.model,
        instructions,
        input: [{ role: 'user', content }],
        text: { format: { type: 'json_schema', name, strict: true, schema } },
      });
    } catch (err) {
      mapError(err);
    }
    if (response.status === 'incomplete') {
      throw new AiExtractionError('El documento tiene demasiados ítems para leerlo de una vez.', false);
    }
    let text = '';
    for (const item of response.output) {
      if (item.type !== 'message') continue;
      for (const part of item.content) {
        if (part.type === 'refusal')
          throw new AiExtractionError('La IA no pudo procesar este documento.', false);
        if (part.type === 'output_text') text += part.text;
      }
    }
    log.info(
      { inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens },
      `IA (OpenAI): ${task} completada`,
    );
    try {
      return JSON.parse(text);
    } catch {
      throw new AiExtractionError('La respuesta de la IA no tuvo el formato esperado.', true);
    }
  }

  const documentPart = (data: Buffer, mime: DocumentMime): OpenAI.Responses.ResponseInputContent => {
    const url = `data:${mime};base64,${data.toString('base64')}`;
    return mime === 'application/pdf'
      ? { type: 'input_file', filename: 'cotizacion.pdf', file_data: url }
      : { type: 'input_image', image_url: url, detail: 'high' };
  };

  return {
    enabled: true,
    async extract(data, mime) {
      const json = await call(
        SYSTEM_PROMPT,
        [documentPart(data, mime), { type: 'input_text', text: EXTRACT_INSTRUCTION }],
        OUTPUT_SCHEMA,
        'supplier_quote_items',
        'extracción',
      );
      return rowsFromModel(json);
    },
    async match(items, rows) {
      const { text, keys } = matchPayload(items, rows);
      const json = await call(
        MATCH_PROMPT,
        [{ type: 'input_text', text }],
        MATCH_SCHEMA,
        'price_links',
        'asociación de precios',
      );
      return linksFromModel(json, items, keys);
    },
  };
}
