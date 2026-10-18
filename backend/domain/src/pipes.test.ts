import { describe, expect, it } from 'vitest';
import { PIPE_LENGTHS, pipeLengthLabel, pipePieces, pipePiecesExact } from './pipes';

describe('tubería', () => {
  it('lista las longitudes comerciales', () => {
    expect(PIPE_LENGTHS).toEqual([6, 5.8, 3, 2, 1]);
  });

  it('calcula los tubos redondeando hacia arriba', () => {
    expect(pipePieces(60, 6)).toBe(10);
    expect(pipePieces(60, 5.8)).toBe(11);
    expect(pipePieces(5.8, 5.8)).toBe(1);
    expect(pipePieces(0, 6)).toBe(0);
    expect(pipePieces(10, null)).toBe(0);
  });

  it('etiqueta las longitudes con decimales', () => {
    expect(pipeLengthLabel(6)).toBe('6 m');
    expect(pipeLengthLabel(5.8)).toBe('5,8 m');
    expect(pipeLengthLabel(3)).toBe('3,0 m');
    expect(pipeLengthLabel(2)).toBe('2,0 m');
    expect(pipeLengthLabel(1)).toBe('1,0 m');
  });

  it('calcula el equivalente exacto, que puede ser decimal', () => {
    expect(pipePiecesExact(60, 6)).toBe(10);
    expect(pipePiecesExact(60, 5.8)).toBeCloseTo(10.3448, 4);
    expect(pipePiecesExact(5.8, 5.8)).toBeCloseTo(1, 9);
    expect(pipePiecesExact(10, null)).toBe(0);
  });
});
