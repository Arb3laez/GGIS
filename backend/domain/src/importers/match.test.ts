import { describe, expect, it } from 'vitest';
import type { ImportedRow } from '../schemas';
import { evaluateLinks, matchPrices, type MatchTargetItem, type PriceMatchResult } from './match';

/**
 * Caso de ejemplo con datos ficticios (cliente, proveedores y precios inventados): lista del
 * cliente con 25 ítems en dos torres y dos cotizaciones de proveedor.
 */
const LIST: Array<[string, string, string, number]> = [
  ['1', 'TORRE A', 'Adaptador Terminal Ø 3/4"', 444],
  ['2', 'TORRE A', 'Fuente auxiliar', 1],
  ['3', 'TORRE A', 'Sirena Estrobo de cielo de 15C', 55],
  ['4', 'TORRE A', 'Sirena de estrobo de cielo de 75C', 28],
  ['5', 'TORRE A', 'Estacion Manual', 6],
  ['6', 'TORRE A', 'Detector de Humo fotoeléctrico', 127],
  ['7', 'TORRE A', 'Curva ConduitTL Ø 3/4"', 128],
  ['8', 'TORRE A', 'Alarma de humo', 111],
  ['9', 'TORRE A', 'Curva SDI EMT Ø 3/4"', 17],
  ['10', 'TORRE A', 'Fuente Auxiliar NAC', 3],
  ['11', 'TORRE A', 'Modulo de entrada', 4],
  ['12', 'TORRE A', 'Tuberia SDI PVC TL Ø 3/4"', 1047.08],
  ['13', 'TORRE A', 'Tuberia SDI EMT Ø 3/4"', 398.18],
  ['14', 'TORRE B', 'Adaptador Terminal Ø 3/4"', 368],
  ['15', 'TORRE B', 'Sirena Estrobo de cielo de 15C', 55],
  ['16', 'TORRE B', 'Sirena de estrobo de cielo de 75C', 15],
  ['17', 'TORRE B', 'Estacion Manual', 6],
  ['18', 'TORRE B', 'Detector de Humo fotoeléctrico', 95],
  ['19', 'TORRE B', 'Curva ConduitTL Ø 3/4"', 128],
  ['20', 'TORRE B', 'Alarma de humo', 20],
  ['21', 'TORRE B', 'Detector de doble tecnología', 11],
  ['22', 'TORRE B', 'Fuente Auxiliar NAC', 2],
  ['23', 'TORRE B', 'Panel de detencion', 1],
  ['24', 'TORRE B', 'Tuberia SDI PVC TL Ø 3/4"', 779.51],
  ['25', 'TORRE B', 'Tuberia SDI EMT Ø 3/4"', 8.1],
];
const items: MatchTargetItem[] = LIST.map(([ref, group, description, quantity]) => ({
  id: `it-${ref}`,
  clientRef: ref,
  group,
  description,
  unit: 'Und',
  quantity,
}));

const row = (
  description: string,
  quantity: number,
  unitPrice: number,
  extra: Partial<ImportedRow> = {},
): ImportedRow => ({
  description,
  unit: 'UN',
  quantity,
  currency: 'COP',
  unitPrice,
  ...extra,
});

/** Proveedor A (ficticio): canalización, sin grupos. */
const PROVEEDOR_A: ImportedRow[] = [
  row('ADAPTADOR 3/4" PVC PAVCO', 444, 1000),
  row('CURVA 3/4" PVC NACIONAL CONDUIT (90° / 1 CAMPANA) - TUBOSA/IMEC', 128, 2000),
  row('CURVA 3/4" EMT UL CERTIFICADO', 17, 3000),
  row('TUBO 3/4" EMT 3MTS S/UNION - DK1142 UL BINSON', 398, 50000),
  row('TUBO 3/4" PVC 3MTS (TUBOSA)', 1047, 10000),
  row('ADAPTADOR 3/4" EMT ACERO UL 451', 368, 1500),
  row('CURVA 3/4" EMT UL CERTIFICADO', 128, 3000),
  row('TUBO 3/4" PVC 3MTS (TUBOSA)', 779, 10000),
  row('TUBO 3/4" EMT 3MTS S/UNION - DK1142 UL BINSON', 81, 50000),
];

