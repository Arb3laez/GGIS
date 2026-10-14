import type { QuoteStatus } from '@ggis/domain';

/** Colores de estado para fondo claro (reservados: no se usan como colores de serie). */
export const STATUS_STYLE: Record<QuoteStatus, { bg: string; fg: string }> = {
  sent: { bg: 'rgba(57, 135, 229, 0.16)', fg: '#1d5fae' },
  negotiating: { bg: 'rgba(214, 140, 0, 0.18)', fg: '#8a5200' },
  won: { bg: 'rgba(23, 128, 61, 0.14)', fg: '#17703a' },
  lost: { bg: 'rgba(192, 38, 38, 0.12)', fg: '#a82222' },
  replaced: { bg: 'rgba(111, 98, 216, 0.16)', fg: '#4f43b8' },
};

export const levelColor = (level: 'ok' | 'warning' | 'danger') =>
  level === 'ok' ? 'var(--ok)' : level === 'warning' ? 'var(--warn)' : 'var(--danger)';
