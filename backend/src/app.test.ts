import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blankItem, createEmptyDraft, type Quote, type QuoteDraft } from '@ggis/domain';
import { createApp } from './app';
import { loadConfig } from './config';
import { openDatabase, type Database } from './db/database';
import { createLogger } from './lib/logger';
import type { AiExtractor } from './modules/imports/ai-extractor';

let tmp: string;
let db: Database;
let app: ReturnType<typeof createApp>;

const fakeAi: AiExtractor = {
  enabled: true,
  extract: async () => [
    { description: 'Detector de humo', unit: 'UN', quantity: 12, currency: 'COP', unitPrice: 95_000 },
  ],
};

const fakeFetch = (async (url: string | URL | Request) => {
  if (String(url).includes('datos.gov.co')) {
    return new Response(JSON.stringify([{ valor: '4012.55', vigenciadesde: '2026-10-08T00:00:00.000' }]));
  }
  return new Response('fail', { status: 500 });
}) as typeof fetch;

function sampleDraft(): QuoteDraft {
  const d = createEmptyDraft(new Date('2026-10-01'));
  d.client.name = 'Cliente de prueba';
  d.client.project = 'CCTV bodega';
  d.businessUnit = 'cctv';
  d.items = [{ ...blankItem('Cámara bala IP', 'UN'), quantity: 4, unitPrice: 183_200 }];
  return d;
}

const PDF_BYTES = Buffer.from('%PDF-1.4\n%fake\n');

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ggis-test-'));
  const config = loadConfig({ NODE_ENV: 'test', DATA_DIR: tmp, LOG_LEVEL: 'silent' });
  db = openDatabase(':memory:');
  app = createApp({
    config,
    db,
    log: createLogger('silent', false),
    fetchFn: fakeFetch,
    aiExtractor: fakeAi,
  });
});