const TM = { group: 'TORRE A' };
const TS = { group: 'TORRE B' };
/** Proveedor B (ficticio): equipos, con grupos por torre. */
const PROVEEDOR_B: ImportedRow[] = [
  row('Fuente de poder de respaldo remota, 6.5A, 120VAC, roja, 4 NACS', 4, 900000, {
    ...TM,
    reference: 'BPS6A',
  }),
  row('Sirena-Estrobo de Techo, 15-115 cd, Red, etiqueta de FUEGO. GRSW-1 Incluido', 83, 150000, {
    ...TM,
    reference: 'GCAVRF-SP-1',
  }),
  row('Estación manual de alarma de fuego de doble acción para paneles VS', 6, 120000, {
    ...TM,
    reference: 'GSA-M278',
  }),
  row('Detector de humo óptico inteligente multicriterio Kidde, listado UL / ULC / CSFM.', 127, 90000, {
    ...TM,
    reference: 'KI-OSD',
  }),
  row('Base para detector estándar', 127, 10000, { ...TM, reference: 'KI-SB' }),
  row('Detector de humo autónomo (funciona con 2 pilas alcalinas de 1,5V reemplazables)', 111, 12000, {
    ...TM,
    reference: 'DHI-HY-SA13A',
  }),
  row('Módulo de una entrada para paneles VS o VM', 4, 70000, { ...TM, reference: 'GSA-CT1' }),
  row('Sirena-Estrobo de Techo, 15-115 cd, Red, etiqueta de FUEGO. GRSW-1 Incluido', 70, 150000, {
    ...TS,
    reference: 'GCAVRF-SP-1',
  }),
  row('Estación manual de alarma de fuego de doble acción para paneles VS', 6, 120000, {
    ...TS,
    reference: 'GSA-M278',
  }),
  row('Base para detector estándar', 95, 10000, { ...TS, reference: 'KI-SB' }),
  row('Detector de humo autónomo (funciona con 2 pilas alcalinas de 1,5V reemplazables)', 20, 12000, {
    ...TS,
    reference: 'DHI-HY-SA13A',
  }),
  row(
    'Detector óptico inteligente de humo y calor multicriterio Kidde, 135F con 15F / min ROR, listado UL',
    11,
    125000,
    { ...TS, reference: 'KI-OSHD' },
  ),
  row('Base para detector estándar', 11, 10000, { ...TS, reference: 'KI-SB' }),
  row('Fuente de poder de respaldo remota, 6.5A, 120VAC, roja, 4 NACS', 2, 900000, {
    ...TS,
    reference: 'BPS6A',
  }),
  row(
    'Sistema de cuatro bucles con un bucle incorporado de 250 puntos, 110 v/220v, puerta gris, serie EVOLVE',
    1,
    3000000,
    { ...TS, reference: 'EVOLVE-ML-G' },
  ),
  row(
    'Módulo de expansión SLC, dos bucles de 250 dispositivos, 500 dispositivos en total, serie EVOLVE',
    1,
    1800000,
    { ...TS, reference: 'EVOLVE-SLC-500' },
  ),
];

const of = (res: PriceMatchResult, ref: string) => res.items.find((i) => i.itemId === `it-${ref}`)!;
const rowsOf = (res: PriceMatchResult, ref: string) =>
  of(res, ref)
    .links.map((l) => l.row)
    .sort((a, b) => a - b);

