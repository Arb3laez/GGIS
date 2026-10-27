import type { QuoteStatus } from '@ggis/domain';
import type { GygStatus } from './gyg/gyg';

/** Colores de estado: los pares status-*-bg / status-*-ink del sistema de diseño GYG. */
export const STATUS_STYLE: Record<QuoteStatus, { bg: string; fg: string }> = {
  sent: { bg: 'var(--status-sent-bg)', fg: 'var(--status-sent-ink)' },
  negotiating: { bg: 'var(--status-negotiation-bg)', fg: 'var(--status-negotiation-ink)' },
  won: { bg: 'var(--status-won-bg)', fg: 'var(--status-won-ink)' },
  lost: { bg: 'var(--status-lost-bg)', fg: 'var(--status-lost-ink)' },
  replaced: { bg: 'var(--status-replaced-bg)', fg: 'var(--status-replaced-ink)' },
};

/** El sistema de diseño llama "negotiation" a En negociación; la app guarda "negotiating". */
export const toGygStatus = (s: QuoteStatus): GygStatus => (s === 'negotiating' ? 'negotiation' : s);
export const fromGygStatus = (s: GygStatus): QuoteStatus => (s === 'negotiation' ? 'negotiating' : s);

export const levelColor = (level: 'ok' | 'warning' | 'danger') =>
  level === 'ok' ? 'var(--ok)' : level === 'warning' ? 'var(--warn)' : 'var(--danger)';
