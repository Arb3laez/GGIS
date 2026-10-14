const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const copFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

/** $1.234.567 (sin decimales). */
export function formatCop(n: number | null | undefined): string {
  const v = Math.round(n ?? 0);
  return (v < 0 ? '-$' : '$') + copFormatter.format(Math.abs(v));
}

/** Monto abreviado para tarjetas y ejes: $1,2 mil M · $7,8 M · $350 mil · $900. */
export function formatCopCompact(n: number | null | undefined): string {
  const v = Math.round(n ?? 0);
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1_000_000_000) {
    // Miles de millones: "$1,2 mil M" (evita leer "$1.245 M" como un millón)
    const mm = a / 1_000_000_000;
    return `${sign}$${mm.toLocaleString('es-CO', { maximumFractionDigits: mm >= 10 ? 0 : 1 })} mil M`;
  }
  if (a >= 1_000_000) {
    const m = a / 1_000_000;
    return `${sign}$${m.toLocaleString('es-CO', { maximumFractionDigits: m >= 100 ? 0 : 1 })} M`;
  }
  if (a >= 1_000) return `${sign}$${Math.round(a / 1_000).toLocaleString('es-CO')} mil`;
  return `${sign}$${a}`;
}

export function formatPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

/** "8 de octubre de 2026". */
export function formatLongDate(iso: string): string {
  const d = parseIsoDate(iso);
  return `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

export function addDaysIso(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Días completos transcurridos desde una fecha ISO hasta `today` (ISO). */
export function daysBetween(fromIso: string, todayIsoStr: string): number {
  return Math.floor((parseIsoDate(todayIsoStr).getTime() - parseIsoDate(fromIso).getTime()) / 86_400_000);
}

/** Nombre de archivo seguro: sin caracteres especiales. */
export function safeFileName(s: string): string {
  return s.replace(/[^\w\s-]/g, '').trim() || 'Cliente';
}