describe('matchPrices — canalización (proveedor A)', () => {
  const res = matchPrices(items, PROVEEDOR_A);

  it('relaciona cada línea con su ítem por material y cantidad, sin crear ítems', () => {
    expect(rowsOf(res, '1')).toEqual([0]); // adaptador PVC 444
    expect(rowsOf(res, '7')).toEqual([1]); // curva PVC 128 (Torre A)
    expect(rowsOf(res, '9')).toEqual([2]); // curva EMT 17
    expect(rowsOf(res, '13')).toEqual([3]); // tubo EMT 398
    expect(rowsOf(res, '12')).toEqual([4]); // tubo PVC 1047
    expect(rowsOf(res, '14')).toEqual([5]); // adaptador EMT 368
    expect(rowsOf(res, '19')).toEqual([6]); // curva EMT 128 → curva Conduit (Torre B)
    expect(rowsOf(res, '24')).toEqual([7]); // tubo PVC 779
    expect(rowsOf(res, '25')).toEqual([8]); // tubo EMT 81
    expect(res.unmatchedRows).toEqual([]);
    expect(of(res, '1').unitPrice).toBe(1000);
  });

  it('alerta material distinto, error de coma y tubos de más', () => {
    expect(of(res, '19').status).toBe('review');
    expect(of(res, '19').warnings.join(' ')).toMatch(/Material distinto.*PVC.*EMT/);
    expect(of(res, '25').warnings.join(' ')).toMatch(/error de coma/);
    expect(of(res, '12').warnings.join(' ')).toMatch(/cotizó 1047 tubos.*bastan 350 tubos/);
    expect(of(res, '1').status).toBe('ok');
  });

  it('pone la tubería por metro cuando el cliente pide metros y el proveedor vende tubos de 3 m', () => {
    expect(of(res, '12').links[0]!.factor).toBeCloseTo(1 / 3, 6);
    expect(of(res, '12').unitPrice).toBeCloseTo(10000 / 3, 2);
    expect(of(res, '12').notes.join(' ')).toMatch(/Precio por metro/);
    // Las curvas y adaptadores se cotizan por unidad.
    expect(of(res, '1').links[0]!.factor).toBe(1);
  });

  it('los equipos que este proveedor no cotiza quedan sin precio', () => {
    expect(of(res, '6').status).toBe('none');
    expect(res.message).toMatch(/9 de 25 ítems/);
  });
});

describe('matchPrices — equipos (proveedor B)', () => {
  const res = matchPrices(items, PROVEEDOR_B);

  it('reparte una línea entre varios ítems cuando la cantidad es la suma', () => {
    expect(rowsOf(res, '3')).toEqual([1]);
    expect(rowsOf(res, '4')).toEqual([1]);
    expect(of(res, '3').links[0]!.kind).toBe('shared');
    expect(rowsOf(res, '2')).toEqual([0]);
    expect(rowsOf(res, '10')).toEqual([0]);
    expect(rowsOf(res, '15')).toEqual([7]);
    expect(rowsOf(res, '16')).toEqual([7]);
    expect(of(res, '3').unitPrice).toBeCloseTo(150000, 2);
  });

  it('suma los componentes (detector + base, panel + módulo de expansión)', () => {
    expect(rowsOf(res, '6')).toEqual([3, 4]);
    expect(of(res, '6').unitPrice).toBeCloseTo(90000 + 10000, 2);
    expect(of(res, '6').status).toBe('ok');
    expect(rowsOf(res, '21')).toEqual([11, 12]);
    expect(rowsOf(res, '23')).toEqual([14, 15]);
    expect(of(res, '23').unitPrice).toBeCloseTo(3000000 + 1800000, 2);
  });

  it('respeta la torre de cada línea', () => {
    expect(rowsOf(res, '5')).toEqual([2]);
    expect(rowsOf(res, '17')).toEqual([8]);
    expect(rowsOf(res, '8')).toEqual([5]);
    expect(rowsOf(res, '20')).toEqual([10]);
    expect(rowsOf(res, '11')).toEqual([6]);
    expect(rowsOf(res, '22')).toEqual([13]);
  });

  it('si solo llegó la base, toma el precio del detector de la otra torre y pide cotizarlo', () => {
    expect(rowsOf(res, '18')).toEqual([3, 9]);
    const ref = of(res, '18').links.find((l) => l.row === 3)!;
    expect(ref.kind).toBe('reference');
    expect(of(res, '18').unitPrice).toBeCloseTo(90000 + 10000, 2);
    expect(of(res, '18').status).toBe('review');
    expect(of(res, '18').warnings.join(' ')).toMatch(/no cotizó este equipo para TORRE B.*TORRE A/);
  });

  it('un reparto que cuadra no exige revisión (solo una nota)', () => {
    expect(of(res, '3').status).toBe('ok');
    expect(of(res, '3').notes.join(' ')).toMatch(/Línea compartida con ítem 4/);
  });

  it('sin el detector en ninguna torre, avisa que falta el equipo principal', () => {
    const r = matchPrices(
      items,
      PROVEEDOR_B.filter((x) => x.reference !== 'KI-OSD'),
    );
    expect(of(r, '18').warnings.join(' ')).toMatch(/falta el equipo principal/);
  });

  it('todas las líneas quedan relacionadas', () => {
    expect(res.unmatchedRows).toEqual([]);
  });
});

