import {
  BUSINESS_UNITS,
  BUSINESS_UNIT_LABELS,
  formatCopCompact,
  type BusinessUnit,
  type MonthBucket,
  type UnitMonthCell,
} from '@ggis/domain';

const LEVELS = [
  'var(--heat-0)',
  'var(--heat-1)',
  'var(--heat-2)',
  'var(--heat-3)',
  'var(--heat-4)',
  'var(--heat-5)',
];

/** Mapa de calor: cotizaciones por unidad de negocio (filas) y mes (columnas). Una sola tonalidad. */
export function UnitHeatmap({ months, cells }: { months: MonthBucket[]; cells: UnitMonthCell[] }) {
  const max = Math.max(...cells.map((c) => c.count), 0);
  const hasUnassigned = cells.some((c) => c.unit === null);
  const rows: Array<BusinessUnit | null> = [...BUSINESS_UNITS, ...(hasUnassigned ? [null] : [])];
  const get = (u: BusinessUnit | null, month: string) => cells.find((c) => c.unit === u && c.month === month);
  const level = (n: number) => (n <= 0 || max === 0 ? 0 : Math.max(1, Math.ceil((n / max) * 5)));

  return (
    <>
      <div className="heat-legend" aria-hidden="true">
        <span>Menos</span>
        {LEVELS.map((c) => (
          <i key={c} style={{ background: c }} />
        ))}
        <span>Más (máx. {max} por mes)</span>
      </div>
      <div
        className="heat"
        style={{ gridTemplateColumns: `104px repeat(${months.length}, 1fr)` }}
        role="table"
        aria-label="Cotizaciones por unidad y mes"
      >
        {rows.map((u) => (
          <div key={u ?? 'none'} style={{ display: 'contents' }} role="row">
            <span className="rlabel" role="rowheader">
              {u ? BUSINESS_UNIT_LABELS[u] : 'Sin unidad'}
            </span>
            {months.map((m) => {
              const c = get(u, m.key);
              const n = c?.count ?? 0;
              return (
                <div
                  key={m.key}
                  className="cell-h"
                  role="cell"
                  tabIndex={0}
                  aria-label={`${u ? BUSINESS_UNIT_LABELS[u] : 'Sin unidad'}, ${m.label}: ${n} cotizaciones`}
                  style={{ background: LEVELS[level(n)] }}
                >
                  <span className="tip">
                    {u ? BUSINESS_UNIT_LABELS[u] : 'Sin unidad'} · {m.label}: <b>{n}</b>
                    {n ? ` · ${formatCopCompact(c!.value)}` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
        <span />
        {months.map((m) => (
          <span key={m.key} className="clabel">
            {m.label}
          </span>
        ))}
      </div>
    </>
  );
}
