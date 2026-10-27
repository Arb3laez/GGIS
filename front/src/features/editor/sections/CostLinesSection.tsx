import {
  blankCostLine,
  costLineTotal,
  costLinesSubtotal,
  formatCop,
  type CostLine,
  type QuoteDraft,
} from '@ggis/domain';
import type { ReactNode } from 'react';
import { formatPesos, NumberInput } from '../../../shared/inputs';
import { SectionTitle } from '../../../shared/SectionTitle';
import { useDraft, useEdit } from '../store';

type LinesKey = 'laborActivities' | 'otherCosts';

/** Tabla reutilizable para "Mano de obra por actividad" y "Otros costos del proyecto". */
export function CostLinesSection({
  id,
  icon,
  field,
  title,
  description,
  conceptLabel,
  presets,
  addLabel,
}: {
  id: string;
  icon: ReactNode;
  field: LinesKey;
  title: string;
  description: string;
  conceptLabel: string;
  presets: readonly string[];
  addLabel: string;
}) {
  const d: QuoteDraft = useDraft();
  const edit = useEdit();
  const lines = d[field];

  const editLine = (id: string, recipe: (l: CostLine) => void) =>
    edit((x) => {
      const l = x[field].find((r) => r.id === id);
      if (l) recipe(l);
    });

  return (
    <section className="card" id={id} aria-label={title}>
      <SectionTitle icon={icon}>{title}</SectionTitle>
      <div className="sub">{description}</div>
      <table>
        <thead>
          <tr>
            <th>{conceptLabel}</th>
            <th className="col-sm">Cantidad</th>
            <th className="col-md">Valor unitario</th>
            <th className="col-md">Total</th>
            <th className="col-xs" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td>
                <input
                  className="cell"
                  value={l.concept}
                  aria-label={conceptLabel}
                  onChange={(e) => editLine(l.id, (x) => void (x.concept = e.target.value))}
                />
              </td>
              <td>
                <NumberInput
                  value={l.quantity}
                  ariaLabel="Cantidad"
                  onChange={(n) => editLine(l.id, (x) => void (x.quantity = n ?? 0))}
                />
              </td>
              <td>
                <NumberInput
                  value={l.unitPrice}
                  ariaLabel="Valor unitario"
                  format={formatPesos}
                  onChange={(n) => editLine(l.id, (x) => void (x.unitPrice = n ?? 0))}
                />
              </td>
              <td className="num-out">{formatCop(costLineTotal(l))}</td>
              <td>
                <button
                  type="button"
                  className="ghost-danger"
                  aria-label="Eliminar"
                  onClick={() => edit((x) => void (x[field] = x[field].filter((r) => r.id !== l.id)))}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="small add-row"
        onClick={() => edit((x) => void x[field].push(blankCostLine()))}
      >
        {addLabel}
      </button>
      <div className="chips">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            className="small"
            onClick={() => edit((x) => void x[field].push(blankCostLine(p)))}
          >
            + {p}
          </button>
        ))}
      </div>
      <div className="subtotal-line">
        Subtotal: <b>{formatCop(costLinesSubtotal(lines))}</b>
      </div>
    </section>
  );
}