describe('matchPrices — lo que no se puede relacionar', () => {
  it('reporta las líneas sin ítem parecido', () => {
    const res = matchPrices(items, [row('Cámara domo IP 4MP', 3, 350000)]);
    expect(res.unmatchedRows).toHaveLength(1);
    expect(res.unmatchedRows[0]!.reason).toMatch(/No se identificó/);
    expect(res.items.every((i) => i.status === 'none')).toBe(true);
  });
});

describe('evaluateLinks — monedas mezcladas', () => {
  const target: MatchTargetItem[] = [{ id: 'x', description: 'Detector de humo', unit: 'Und', quantity: 2 }];
  const mixed = [row('Detector de humo', 2, 37, { currency: 'USD' }), row('Base para detector', 2, 100000)];
  const links = [
    { row: 0, itemId: 'x', kind: 'direct' as const, factor: 1 },
    { row: 1, itemId: 'x', kind: 'component' as const, factor: 1 },
  ];

  it('convierte a pesos con la TRM antes de sumar', () => {
    const r = evaluateLinks(target, mixed, links, 'rules', 4000).items[0]!;
    expect(r.currency).toBe('COP');
    expect(r.unitPrice).toBe(37 * 4000 + 100000);
    expect(r.blocked).toBeUndefined();
    expect(r.warnings.join(' ')).toMatch(/TRM/);
  });

  it('sin TRM no deja aplicar el ítem', () => {
    const r = evaluateLinks(target, mixed, links, 'rules').items[0]!;
    expect(r.blocked).toBe(true);
    expect(r.unitPrice).toBe(0);
    expect(r.status).toBe('review');
  });
});

describe('matchPrices — accesorio como ítem propio', () => {
  it('si la lista del cliente trae la base aparte, la base va a ese ítem y no se suma al detector', () => {
    const list: MatchTargetItem[] = [
      { id: 'd', description: 'Detector de humo fotoeléctrico', unit: 'Und', quantity: 40 },
      { id: 'b', description: 'Base para detector', unit: 'Und', quantity: 40 },
    ];
    const res = matchPrices(list, [
      row('Detector de humo óptico inteligente', 40, 90000),
      row('Base para detector estándar', 40, 10000),
    ]);
    expect(res.items.find((i) => i.itemId === 'd')!.unitPrice).toBe(90000);
    expect(res.items.find((i) => i.itemId === 'b')!.unitPrice).toBe(10000);
    expect(res.items.find((i) => i.itemId === 'b')!.links[0]!.kind).toBe('direct');
  });
});
