import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { analyzeBid, computeQuote, createEmptyDraft } from '@ggis/domain';
import { readBidWorkbook } from './bid-workbook';

/** Libro ficticio con la misma estructura del análisis de precios de licitación. */
function fakeWorkbook(): Buffer {
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: unknown[][]) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  add('RESUMEN', [
    ['Edificio Demo – Red de detección: revisión de precios y oferta económica'],
    [
      'Cliente: Constructora Ejemplo S.A.S. · Licify inv-000 · Calle 1 # 2-3, Ciudad Demo · Preparado 01-ene-2026',
    ],
  ]);
  add('PARAMETROS', [
    ['Parámetros del presupuesto'],
    [],
    [],
    ['Parámetro', 'Valor'],
    ['TRM (COP/USD)', 4000],
    ['Factor de importación precios tienda USA', 1.3],
    ['IVA', 0.19],
    ['Desperdicio tubería y cable', 0.05],
    ['Escalamiento precios BD', 1.05],
    ['Herramienta menor y equipo (% de MO)', 0.05],
    ['Plazo total del contrato (meses)', 3],
    ['Meses con personal en campo', 2],
  ]);
  add('INSUMOS', [
    ['Base de precios'],
    [],
    [],
    ['Código', 'Descripción', 'Und', 'Valor base', 'Tipo', 'Precio COP', 'Fuente'],
    ['EQ01', 'Detector de humo', 'und', 50, 'USD', null, 'tienda.com'],
    ['MA01', 'Cable FPLR', 'ml', 2000, 'BD', null, 'Lista 2024'],
    ['MO01', 'Pareja electricista', 'día', 300000, 'MO', null, 'Estimado – verificar'],
  ]);
  add('APU', [
    ['APU'],
    [],
    [],
    ['Ítem', 'Tipo', 'Código', 'Descripción', 'Und', 'Cantidad', 'Rend.', 'Cant. ef.', 'Desp.'],
    ['1.1', null, null, 'Detector de humo instalado', 'und'],
    [null, 'EQ', 'EQ01', null, null, 1, null, null, 0],
    [null, 'MO', 'MO01', null, null, null, 15, null, 0],
    [null, 'HER', null, 'Herramienta', null, null, null, null, 0.05],
    ['1.2', null, null, 'Cable FPLR', 'ml'],
    [null, 'MAT', 'MA01', null, null, 1, null, null, 0.05],
    [null, 'MO', 'MO01', null, null, null, 250, null, 0],
  ]);
  add('REVISION PRECIOS', [
    ['Revisión'],
    [],
    [],
    ['Ítem', 'Descripción', 'Und', 'Cantidad', 'PU subcontratista'],
    ['1.1', 'Detector de humo instalado', 'und', 10, 400000],
    ['1.2', 'Cable FPLR', 'ml', 300, 4000],
  ]);
  const aiu = XLSX.utils.aoa_to_sheet([
    ['AIU'],
    [],
    [],
    ['Concepto', 'Costo mensual', 'Dedicación', 'Meses', 'Valor'],
    ['A.1 Personal de administración'],
    ['Ingeniero residente', 10000000, 0.2, 3],
    ['Supervisor', 5000000, 0.5, 2],
    ['A.2 Gastos generales'],
    ['Transporte', 1000000],
    ['Subtotal administración de obra y oficina'],
    ['A.3 Otros costos indirectos'],
    ['Pólizas', null, 0.012],
    ['Subtotal otros indirectos'],
    ['% Imprevistos', null, null, null, 0.05],
    ['% Utilidad', null, null, null, 0.12],
    ['Componente', 'Valor', 'Participación', 'Tope'],
    ['Materiales y equipos suministrados', null, null, 0.5],
    ['Mano de obra con prestaciones', null, null, 0.25],
    ['Administración de obra y oficina (A.1 + A.2)', null, null, 0.15],
  ]);
  aiu['D6'] = { t: 'n', v: 3, f: 'PARAMETROS!$B$11' };
  aiu['D7'] = { t: 'n', v: 2, f: 'PARAMETROS!$B$12' };
  XLSX.utils.book_append_sheet(wb, aiu, 'AIU');
  add('LICIFY', [
    ['Licify'],
    [],
    [],
    ['Tiempo de entrega', '90 días calendario'],
    ['Validez de la oferta', '30 días calendario'],
    ['Anticipo', 0.4],
    ['Cortes de obra', 0.5],
    ['Contra entrega', 0.1],
  ]);
  add('ACLARACIONES', [
    ['Aclaraciones'],
    [],
    ['N°', 'Tema', 'Observación', 'Impacto'],
    [1, 'Obra civil', 'No incluye regatas', 'Exclusión'],
  ]);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('readBidWorkbook', () => {
  it('lee parámetros, insumos, APU, revisión, AIU, Licify y aclaraciones', () => {
    const r = readBidWorkbook(fakeWorkbook());
    expect(r.exchangeRate).toBe(4000);
    expect(r.client).toEqual({
      name: 'Constructora Ejemplo S.A.S.',
      project: 'Edificio Demo – Red de detección',
      city: 'Ciudad Demo',
    });
    expect(r.apuParams).toEqual({
      importFactor: 1.3,
      wastePct: 5,
      escalationFactor: 1.05,
      toolsPctOfLabor: 5,
    });
    expect(r.supplies.map((s) => [s.code, s.type, s.priceType, s.estimated])).toEqual([
      ['EQ01', 'EQ', 'USD', false],
      ['MA01', 'MAT', 'LIST', false],
      ['MO01', 'MO', 'COP', true],
    ]);
    expect(r.items).toHaveLength(2);
    expect(r.items[0]!.apu).toHaveLength(2); // la línea HER se calcula, no se importa
    expect(r.items[1]!.apu![0]!.applyWaste).toBe(true);
    expect(r.items[0]!.subcontractorUnitPrice).toBe(400000);
    expect(r.bid.adminMode).toBe('breakdown');
    expect(r.bid.adminPersonnel.map((p) => p.period)).toEqual(['contract', 'field']);
    expect(r.bid.adminIndirects[0]!.pct).toBeCloseTo(1.2, 6);
    expect(r.aiu).toEqual({ contingencyPct: 5, profitPct: 12 });
    expect(r.bid.caps).toMatchObject({
      enabled: true,
      materialsMaxPct: 50,
      laborMaxPct: 25,
      adminMaxPct: 15,
    });
    expect(r.terms).toMatchObject({ advancePct: 40, progressPct: 50, onDeliveryPct: 10 });
    expect(r.validDays).toBe(30);
    expect(r.bid.clarifications[0]!.topic).toBe('Obra civil');
    expect(r.warnings).toEqual([]);
  });

  it('el APU importado calcula el costo con las fórmulas del Excel', () => {
    const r = readBidWorkbook(fakeWorkbook());
    const d = createEmptyDraft();
    Object.assign(d, {
      exchangeRate: r.exchangeRate,
      apuParams: r.apuParams,
      supplies: r.supplies,
      items: r.items,
      bid: r.bid,
    });
    d.staff = [];
    d.pricing.method = 'aiu_bid';
    d.pricing.aiu = { ...d.pricing.aiu, ...r.aiu };
    const b = computeQuote(d);
    // 1.1 = 50 USD × 4000 × 1,3 × 1,19 + 300.000/15 × 1,05 (M.O. + 5% herramienta)
    const detector = 50 * 4000 * 1.3 * 1.19 + (300000 / 15) * 1.05;
    expect(b.items[0]!.unitCost).toBeCloseTo(detector, 6);
    expect(b.items[0]!.saleUnitPrice).toBe(Math.round(detector));
    // A = (10M×20%×3 + 5M×50%×2 + 1M + 1,2%×CD) / CD
    const cd = b.totals.subtotal;
    expect(b.aiuAdminPct).toBeCloseTo(
      Math.round(((6_000_000 + 5_000_000 + 1_000_000 + 0.012 * cd) / cd) * 10_000) / 100,
      6,
    );
    const a = analyzeBid(d, b);
    expect(a.review?.rows).toHaveLength(2);
    expect(a.caps.map((c) => c.key)).toEqual(['materials', 'labor', 'admin']);
    expect(a.licify.supply + a.licify.installation).toBeCloseTo(cd, 6);
  });

  it('rechaza libros que no son de análisis de precios', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['hola']]), 'Hoja1');
    expect(() => readBidWorkbook(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer)).toThrow(
      /INSUMOS y APU/,
    );
  });
});