afterEach(() => {
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function createQuote(draft = sampleDraft()): Promise<Quote> {
  const res = await request(app).post('/api/quotes').send(draft).expect(201);
  return res.body as Quote;
}

describe('cotizaciones', () => {
  it('asigna consecutivos en el servidor y calcula el resumen', async () => {
    const a = await createQuote();
    const b = await createQuote();
    expect(a.number).toBe('OT-0001');
    expect(b.number).toBe('OT-0002');

    const list = await request(app).get('/api/quotes').expect(200);
    expect(list.body).toHaveLength(2);
    expect(list.body[0].total).toBeGreaterThan(0);
    expect(list.body[0].clientName).toBe('Cliente de prueba');
  });

  it('rechaza datos inválidos con 422 y el detalle', async () => {
    const bad = { ...sampleDraft(), validDays: 0 };
    const res = await request(app).post('/api/quotes').send(bad).expect(422);
    expect(res.body.error.code).toBe('validation_error');
    expect(res.body.error.details[0].path).toBe('validDays');
  });

  it('control de concurrencia: guardar con una versión vieja da 409', async () => {
    const q = await createQuote();
    const { id, number: _n, version, createdAt: _c, updatedAt: _u, ...draft } = q;
    await request(app).put(`/api/quotes/${id}`).send({ version, quote: draft }).expect(200);
    const stale = await request(app).put(`/api/quotes/${id}`).send({ version, quote: draft }).expect(409);
    expect(stale.body.error.code).toBe('conflict');
  });

  it('cambia el estado y limpia el motivo de pérdida si no está perdida', async () => {
    const q = await createQuote();
    const lost = await request(app)
      .patch(`/api/quotes/${q.id}/status`)
      .send({ status: 'lost', lossReason: 'price' })
      .expect(200);
    expect(lost.body.lossReason).toBe('price');
    const won = await request(app).patch(`/api/quotes/${q.id}/status`).send({ status: 'won' }).expect(200);
    expect(won.body.lossReason).toBeNull();
  });

  it('duplica con número nuevo y borra lógicamente', async () => {
    const q = await createQuote();
    const dup = await request(app).post(`/api/quotes/${q.id}/duplicate`).expect(201);
    expect(dup.body.number).toBe('OT-0002');
    expect(dup.body.items[0].description).toBe('Cámara bala IP');
    await request(app).delete(`/api/quotes/${q.id}`).expect(204);
    await request(app).get(`/api/quotes/${q.id}`).expect(404);
    const third = await createQuote();
    expect(third.number).toBe('OT-0003'); // los números no se reutilizan
  });

  it('sustituye: crea una nueva y vincula la anterior', async () => {
    const original = await createQuote();
    const res = await request(app).post(`/api/quotes/${original.id}/supersede`).expect(201);
    expect(res.body.number).toBe('OT-0002');
    expect(res.body.supersedesNumber).toBe('OT-0001');
    expect(res.body.supersededByNumber).toBeNull();

    const old = await request(app).get(`/api/quotes/${original.id}`).expect(200);
    expect(old.body.status).toBe('replaced');
    expect(old.body.supersededByNumber).toBe('OT-0002');

    const list = await request(app).get('/api/quotes').expect(200);
    const row = list.body.find((q: Quote) => q.number === 'OT-0001');
    expect(row).toMatchObject({ status: 'replaced', supersededByNumber: 'OT-0002' });

    // Una copia normal no hereda el vínculo.
    const dup = await request(app).post(`/api/quotes/${res.body.id}/duplicate`).expect(201);
    expect(dup.body.supersedesNumber).toBeNull();

    // No se puede sustituir dos veces la misma cotización.
    await request(app).post(`/api/quotes/${original.id}/supersede`).expect(409);
  });

  it('guarda el tipo de servicio en el resumen', async () => {
    const draft = sampleDraft();
    draft.serviceType = 'preventive';
    const q = await createQuote(draft);
    const list = await request(app).get('/api/quotes').expect(200);
    expect(list.body.find((x: Quote) => x.id === q.id)?.serviceType).toBe('preventive');
  });

  it('aprende el catálogo al guardar', async () => {
    await createQuote();
    const res = await request(app).get('/api/catalog?q=cámara').expect(200);
    expect(res.body.items[0]).toMatchObject({ description: 'Cámara bala IP', unitPrice: 183_200 });
  });

  it('genera el análisis de costos en Excel', async () => {
    const q = await createQuote();
    const res = await request(app)
      .get(`/api/quotes/${q.id}/cost-analysis.xlsx`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const wb = XLSX.read(res.body as Buffer, { type: 'buffer' });
    expect(wb.SheetNames).toEqual([
      'Resumen auditoría',
      'Materiales y M.O.',
      'Personal fijo',
      'Otros costos',
    ]);
  });
});

describe('importación', () => {
  it('lee un Excel de proveedor', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Descripción', 'Cantidad', 'Precio unitario'],
        ['Cámara domo IP', 6, 210000],
      ]),
      'Hoja1',
    );
    const file = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const res = await request(app)
      .post('/api/imports/spreadsheet')
      .attach('file', file, 'proveedor.xlsx')
      .expect(200);
    expect(res.body.rows).toEqual([
      { description: 'Cámara domo IP', unit: 'UN', quantity: 6, currency: 'COP', unitPrice: 210000 },
    ]);
  });

  it('documento: adjunta a la cotización y extrae con IA', async () => {
    const q = await createQuote();
    const res = await request(app)
      .post('/api/imports/document')
      .field('quoteId', q.id)
      .attach('file', PDF_BYTES, 'cotizacion.pdf')
      .expect(200);
    expect(res.body.method).toBe('ai');
    expect(res.body.rows[0].description).toBe('Detector de humo');
    const list = await request(app).get(`/api/quotes/${q.id}/attachments`).expect(200);
    expect(list.body[0]).toMatchObject({ fileName: 'cotizacion.pdf', mimeType: 'application/pdf' });
    await request(app)
      .get(`/api/attachments/${list.body[0].id}/file`)
      .expect(200)
      .expect('Content-Type', /pdf/);
  });

  it('rechaza archivos que no son PDF ni imagen aunque digan .pdf', async () => {
    const res = await request(app)
      .post('/api/imports/document')
      .attach('file', Buffer.from('<script>alert(1)</script>'), 'malo.pdf')
      .expect(400);
    expect(res.body.error.code).toBe('bad_request');
  });
});

