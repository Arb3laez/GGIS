import type { QuoteStatus } from '@ggis/domain';

/** Colores de estado para fondo oscuro (reservados: no se usan como colores de serie). */
export const STATUS_STYLE: Record<QuoteStatus, { bg: string; fg: string }> = {
  sent: { bg: 'rgba(57, 135, 229, 0.16)', fg: '#7fb2f0' },
  negotiating: { bg: 'rgba(250, 178, 25, 0.14)', fg: '#fab219' },
  won: { bg: 'rgba(74, 222, 128, 0.14)', fg: '#4ade80' },
  lost: { bg: 'rgba(248, 113, 113, 0.14)', fg: '#f87171' },
  replaced: { bg: 'rgba(144, 133, 233, 0.16)', fg: '#b3aaf2' },
};

export const levelColor = (level: 'ok' | 'warning' | 'danger') =>
  level === 'ok' ? 'var(--ok)' : level === 'warning' ? 'var(--warn)' : 'var(--danger)';
