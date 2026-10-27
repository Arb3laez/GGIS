import OpenAI from 'openai';
import { z } from 'zod';
import {
  BUSINESS_UNIT_LABELS,
  FACILITY_KIND_LABELS,
  FACILITY_KINDS,
  SERVICE_TYPE_LABELS,
  type ClientResearch,
  type ClientResearchRequest,
} from '@ggis/domain';
import type { Logger } from '../../lib/logger';

/**
 * Investigación comercial de un cliente con OpenAI (API Responses) y búsqueda web, en dos pasos:
 *   1. El modelo busca en la web (empresa, sedes, ubicación, proyecto) y escribe un informe.
 *   2. El modelo convierte ese informe en JSON estructurado.
 * Se separa en dos llamadas para conservar las citas de la búsqueda y tener un JSON estricto.
 * La llave de la API vive SOLO en el servidor; el navegador nunca la ve.
 */

const COMPANY = `G&G Innova Solutions (Barranquilla, Colombia): seguridad electrónica y protección contra incendios — CCTV, control de acceso, antihurto (EAS), detección y extinción de incendios y localización vehicular (SOLT).`;

const RESEARCH_SYSTEM = `Eres analista comercial de ${COMPANY}
Investiga en la web a la empresa cliente para preparar la oferta comercial de G&G:
- a qué se dedica y su sector;
- su dirección principal y sus sedes e instalaciones: ciudad, dirección si es pública y tipo de instalación (bodega, tienda, hotel, planta, oficinas, colegio, clínica, conjunto residencial, estación de servicio…);
- el proyecto: en qué sede o lugar se haría y qué se le va a hacer, según la unidad de negocio, el servicio y el alcance cotizado (por ejemplo, "instalación de CCTV en el centro de distribución de Malambo"); busca también noticias o anuncios públicos de ese proyecto (aperturas, ampliaciones, obras);
- qué riesgos propios de esa unidad de negocio tienen sus instalaciones.
Consulta también la página oficial de la empresa y noticias o directorios que muestren fotos de sus instalaciones (fachada, sedes), porque de esas páginas se toman las fotos reales para la oferta.
Usa solo información pública de la empresa. No busques datos personales de empleados ni de clientes. Si no encuentras algo, dilo; no lo inventes.
Escribe un informe breve en español con esos puntos.`;

const STRUCTURE_SYSTEM = `Conviertes un informe de investigación comercial en JSON para ${COMPANY}
Reglas:
- Usa solo lo que dice el informe; si un dato no aparece, deja el texto vacío ("") o la lista vacía.
- facilities.kind e imageTheme deben ser uno de: ${FACILITY_KINDS.map((k) => `${k} (${FACILITY_KIND_LABELS[k]})`).join(', ')}.
- imageTheme es el tipo de instalación donde se haría el proyecto.
- location es la dirección o ciudad principal para ubicar a la empresa en un mapa.
- address es la dirección principal del cliente tal como aparece en el informe ("" si no se encontró).
- projectSite es la sede o lugar donde se haría el proyecto, con dirección o ciudad si se conoce.
- project describe qué se le va a hacer al cliente con la unidad de negocio indicada, en qué sede y para qué.
- imagePromptNeed: descripción en español, de 2 a 3 frases, para generar una fotografía realista de la operación del cliente (el tipo de instalación, su actividad y el ambiente de la región), sin personas reconocibles, sin logotipos, sin marcas ni texto.
- imagePromptSolution: descripción en español, de 2 a 3 frases, para generar una fotografía realista que muestre EXACTAMENTE el trabajo indicado en «Proyecto / sucursal» de los datos de la cotización: los equipos y la tarea concretos (por ejemplo, para "mantenimiento correctivo, cambio de empaquetadura de la bomba contra incendio de 1000 GPM": técnicos dando mantenimiento a una bomba centrífuga contra incendio en su cuarto de bombas, con tuberías rojas, válvulas y manómetros), dentro del tipo de instalación del cliente. Si «Proyecto / sucursal» está vacío, muestra la solución de la unidad de negocio instalada. Sin logotipos, sin marcas, sin texto y sin caras reconocibles.
- proposalText: 2 a 4 frases para la oferta, en primera persona plural de G&G ("Entendemos que…"), que conecten la operación del cliente con la solución. Sin exagerar ni prometer lo que el informe no respalda.
- risks: hasta 6 riesgos concretos, en frases cortas.`;