describe('respaldo', () => {
  it('importa el respaldo del cotizador v68 y conserva los números', async () => {
    const legacy = {
      version: 1,
      fecha: '2026-05-01',
      index: [{ id: 'OT-0007' }],
      quotes: {
        'OT-0007': {
          quoteId: 'OT-0007',
          clientName: 'Cliente legado',
          estado: 'Aprobada',
          unidadNegocio: 'Incendios',
          items: [{ id: 'x', desc: 'Detector', qty: 2, price: 100000, currency: 'COP', moPct: 35 }],
          attachments: [
            { name: 'prov.pdf', data: `data:application/pdf;base64,${PDF_BYTES.toString('base64')}` },
          ],
        },
      },
    };
    const res = await request(app)
      .post('/api/backup/import')
      .attach('file', Buffer.from(JSON.stringify(legacy)), 'respaldo.json')
      .expect(200);
    expect(res.body).toMatchObject({ imported: 1, attachments: 1 });

    const list = await request(app).get('/api/quotes').expect(200);
    expect(list.body[0]).toMatchObject({ number: 'OT-0007', status: 'won', businessUnit: 'fire' });
    const next = await createQuote();
    expect(next.number).toBe('OT-0008');
  });

  it('una cotización eliminada libera su número para la importación', async () => {
    const empty = await createQuote();
    expect(empty.number).toBe('OT-0001');
    await request(app).delete(`/api/quotes/${empty.id}`).expect(204);
    const legacy = {
      version: 1,
      fecha: '2026-10-12',
      index: [{ id: 'OT-0001' }],
      quotes: { 'OT-0001': { quoteId: 'OT-0001', clientName: 'Cliente legado', items: [] } },
    };
    const res = await request(app)
      .post('/api/backup/import')
      .attach('file', Buffer.from(JSON.stringify(legacy)), 'respaldo.json')
      .expect(200);
    expect(res.body.warnings).toEqual([]);
    const list = await request(app).get('/api/quotes').expect(200);
    expect(list.body.map((q: Quote) => q.number)).toEqual(['OT-0001']);
  });

  it('exporta y reimporta el formato nuevo', async () => {
    await createQuote();
    const exp = await request(app).get('/api/backup/export').expect(200);
    const res = await request(app)
      .post('/api/backup/import')
      .attach('file', Buffer.from(exp.text), 'respaldo.json')
      .expect(200);
    expect(res.body.imported).toBe(1);
    const list = await request(app).get('/api/quotes').expect(200);
    expect(list.body.map((q: Quote) => q.number).sort()).toEqual(['OT-0001', 'OT-0002']);
  });
});

describe('otros módulos', () => {
  it('TRM oficial', async () => {
    const res = await request(app).get('/api/exchange-rate').expect(200);
    expect(res.body).toMatchObject({ rate: 4012.55, source: 'trm-oficial', validOn: '2026-10-08' });
  });

  it('indicadores', async () => {
    const q = await createQuote();
    await request(app).patch(`/api/quotes/${q.id}/status`).send({ status: 'won' }).expect(200);
    const res = await request(app).get('/api/analytics/dashboard').expect(200);
    expect(res.body.byStatus.won.count).toBe(1);
    expect(res.body.closeRatePct).toBe(100);
  });

  it('configuración de la empresa', async () => {
    const current = (await request(app).get('/api/settings/company').expect(200)).body;
    const saved = await request(app)
      .put('/api/settings/company')
      .send({ ...current, signatoryName: 'Nombre de prueba' })
      .expect(200);
    expect(saved.body.signatoryName).toBe('Nombre de prueba');
  });

  it('404 en rutas desconocidas de la API', async () => {
    await request(app).get('/api/no-existe').expect(404);
  });
});
