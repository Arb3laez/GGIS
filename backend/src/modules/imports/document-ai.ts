import type { Logger } from '../../lib/logger';
import { disabledExtractor, type AiExtractor } from './ai-extractor';
import { createOpenAiExtractor } from './openai-extractor';

interface DocumentAiConfig {
  research: { apiKey?: string; model: string };
}

/** Proveedor de IA que leerá las cotizaciones de proveedor: OpenAI si hay llave. */
export function documentAiProvider(cfg: DocumentAiConfig): 'openai' | null {
  return cfg.research.apiKey ? 'openai' : null;
}

/**
 * IA para leer PDF/imágenes de proveedor y relacionar precios con OpenAI (misma llave de la
 * investigación de clientes). Sin llave queda deshabilitada: se usa el lector de texto y las reglas.
 */
export function createDocumentAi(cfg: DocumentAiConfig, log: Logger): AiExtractor {
  if (!cfg.research.apiKey) return disabledExtractor();
  return createOpenAiExtractor({ apiKey: cfg.research.apiKey, model: cfg.research.model }, log);
}
