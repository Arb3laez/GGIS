import { describe, expect, it } from 'vitest';
import { collectWebPhotos, imageCandidates, isPublicIp, WebFetcher } from './web-photos';

// JPG ficticio (firma JPG + relleno) del tamaño mínimo de una foto.
const photo = (n: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, n]), Buffer.alloc(40 * 1024, n)]);

const html = `<html><head><meta property="og:image" content="/img/fachada.jpg"></head>
<body><img src="/logo.png"><img data-src="https://cdn.demo.test/sede.jpg"><img src="/tiny.jpg"></body></html>`;

const fakeFetch = (async (input: string | URL | Request) => {
  const url = String(input);
  if (url === 'https://demo.test/') return new Response(html, { headers: { 'content-type': 'text/html' } });
  if (url === 'https://demo.test/img/fachada.jpg') return new Response(photo(1));
  if (url === 'https://cdn.demo.test/sede.jpg') return new Response(photo(2));
  if (url === 'https://demo.test/tiny.jpg') return new Response(Buffer.from([0xff, 0xd8, 0xff, 0]));
  return new Response('no', { status: 404 });
}) as typeof fetch;

describe('fotos reales de la web', () => {
  it('reconoce direcciones públicas y bloquea la red interna', () => {
    expect(isPublicIp('8.8.8.8')).toBe(true);
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '192.168.0.5',
      '172.20.0.1',
      '169.254.169.254',
      '::1',
      'fd00::1',
      '::ffff:127.0.0.1',
    ])
      expect(isPublicIp(ip)).toBe(false);
  });

  it('toma la imagen destacada y las del contenido, sin logos', () => {
    expect(imageCandidates(html, new URL('https://demo.test/'))).toEqual([
      'https://demo.test/img/fachada.jpg',
      'https://cdn.demo.test/sede.jpg',
      'https://demo.test/tiny.jpg',
    ]);
  });

  it('descarga fotos válidas con su crédito y descarta las pequeñas', async () => {
    const web = new WebFetcher(fakeFetch, async () => ['93.184.216.34']);
    const photos = await collectWebPhotos([{ url: 'https://demo.test/', title: 'Demo' }], web);
    expect(photos.map((p) => p.credit)).toEqual(['demo.test', 'demo.test']);
    expect(photos[0]!.sourceUrl).toBe('https://demo.test/');
  });

  it('no descarga de direcciones internas', async () => {
    const web = new WebFetcher(fakeFetch, async () => ['127.0.0.1']);
    await expect(web.get('https://demo.test/', 'text/html', 1000)).rejects.toThrow('no pública');
    expect(await collectWebPhotos([{ url: 'http://localhost/', title: '' }], web)).toEqual([]);
  });
});
