import { formatCop, formatCopCompact, type MonthBucket } from '@ggis/domain';

/**
 * Columnas redondeadas por mes (una sola serie, un solo eje). El mes actual va resaltado y
 * muestra su valor; los demás lo muestran al pasar el mouse o con el teclado.
 */
export function MonthlyChart({ months, measure }: { months: MonthBucket[]; measure: 'quoted' | 'won' }) {
  const values = months.map((m) => m[measure]);
  const max = Math.max(...values, 0);
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => formatCopCompact(max * f));
  // Se resalta el último mes con movimiento (no un mes vacío al inicio del mes).
  const lastWithValue = values.reduce((acc, v, i) => (v > 0 ? i : acc), months.length - 1);
  const last = lastWithValue;

  if (max === 0) {
    return <div className="empty">Aún no hay cotizaciones en los últimos meses.</div>;
  }

  return (
    <div className="bars">
      <div className="axis" aria-hidden="true">
        {ticks.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
      <div
        className="plot"
        role="list"
        aria-label={measure === 'quoted' ? 'Valor cotizado por mes' : 'Valor adjudicado por mes'}
      >
        {months.map((m, i) => {
          const v = values[i]!;
          const prev = i > 0 ? values[i - 1]! : 0;
          const change = prev > 0 && v > 0 ? ((v - prev) / prev) * 100 : null;
          const h = Math.max((v / max) * 100, v > 0 ? 6 : 3);
          return (
            <div
              key={m.key}
              className={`bar-col${i === last ? ' current' : ''}`}
              role="listitem"
              tabIndex={0}
              aria-label={`${m.label} ${m.year}: ${formatCop(v)}, ${m.count} cotizaciones`}
            >
              <div className="bar" style={{ height: `${h}%` }}>
                <span className="dot" />
                <div className="bar-tip" style={{ bottom: `calc(100% + 14px)` }}>
                  {change !== null ? (
                    <span className="pct">
                      {change >= 0 ? '+' : ''}
                      {change.toFixed(1)}%
                    </span>
                  ) : null}
                  <div className="k">
                    {m.label} {m.year} · {m.count} cot.
                  </div>
                  <div className="v">{formatCopCompact(v)}</div>
                </div>
              </div>
              <span className="x">{m.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
