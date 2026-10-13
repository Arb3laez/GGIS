/**
 * Barra apilada al 100% (parte de un todo) con leyenda que muestra los valores.
 * Los colores siguen a la categoría (orden fijo), nunca a su posición en el ranking.
 */
export interface Part {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function PartChart({ title, parts, emptyText }: { title: string; parts: Part[]; emptyText: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  return (
    <figure className="part-chart" style={{ margin: 0 }}>
      <figcaption className="title">{title}</figcaption>
      {total === 0 ? (
        <div className="hint">{emptyText}</div>
      ) : (
        <>
          <div
            className="stack"
            role="img"
            aria-label={`${title}: ${parts.map((p) => `${p.label} ${p.value}`).join(', ')}`}
          >
            {parts
              .filter((p) => p.value > 0)
              .map((p) => (
                <div
                  key={p.key}
                  className="seg"
                  tabIndex={0}
                  style={{ flexGrow: p.value, background: p.color }}
                >
                  <span className="tip">
                    {p.label}: {p.value} ({pct(p.value)}%)
                  </span>
                </div>
              ))}
          </div>
          <div className="legend">
            {parts.map((p) => (
              <span key={p.key} className="item">
                <span className="dot" style={{ background: p.color }} />
                {p.label} <b>{p.value > 0 ? `${p.value} · ${pct(p.value)}%` : '—'}</b>
              </span>
            ))}
          </div>
        </>
      )}
    </figure>
  );
}
