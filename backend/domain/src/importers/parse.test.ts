import { describe, expect, it } from 'vitest';
import { guessCurrency, parseNumber, parsePastedText, parseSheetRows, parseTextLines } from './parse';

describe('parseNumber', () => {
  it.each([
    ['1.500', 1500],
    ['1,500', 1500],
    ['1,50', 1.5],
    ['1.234.567,89', 1234567.89],
    ['1,234,567.89', 1234567.89],
    ['$ 183.200', 183200],
    ['', 0],
    [null, 0],
    [42, 42],
  ])('%s → %s', (input, expected) => {
    expect(parseNumber(input)).toBeCloseTo(expected as number, 6);
  });
});

describe('guessCurrency', () => {
  it('usa pistas del texto y si no, el monto', () => {
    expect(guessCurrency(500000, 'precio en USD')).toBe('USD');
    expect(guessCurrency(50, 'pesos')).toBe('COP');
    expect(guessCurrency(350)).toBe('USD');
    expect(guessCurrency(350000)).toBe('COP');
  });
});

describe('parseSheetRows', () => {
  it('encuentra el encabezado y omite totales', () => {
    const rows = parseSheetRows([
      ['COTIZACIÓN PROVEEDOR'],
      ['Item', 'Descripción', 'Und', 'Cantidad', 'Precio unitario'],
      [1, 'Cámara bala IP 4MP', 'UN', 10, '183.200'],
      [2, 'Grabador NVR 16 canales', 'UN', 1, 1070802],
      ['', 'Subtotal', '', '', 2902802],
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ description: 'Cámara bala IP 4MP', quantity: 10, unitPrice: 183200, currency: 'COP' });
  });

  it('lista del cliente sin precios', () => {
    const rows = parseSheetRows([['Descripción'], ['Detector de humo'], ['Sirena estrobo']]);
    expect(rows.map((r) => r.unitPrice)).toEqual([0, 0]);
  });
});

describe('parseTextLines', () => {
  it('lee cantidad, unitario y total al final de la línea', () => {
    const rows = parseTextLines('1 Cámara domo IP 2MP 4 350.000 1.400.000\nTOTAL 1.400.000');
    expect(rows).toEqual([
      { description: 'Cámara domo IP 2MP', unit: 'UN', quantity: 4, currency: 'COP', unitPrice: 350000 },
    ]);
  });

  it('convierte tubería por tramo a precio por metro', () => {
    const rows = parseTextLines('Tubería EMT 3/4 x 3 m 10 30.000 300.000');
    expect(rows[0]).toMatchObject({ unit: 'ML', quantity: 30, unitPrice: 10000 });
  });
});

describe('parsePastedText', () => {
  it('acepta tabulaciones', () => {
    expect(parsePastedText('Cámara bala IP\t10\t183200\nGrabador NVR\t1\t1070802')).toHaveLength(2);
  });
});
