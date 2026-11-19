import { describe, expect, it } from 'vitest';
import { parseQuoteLayout, type TextFragment } from './layout';

/** Datos inventados con la forma de dos PDF reales (una línea por ítem y ítems de varias líneas). */
const frag = (page: number, y: number, x: number, str: string): TextFragment => ({
  page,
  x,
  y,
  str,
  height: 7,
});

describe('parseQuoteLayout — tabla de una línea por ítem', () => {
  const fragments = [
    frag(0, 748, 238, 'SEDE CENTRO'),
    frag(0, 748, 266, 'CRA 4 # 16 - 09 PBX: 602-4850000'),
    frag(0, 650, 28, 'Telefono :'),
    frag(0, 650, 201, '3000000000'),
    frag(0, 620, 33, 'Item'),
    frag(0, 620, 129, 'Descripcion'),
    frag(0, 620, 435, 'Cant'),
    ...[
      [1, 'A-100', '[A-100] ADAPTADOR 3/4" PVC', '444', '350.00', '$ 155,400'],
      [2, 'T-300', '[T-300] TUBO 3/4" EMT 3MTS', '10', '20,000.00', '$ 200,000'],
    ].flatMap(([n, code, desc, q, p, t], i) => {
      const y = 596 - i * 23;
      return [
        frag(0, y, 33, String(n)),
        frag(0, y, 60, String(code)),
        frag(0, y, 129, String(desc)),
        frag(0, y, 439, String(q)),
        frag(0, y, 473, String(p)),
        frag(0, y, 507, '0.0000'),
        frag(0, y, 547, String(t)),
      ];
    }),
    frag(0, 385, 411, 'Subtotal'),
    frag(0, 385, 536, '$ 355,400'),
  ];
  const res = parseQuoteLayout(fragments);

  it('solo toma renglones donde cantidad × valor unitario = total', () => {
    expect(res.rows).toEqual([
      {
        description: 'ADAPTADOR 3/4" PVC',
        unit: 'UN',
        quantity: 444,
        currency: 'COP',
        unitPrice: 350,
        reference: 'A-100',
      },
      {
        description: 'TUBO 3/4" EMT 3MTS',
        unit: 'UN',
        quantity: 10,
        currency: 'COP',
        unitPrice: 20000,
        reference: 'T-300',
      },
    ]);
  });

  it('queda verificado cuando la suma coincide con el subtotal del documento', () => {
    expect(res.total).toBe(355400);
    expect(res.verified).toBe(true);
  });
});

describe('parseQuoteLayout — ítems de varias líneas con grupos', () => {
  const header = (page: number) => [
    frag(page, 744, 230, 'PROVEEDOR EJEMPLO S.A.S'),
    frag(page, 733, 247, 'NIT: 900000000-0'),
  ];
  const fragments = [
    ...header(0),
    frag(0, 466, 28, '1'),
    frag(0, 464, 118, 'TORRE NORTE'),
    frag(0, 444, 485, 'COP'),
    frag(0, 441, 29, '2'),
    frag(0, 441, 430, 'EN STOCK'),
    frag(0, 440, 65, 'PS-6'),
    frag(0, 440, 118, 'Fuente de poder de respaldo, 6.5A, 4 NACS'),
    frag(0, 440, 348, 'MARCA'),
    frag(0, 440, 411, '4'),
    frag(0, 440, 532, 'COP 400,000.00'),
    frag(0, 436, 475, '100,000.00'),
    frag(0, 435, 326, '*D'),
    frag(0, 371, 119, 'Detector de humo óptico inteligente,'),
    frag(0, 369, 29, '3'),
    frag(0, 368, 65, 'DET-OP'),
    frag(0, 368, 407, '10'),
    frag(0, 368, 469, 'COP 90,000.00'),
    frag(0, 368, 528, 'COP 900,000.00'),
    frag(0, 364, 119, 'listado UL.'),
    frag(0, 272, 29, '4'),
    frag(0, 271, 119, 'TORRE SUR'),
    ...header(1),
    frag(1, 600, 68, 'BASE-STD'),
    frag(1, 600, 119, 'Base para detector estándar'),
    frag(1, 600, 409, '5'),
    frag(1, 600, 469, 'COP 10,000.00'),
    frag(1, 600, 532, 'COP 50,000.00'),
    frag(1, 300, 411, 'Sub Total:'),
    frag(1, 300, 500, 'COP 1,350,000.00'),
  ];
  const res = parseQuoteLayout(fragments);

  it('arma la descripción de varias líneas y separa la referencia', () => {
    expect(res.rows.map((r) => [r.reference, r.description, r.quantity, r.unitPrice])).toEqual([
      ['PS-6', 'Fuente de poder de respaldo, 6.5A, 4 NACS MARCA', 4, 100000],
      ['DET-OP', 'Detector de humo óptico inteligente, listado UL.', 10, 90000],
      ['BASE-STD', 'Base para detector estándar', 5, 10000],
    ]);
  });

  it('asigna el grupo de los títulos y no toma el encabezado repetido de cada página', () => {
    expect(res.rows.map((r) => r.group)).toEqual(['TORRE NORTE', 'TORRE NORTE', 'TORRE SUR']);
    expect(res.verified).toBe(true);
  });

  it('sin renglones que cuadren no devuelve nada', () => {
    expect(parseQuoteLayout(header(0)).rows).toEqual([]);
  });
});
