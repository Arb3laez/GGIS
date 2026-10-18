/**
 * Tubería: longitudes comerciales de tubo y cálculo de cuántos tubos se necesitan.
 * La cotización sigue midiéndose y costeándose en ML; esto es solo una ayuda de compra.
 */

export const PIPE_LENGTHS = [6, 5.8, 3, 2, 1] as const;
export type PipeLength = (typeof PIPE_LENGTHS)[number];

/** Etiqueta en español con la misma precisión que usa el negocio: "6 m", "5,8 m", "3,0 m". */
const PIPE_LENGTH_LABELS: Record<number, string> = {
  6: '6 m',
  5.8: '5,8 m',
  3: '3,0 m',
  2: '2,0 m',
  1: '1,0 m',
};

export function pipeLengthLabel(lengthM: number): string {
  return (
    PIPE_LENGTH_LABELS[lengthM] ??
    `${lengthM.toLocaleString('es-CO', { maximumFractionDigits: 2 })} m`
  );
}

/**
 * Equivalente exacto en tubos: `meters / lengthM`. Puede ser decimal
 * (por ejemplo, 60 ML ÷ 5,8 m = 10,34 tubos).
 */
export function pipePiecesExact(meters: number, lengthM: number | null | undefined): number {
  if (!lengthM || lengthM <= 0 || meters <= 0) return 0;
  return meters / lengthM;
}

/**
 * Número entero de tubos para comprar: redondea hacia arriba (no se compran fracciones
 * de tubo). El epsilon evita que 5,8 / 5,8 se redondee a 3 por error de punto flotante.
 */
export function pipePieces(meters: number, lengthM: number | null | undefined): number {
  if (!lengthM || lengthM <= 0 || meters <= 0) return 0;
  return Math.ceil(meters / lengthM - 1e-9);
}
