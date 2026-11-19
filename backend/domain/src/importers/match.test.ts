import { describe, expect, it } from 'vitest';
import type { ImportedRow } from '../schemas';
import { matchPrices, type MatchTargetItem, type PriceMatchResult } from './match';

/**
 * Caso real: licitación Constructora Bolívar (Torre Mar / Torre Sierra, 25 ítems del cliente) y
 * las dos cotizaciones de proveedor con que se armó el precio.
 */
const LIST: Array<[string, string, string, number]> = [
  ['1', 'TORRE MAR', 'Adaptador Terminal Ø 3/4"', 444],
  ['2', 'TORRE MAR', 'Fuente auxiliar', 1],
  ['3', 'TORRE MAR', 'Sirena Estrobo de cielo de 15C', 55],
  ['4', 'TORRE MAR', 'Sirena de estrobo de cielo de 75C', 28],
  ['5', 'TORRE MAR', 'Estacion Manual', 6],
  ['6', 'TORRE MAR', 'Detector de Humo fotoeléctrico', 127],
  ['7', 'TORRE MAR', 'Curva ConduitTL Ø 3/4"', 128],
  ['8', 'TORRE MAR', 'Alarma de humo', 111],
  ['9', 'TORRE MAR', 'Curva SDI EMT Ø 3/4"', 17],
  ['10', 'TORRE MAR', 'Fuente Auxiliar NAC', 3],
  ['11', 'TORRE MAR', 'Modulo de entrada', 4],
  ['12', 'TORRE MAR', 'Tuberia SDI PVC TL Ø 3/4"', 1047.08],
  ['13', 'TORRE MAR', 'Tuberia SDI EMT Ø 3/4"', 398.18],
  ['14', 'TORRE SIERRA', 'Adaptador Terminal Ø 3/4"', 368],
  ['15', 'TORRE SIERRA', 'Sirena Estrobo de cielo de 15C', 55],
  ['16', 'TORRE SIERRA', 'Sirena de estrobo de cielo de 75C', 15],
  ['17', 'TORRE SIERRA', 'Estacion Manual', 6],
  ['18', 'TORRE SIERRA', 'Detector de Humo fotoeléctrico', 95],
  ['19', 'TORRE SIERRA', 'Curva ConduitTL Ø 3/4"', 128],
  ['20', 'TORRE SIERRA', 'Alarma de humo', 20],
  ['21', 'TORRE SIERRA', 'Detector de doble tecnología', 11],
  ['22', 'TORRE SIERRA', 'Fuente Auxiliar NAC', 2],
  ['23', 'TORRE SIERRA', 'Panel de detencion', 1],
  ['24', 'TORRE SIERRA', 'Tuberia SDI PVC TL Ø 3/4"', 779.51],
  ['25', 'TORRE SIERRA', 'Tuberia SDI EMT Ø 3/4"', 8.1],
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

/** Eléctricos del Valle SO-945163 (canalización, sin grupos). */
const ELECTROVALLE: ImportedRow[] = [
  row('ADAPTADOR 3/4" PVC PAVCO', 444, 352),
  row('CURVA 3/4" PVC NACIONAL CONDUIT (90° / 1 CAMPANA) - TUBOSA/IMEC', 128, 701),
  row('CURVA 3/4" EMT UL CERTIFICADO', 17, 1030),
  row('TUBO 3/4" EMT 3MTS S/UNION - DK1142 UL BINSON', 398, 19293),
  row('TUBO 3/4" PVC 3MTS (TUBOSA)', 1047, 4088),
  row('ADAPTADOR 3/4" EMT ACERO UL 451', 368, 864),
  row('CURVA 3/4" EMT UL CERTIFICADO', 128, 1030),
  row('TUBO 3/4" PVC 3MTS (TUBOSA)', 779, 4088),
  row('TUBO 3/4" EMT 3MTS S/UNION - DK1142 UL BINSON', 81, 19293),
];

const TM = { group: 'TORRE MAR' };
const TS = { group: 'TORRE SIERRA' };
/** SAC Tecnología 443600 (equipos Edwards/Dahua, con grupos por torre). */
const SAC: ImportedRow[] = [
  row('Fuente de poder de respaldo remota, 6.5A, 120VAC, roja, 4 NACS', 4, 955930.42, {
    ...TM,
    reference: 'BPS6A',
  }),
  row('Sirena-Estrobo de Techo, 15-115 cd, Red, etiqueta de FUEGO. GRSW-1 Incluido', 83, 166337.98, {
    ...TM,
    reference: 'GCAVRF-SP-1',
  }),
  row('Estación manual de alarma de fuego de doble acción para paneles VS', 6, 120732.38, {
    ...TM,
    reference: 'GSA-M278',
  }),
  row('Detector de humo óptico inteligente multicriterio Kidde, listado UL / ULC / CSFM.', 127, 95679.09, {
    ...TM,
    reference: 'KI-OSD',
  }),
  row('Base para detector estándar', 127, 10557.46, { ...TM, reference: 'KI-SB' }),
  row('Detector de humo autónomo (funciona con 2 pilas alcalinas de 1,5V reemplazables)', 111, 11053.9, {
    ...TM,
    reference: 'DHI-HY-SA13A',
  }),
  row('Módulo de una entrada para paneles VS o VM', 4, 73339.63, { ...TM, reference: 'GSA-CT1' }),
  row('Sirena-Estrobo de Techo, 15-115 cd, Red, etiqueta de FUEGO. GRSW-1 Incluido', 70, 166337.98, {
    ...TS,
    reference: 'GCAVRF-SP-1',
  }),
  row('Estación manual de alarma de fuego de doble acción para paneles VS', 6, 120732.38, {
    ...TS,
    reference: 'GSA-M278',
  }),
  row('Base para detector estándar', 95, 10557.46, { ...TS, reference: 'KI-SB' }),
  row('Detector de humo autónomo (funciona con 2 pilas alcalinas de 1,5V reemplazables)', 20, 11053.9, {
    ...TS,
    reference: 'DHI-HY-SA13A',
  }),
  row(
    'Detector óptico inteligente de humo y calor multicriterio Kidde, 135F con 15F / min ROR, listado UL',
    11,
    122718.11,
    { ...TS, reference: 'KI-OSHD' },
  ),
  row('Base para detector estándar', 11, 10557.46, { ...TS, reference: 'KI-SB' }),
  row('Fuente de poder de respaldo remota, 6.5A, 120VAC, roja, 4 NACS', 2, 955930.42, {
    ...TS,
    reference: 'BPS6A',
  }),
  row(
    'Sistema de cuatro bucles con un bucle incorporado de 250 puntos, 110 v/220v, puerta gris, serie EVOLVE',
    1,
    2941461.85,
    { ...TS, reference: 'EVOLVE-ML-G' },
  ),
  row(
    'Módulo de expansión SLC, dos bucles de 250 dispositivos, 500 dispositivos en total, serie EVOLVE',
    1,
    1797218.03,
    { ...TS, reference: 'EVOLVE-SLC-500' },
  ),
];

const of = (res: PriceMatchResult, ref: string) => res.items.find((i) => i.itemId === `it-${ref}`)!;
const rowsOf = (res: PriceMatchResult, ref: string) =>
  of(res, ref)
    .links.map((l) => l.row)
    .sort((a, b) => a - b);

describe('matchPrices — canalización (Eléctricos del Valle)', () => {
  const res = matchPrices(items, ELECTROVALLE);

  it('relaciona cada línea con su ítem por material y cantidad, sin crear ítems', () => {
    expect(rowsOf(res, '1')).toEqual([0]); // adaptador PVC 444
    expect(rowsOf(res, '7')).toEqual([1]); // curva PVC 128 (Torre Mar)
    expect(rowsOf(res, '9')).toEqual([2]); // curva EMT 17
    expect(rowsOf(res, '13')).toEqual([3]); // tubo EMT 398
    expect(rowsOf(res, '12')).toEqual([4]); // tubo PVC 1047
    expect(rowsOf(res, '14')).toEqual([5]); // adaptador EMT 368
    expect(rowsOf(res, '19')).toEqual([6]); // curva EMT 128 → curva Conduit (Torre Sierra)
    expect(rowsOf(res, '24')).toEqual([7]); // tubo PVC 779
    expect(rowsOf(res, '25')).toEqual([8]); // tubo EMT 81
    expect(res.unmatchedRows).toEqual([]);
    expect(of(res, '1').unitPrice).toBe(352);
  });

  it('alerta material distinto, error de coma y precio por tubo', () => {
    expect(of(res, '19').status).toBe('review');
    expect(of(res, '19').warnings.join(' ')).toMatch(/Material distinto.*PVC.*EMT/);
    expect(of(res, '25').warnings.join(' ')).toMatch(/posible error de coma/);
    expect(of(res, '12').warnings.join(' ')).toMatch(/tubo de 3 m/);
    expect(of(res, '1').status).toBe('ok');
  });

  it('los equipos que este proveedor no cotiza quedan sin precio', () => {
    expect(of(res, '6').status).toBe('none');
    expect(res.message).toMatch(/9 de 25 ítems/);
  });
});

describe('matchPrices — equipos (SAC Tecnología)', () => {
  const res = matchPrices(items, SAC);

  it('reparte una línea entre varios ítems cuando la cantidad es la suma', () => {
    expect(rowsOf(res, '3')).toEqual([1]);
    expect(rowsOf(res, '4')).toEqual([1]);
    expect(of(res, '3').links[0]!.kind).toBe('shared');
    expect(rowsOf(res, '2')).toEqual([0]);
    expect(rowsOf(res, '10')).toEqual([0]);
    expect(rowsOf(res, '15')).toEqual([7]);
    expect(rowsOf(res, '16')).toEqual([7]);
    expect(of(res, '3').unitPrice).toBeCloseTo(166337.98, 2);
  });

  it('suma los componentes (detector + base, panel + módulo de expansión)', () => {
    expect(rowsOf(res, '6')).toEqual([3, 4]);
    expect(of(res, '6').unitPrice).toBeCloseTo(95679.09 + 10557.46, 2);
    expect(of(res, '6').status).toBe('ok');
    expect(rowsOf(res, '21')).toEqual([11, 12]);
    expect(rowsOf(res, '23')).toEqual([14, 15]);
    expect(of(res, '23').unitPrice).toBeCloseTo(2941461.85 + 1797218.03, 2);
  });

  it('respeta la torre de cada línea', () => {
    expect(rowsOf(res, '5')).toEqual([2]);
    expect(rowsOf(res, '17')).toEqual([8]);
    expect(rowsOf(res, '8')).toEqual([5]);
    expect(rowsOf(res, '20')).toEqual([10]);
    expect(rowsOf(res, '11')).toEqual([6]);
    expect(rowsOf(res, '22')).toEqual([13]);
  });

  it('avisa cuando solo llegó el accesorio (falta el detector de Torre Sierra)', () => {
    expect(rowsOf(res, '18')).toEqual([9]);
    expect(of(res, '18').status).toBe('review');
    expect(of(res, '18').warnings.join(' ')).toMatch(/falta el equipo principal/);
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
