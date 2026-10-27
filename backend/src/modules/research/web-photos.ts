import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { FetchFn } from '../exchange-rate/exchange-rate.service';
import { sniffDocumentType } from '../attachments/file-type';

/**
 * Fotos reales de las instalaciones del cliente tomadas de las páginas web que encontró la
 * investigación (imagen destacada de la página y fotos grandes del contenido). Cada foto conserva
 * su fuente para darle el crédito en la oferta.
 *
 * Como el servidor descarga direcciones que vienen de internet, solo se permiten http/https hacia
 * direcciones públicas (nunca la red interna), con tiempo y tamaño máximos.
 */

export type ResolveHost = (host: string) => Promise<string[]>;

const defaultResolve: ResolveHost = async (host) =>
  (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Más pequeñas suelen ser logos, íconos o miniaturas. */
const MIN_IMAGE_BYTES = 35 * 1024;
const MAX_PAGES = 8;
const MAX_CANDIDATES_PER_PAGE = 4;
const MAX_PHOTOS = 8;
const TIMEOUT_MS = 10_000;
const SKIP = /logo|icon|favicon|sprite|avatar|badge|banner-ad|pixel|placeholder|\.svg|\.gif|\.ico/i;

/** true si la IP es pública (no local, privada, de enlace local ni reservada). */
export function isPublicIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a = 0, b = 0] = ip.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x.startsWith('::ffff:')) return isPublicIp(x.slice(7));
    return !(x === '::' || x === '::1' || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith('ff'));
  }
  return false;
}

export class WebFetcher {
  constructor(
    private readonly fetchFn: FetchFn = fetch,
    private readonly resolve: ResolveHost = defaultResolve,
  ) {}

  private async assertPublic(url: URL): Promise<void> {
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Protocolo no permitido');
    if (url.username || url.password) throw new Error('URL con credenciales');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const ips = isIP(host) ? [host] : await this.resolve(host);
    if (!ips.length || !ips.every(isPublicIp)) throw new Error('Dirección no pública');
  }

  /** GET con redirecciones verificadas una a una y límite de tamaño. */
  async get(
    raw: string,
    accept: string,
    maxBytes: number,
  ): Promise<{ body: Buffer; type: string; url: URL }> {
    let url = new URL(raw);
    for (let hop = 0; hop < 4; hop++) {
      await this.assertPublic(url);
      const res = await this.fetchFn(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept, 'user-agent': 'Mozilla/5.0 (compatible; GGIS-Cotizador/1.0)' },
      });
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get('location');
        if (!next) throw new Error('Redirección sin destino');
        url = new URL(next, url);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (Number(res.headers.get('content-length') ?? 0) > maxBytes) throw new Error('Demasiado grande');
      const body = Buffer.from(await res.arrayBuffer());
      if (body.length > maxBytes) throw new Error('Demasiado grande');
      return { body, type: res.headers.get('content-type') ?? '', url };
    }
    throw new Error('Demasiadas redirecciones');
  }
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/gi, '/');

/** Imágenes candidatas de una página: primero la destacada (og:image), luego las del contenido. */
export function imageCandidates(html: string, base: URL): string[] {
  const found: string[] = [];
  const meta = /<meta[^>]+(?:property|name)=["'](?:og:image(?::url)?|twitter:image)["'][^>]*>/gi;
  for (const tag of html.match(meta) ?? []) {
    const m = /content=["']([^"']+)["']/i.exec(tag);
    if (m?.[1]) found.push(m[1]);
  }
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const m = /\s(?:data-src|data-lazy-src|src)=["']([^"']+)["']/i.exec(tag);
    if (m?.[1] && !m[1].startsWith('data:')) found.push(m[1]);
  }
  const out: string[] = [];
  for (const raw of found) {
    try {
      const u = new URL(decode(raw.trim()), base);
      if (
        (u.protocol === 'https:' || u.protocol === 'http:') &&
        !SKIP.test(u.pathname) &&
        !out.includes(u.href)
      )
        out.push(u.href);
    } catch {
      /* URL inválida: se ignora */
    }
  }
  return out.slice(0, MAX_CANDIDATES_PER_PAGE);
}

export interface WebPhoto {
  data: Buffer;
  sourceUrl: string;
  sourceTitle: string;
  credit: string;
}

/** Recorre las páginas fuente y descarga hasta MAX_PHOTOS fotos válidas (sin repetidas). */
export async function collectWebPhotos(
  pages: Array<{ url: string; title: string }>,
  fetcher: WebFetcher,
): Promise<WebPhoto[]> {
  const photos: WebPhoto[] = [];
  const seen = new Set<string>();
  for (const page of pages.slice(0, MAX_PAGES)) {
    if (photos.length >= MAX_PHOTOS) break;
    let html: string;
    let pageUrl: URL;
    try {
      const res = await fetcher.get(page.url, 'text/html', MAX_HTML_BYTES);
      if (!/html/i.test(res.type)) continue;
      html = res.body.toString('utf8');
      pageUrl = res.url;
    } catch {
      continue; // página caída, bloqueada o no pública
    }
    for (const src of imageCandidates(html, pageUrl)) {
      if (photos.length >= MAX_PHOTOS) break;
      try {
        const { body } = await fetcher.get(
          src,
          'image/avif,image/webp,image/jpeg,image/png',
          MAX_IMAGE_BYTES,
        );
        const mime = sniffDocumentType(body);
        if (!mime || mime === 'application/pdf' || body.length < MIN_IMAGE_BYTES) continue;
        const hash = createHash('sha256').update(body).digest('hex');
        if (seen.has(hash)) continue;
        seen.add(hash);
        photos.push({
          data: body,
          sourceUrl: pageUrl.href,
          sourceTitle: page.title || pageUrl.hostname,
          credit: pageUrl.hostname.replace(/^www\./, ''),
        });
      } catch {
        /* imagen no disponible: se sigue con la siguiente */
      }
    }
  }
  return photos;
}

/** Mapa estático de Google Maps con el pin en la ubicación (la llave nunca sale del servidor). */
export async function fetchStaticMap(
  query: string,
  apiKey: string,
  fetchFn: FetchFn = fetch,
): Promise<Buffer> {
  const params = new URLSearchParams({
    center: query,
    zoom: '16',
    size: '640x400',
    scale: '2',
    maptype: 'roadmap',
    markers: `color:red|${query}`,
    language: 'es',
    region: 'CO',
    key: apiKey,
  });
  const res = await fetchFn(`https://maps.googleapis.com/maps/api/staticmap?${params}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Google Maps respondió ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  const mime = sniffDocumentType(body);
  if (mime !== 'image/png' && mime !== 'image/jpeg') throw new Error('Google Maps no devolvió una imagen');
  return body;
}