/** Esquema JSON de la salida estructurada (la API garantiza que la respuesta lo cumple). */
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'sector',
    'location',
    'address',
    'projectSite',
    'facilities',
    'project',
    'risks',
    'proposalText',
    'imageTheme',
    'imagePromptNeed',
    'imagePromptSolution',
  ],
  properties: {
    summary: { type: 'string' },
    sector: { type: 'string' },
    location: { type: 'string' },
    address: { type: 'string' },
    projectSite: { type: 'string' },
    facilities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'city', 'address', 'kind'],
        properties: {
          name: { type: 'string' },
          city: { type: 'string' },
          address: { type: 'string' },
          kind: { type: 'string', enum: [...FACILITY_KINDS] },
        },
      },
    },
    project: { type: 'string' },
    risks: { type: 'array', items: { type: 'string' } },
    proposalText: { type: 'string' },
    imageTheme: { type: 'string', enum: [...FACILITY_KINDS] },
    imagePromptNeed: { type: 'string' },
    imagePromptSolution: { type: 'string' },
  },
} as const;

const outputSchema = z.object({
  summary: z.string(),
  sector: z.string(),
  location: z.string(),
  address: z.string(),
  projectSite: z.string(),
  facilities: z.array(
    z.object({ name: z.string(), city: z.string(), address: z.string(), kind: z.enum(FACILITY_KINDS) }),
  ),
  project: z.string(),
  risks: z.array(z.string()),
  proposalText: z.string(),
  imageTheme: z.enum(FACILITY_KINDS),
  imagePromptNeed: z.string(),
  imagePromptSolution: z.string(),
});

export class ResearchError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface ClientResearcher {
  readonly enabled: boolean;
  research(req: ClientResearchRequest): Promise<Omit<ClientResearch, 'researchedOn'>>;
  /** Genera una imagen alusiva (JPG) a partir de una descripción. */
  generateImage(prompt: string): Promise<Buffer>;
}

/** Reglas fijas que acompañan toda imagen: genérica, sin marcas ni personas reconocibles. */
const IMAGE_RULES =
  'Photorealistic, natural light, professional commercial photography, wide horizontal shot. No text, no logos, no brand names, no recognizable faces.';

const clip = (s: string, max: number) => s.trim().slice(0, max);

/** Lo que se pide investigar, con los datos que ya trae la cotización. */
function researchPrompt(req: ClientResearchRequest): string {
  const lines = [
    `Empresa cliente: ${req.clientName}`,
    req.identification ? `NIT: ${req.identification}` : '',
    req.city ? `Ciudad del servicio: ${req.city}` : '',
    req.project ? `Proyecto / sucursal (el trabajo a realizar): ${req.project}` : '',
    req.businessUnit ? `Unidad de negocio: ${BUSINESS_UNIT_LABELS[req.businessUnit]}` : '',
    req.serviceType ? `Servicio: ${SERVICE_TYPE_LABELS[req.serviceType]}` : '',
    req.scope ? `Alcance cotizado: ${req.scope}` : '',
  ].filter(Boolean);
  return `${lines.join('\n')}\n\nInvestiga a esta empresa para la oferta.`;
}

export function createClientResearcher(
  cfg: { apiKey?: string; model: string; imageModel?: string },
  log: Logger,
): ClientResearcher {
  if (!cfg.apiKey) {
    return {
      enabled: false,
      research: () =>
        Promise.reject(new ResearchError('La investigación con IA no está configurada.', false)),
      generateImage: () =>
        Promise.reject(new ResearchError('La investigación con IA no está configurada.', false)),
    };
  }
  const client = new OpenAI({ apiKey: cfg.apiKey, maxRetries: 2, timeout: 300_000 });
  const imageModel = cfg.imageModel ?? 'gpt-image-1.5';

  /** Traduce los errores del SDK a mensajes para el usuario (los reintentables se marcan). */
  function mapError(err: unknown): never {
    if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) {
      log.error({ status: err.status }, 'Investigación: credencial rechazada');
      throw new ResearchError('La llave de la API de IA no es válida.', false);
    }
    if (err instanceof OpenAI.BadRequestError || err instanceof OpenAI.NotFoundError) {
      log.warn({ status: err.status, message: err.message }, 'Investigación: solicitud rechazada');
      throw new ResearchError('No se pudo investigar a este cliente.', false);
    }
    if (err instanceof OpenAI.RateLimitError) {
      throw new ResearchError('Límite de uso de la IA alcanzado. Intenta en un momento.', true);
    }
    if (err instanceof OpenAI.APIConnectionError) {
      throw new ResearchError('No hay conexión con el servicio de IA.', true);
    }
    if (err instanceof OpenAI.APIError) {
      log.warn({ status: err.status }, 'Investigación: error del servicio');
      throw new ResearchError('El servicio de IA no respondió correctamente.', true);
    }
    throw err;
  }

  /** Texto de la respuesta; si el modelo se negó, lo indica. */
  function outputText(response: OpenAI.Responses.Response) {
    let text = '';
    let refused = false;
    for (const item of response.output) {
      if (item.type !== 'message') continue;
      for (const part of item.content) {
        if (part.type === 'output_text') text += part.text;
        else if (part.type === 'refusal') refused = true;
      }
    }
    return { text, refused };
  }

  /** Paso 1: búsqueda web e informe en texto, con las fuentes consultadas. */
  async function searchAndReport(req: ClientResearchRequest) {
    let response: OpenAI.Responses.Response;
    try {
      response = await client.responses.create({
        model: cfg.model,
        instructions: RESEARCH_SYSTEM,
        input: researchPrompt(req),
        tools: [
          {
            type: 'web_search',
            user_location: { type: 'approximate', country: 'CO', ...(req.city ? { city: req.city } : {}) },
          },
        ],
        include: ['web_search_call.action.sources'],
      });
    } catch (err) {
      mapError(err);
    }

    // Fuentes: primero las citadas en el informe (traen título), luego las demás consultadas.
    const sources = new Map<string, string>();
    for (const item of response.output) {
      if (item.type !== 'message') continue;
      for (const part of item.content) {
        if (part.type !== 'output_text') continue;
        for (const a of part.annotations) {
          if (a.type === 'url_citation' && !sources.has(a.url)) sources.set(a.url, a.title);
        }
      }
    }
    for (const item of response.output) {
      if (item.type === 'web_search_call' && item.action.type === 'search') {
        for (const src of item.action.sources ?? []) if (!sources.has(src.url)) sources.set(src.url, '');
      }
    }

    const { text: report, refused } = outputText(response);
    if (refused) throw new ResearchError('La IA no pudo investigar a este cliente.', false);
    if (!report.trim())
      throw new ResearchError('La búsqueda no devolvió información sobre el cliente.', true);
    return { report, sources: [...sources].map(([url, title]) => ({ url, title: title || url })) };
  }

  /** Paso 2: el informe en JSON estructurado. */
  async function structure(
    report: string,
    req: ClientResearchRequest,
  ): Promise<z.infer<typeof outputSchema>> {
    let response: OpenAI.Responses.Response;
    try {
      response = await client.responses.create({
        model: cfg.model,
        instructions: STRUCTURE_SYSTEM,
        input: `Datos de la cotización:\n${researchPrompt(req)}\n\nInforme de investigación:\n\n${report}`,
        text: {
          format: { type: 'json_schema', name: 'client_research', strict: true, schema: OUTPUT_SCHEMA },
        },
      });
    } catch (err) {
      mapError(err);
    }
    const { text, refused } = outputText(response);
    if (refused) throw new ResearchError('La IA no pudo organizar la investigación.', false);
    try {
      return outputSchema.parse(JSON.parse(text));
    } catch {
      throw new ResearchError('La respuesta de la IA no tuvo el formato esperado.', true);
    }
  }
  return {
    enabled: true,
    async research(req) {
      const { report, sources } = await searchAndReport(req);
      const r = await structure(report, req);
      log.info(
        { facilities: r.facilities.length, sources: sources.length },
        'Investigación de cliente completada',
      );
      return {
        summary: clip(r.summary, 3_000),
        sector: clip(r.sector, 200),
        location: clip(r.location, 300),
        address: clip(r.address, 300),
        projectSite: clip(r.projectSite, 300),
        facilities: r.facilities.slice(0, 12).map((f) => ({
          name: clip(f.name, 200),
          city: clip(f.city, 120),
          address: clip(f.address, 300),
          kind: f.kind,
        })),
        project: clip(r.project, 1_500),
        risks: r.risks.slice(0, 8).map((x) => clip(x, 300)),
        proposalText: clip(r.proposalText, 3_000),
        imageTheme: r.imageTheme,
        sources: sources
          .filter((s) => /^https?:\/\//.test(s.url))
          .slice(0, 15)
          .map((s) => ({ url: s.url.slice(0, 2_000), title: clip(s.title, 300) })),
        imagePrompts: { need: clip(r.imagePromptNeed, 1_000), solution: clip(r.imagePromptSolution, 1_000) },
        images: { need: null, solution: null },
        photos: [],
        mapImage: null,
      };
    },

    async generateImage(prompt) {
      let b64: string | undefined;
      try {
        const res = await client.images.generate({
          model: imageModel,
          prompt: `${prompt}\n\n${IMAGE_RULES}`,
          size: '1536x1024',
          quality: 'medium',
          output_format: 'jpeg',
          output_compression: 85,
          n: 1,
        });
        b64 = res.data?.[0]?.b64_json;
      } catch (err) {
        mapError(err);
      }
      if (!b64) throw new ResearchError('La IA no devolvió la imagen.', true);
      log.info({ model: imageModel }, 'Imagen alusiva generada');
      return Buffer.from(b64, 'base64');
    },
  };
}
