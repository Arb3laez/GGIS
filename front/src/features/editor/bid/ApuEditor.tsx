import { useEffect, useId, useMemo, useRef } from 'react';
import { Calculator, Plus, Trash2, X } from 'lucide-react';
import {
  apuContext,
  apuLineValue,
  computeApu,
  formatCop,
  newRowId,
  SUPPLY_TYPE_LABELS,
  supplyIndex,
  supplyUnitPrice,
  type ApuLine,
} from '@ggis/domain';
import { Checkbox, NumberInput } from '../../../shared/inputs';
import { useDraft, useEdit } from '../store';

/**
 * Análisis de precio unitario de un ítem. Los cambios se aplican en vivo a la cotización.
 * Cada línea: insumo × (cantidad ó 1/rendimiento) × (1 + desperdicio) × precio × IVA (no aplica a M.O.).
 */
export function ApuEditor({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const d = useDraft();
  const edit = useEdit();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const item = d.items.find((i) => i.id === itemId);
  const index = useMemo(() => supplyIndex(d), [d]);
  const ctx = apuContext(d);
  const lines = item?.apu ?? [];
  const result = computeApu(lines, index, ctx);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose]);

  if (!item) return null;

  const editLines = (recipe: (l: ApuLine[]) => ApuLine[]) =>
    edit((x) => {
      const it = x.items.find((i) => i.id === itemId);
      if (!it) return;
      const next = recipe(it.apu ?? []);
      it.apu = next.length ? next : null;
    });
  const setLine = (id: string, patch: Partial<ApuLine>) =>
    editLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  return (
    <div className="confirm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="confirm-dialog apu-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="card-head" style={{ marginBottom: 4 }}>
          <h2 id={titleId} className="card-title">
            <span className="title-icon">
              <Calculator size={16} />
            </span>
            APU · {item.description || 'Ítem sin descripción'}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="icon-btn sm"
            aria-label="Cerrar APU"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>
        <div className="sub">
          Costo directo por {item.unit || 'unidad'}. Con APU, el costo del ítem sale de aquí y se ignoran su
          precio unitario y su % de M.O. Si hay rendimiento, la cantidad efectiva es 1 ÷ rendimiento.
        </div>

        {d.supplies.length === 0 ? (
          <div className="alert warning">
            Primero agrega insumos en la sección Licitación / APU → Insumos (o importa el análisis de precios
            desde Excel).
          </div>
        ) : null}

        <div className="table-scroll">
          <table style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 260 }}>Insumo</th>
                <th className="col-sm">Cantidad</th>
                <th
                  className="col-sm"
                  title="Unidades del ítem por día; si se llena, la cantidad efectiva es 1 ÷ rendimiento"
                >
                  Rend./día
                </th>
                <th className="col-xs" title={`Aplica ${d.apuParams.wastePct}% de desperdicio`}>
                  Desp.
                </th>
                <th className="col-md">Precio insumo</th>
                <th className="col-md">Valor parcial</th>
                <th className="col-xs" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const s = index.get(l.supplyId);
                return (
                  <tr key={l.id}>
                    <td>
                      <select
                        className="cell"
                        value={l.supplyId}
                        aria-label="Insumo"
                        onChange={(e) => setLine(l.id, { supplyId: e.target.value })}
                      >
                        {!s ? <option value={l.supplyId}>(insumo eliminado)</option> : null}
                        {d.supplies.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.code} · {x.description} ({SUPPLY_TYPE_LABELS[x.type]})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <NumberInput
                        value={l.quantity}
                        ariaLabel="Cantidad"
                        onChange={(n) => setLine(l.id, { quantity: n ?? 0 })}
                      />
                    </td>
                    <td>
                      <NumberInput
                        value={l.yieldPerDay}
                        ariaLabel="Rendimiento por día"
                        onChange={(n) => setLine(l.id, { yieldPerDay: n ?? 0 })}
                      />
                    </td>
                    <td className="col-center">
                      <Checkbox
                        checked={l.applyWaste}
                        title="Aplicar desperdicio"
                        onChange={(v) => setLine(l.id, { applyWaste: v })}
                      />
                    </td>
                    <td className="num-out">{s ? formatCop(supplyUnitPrice(s, ctx)) : '—'}</td>
                    <td className="num-out">{s ? formatCop(apuLineValue(l, s, ctx)) : '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="ghost-danger"
                        aria-label="Eliminar línea"
                        onClick={() => editLines((ls) => ls.filter((x) => x.id !== l.id))}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="small add-row"
          disabled={d.supplies.length === 0}
          onClick={() =>
            editLines((ls) => [
              ...ls,
              { id: newRowId(), supplyId: d.supplies[0]!.id, quantity: 1, yieldPerDay: 0, applyWaste: false },
            ])
          }
        >
          <Plus size={14} /> Agregar línea
        </button>

        <div className="apu-totals">
          <div>
            <span>Suministro (equipos y materiales)</span>
            <b>{formatCop(result.supply)}</b>
          </div>
          <div>
            <span>Mano de obra</span>
            <b>{formatCop(result.labor)}</b>
          </div>
          <div>
            <span>Herramienta ({d.apuParams.toolsPctOfLabor}% de M.O.)</span>
            <b>{formatCop(result.tools)}</b>
          </div>
          <div>
            <span>Servicios</span>
            <b>{formatCop(result.services)}</b>
          </div>
          <div className="total">
            <span>Costo directo por {item.unit || 'unidad'}</span>
            <b>{formatCop(result.total)}</b>
          </div>
        </div>
        {result.estimatedLines > 0 ? (
          <div className="alert warning">
            {result.estimatedLines} línea{result.estimatedLines === 1 ? '' : 's'} con precio estimado:
            verifícalo antes de adjudicar.
          </div>
        ) : null}

        <div className="confirm-actions">
          {lines.length ? (
            <button type="button" className="ghost-danger" onClick={() => editLines(() => [])}>
              Quitar APU (volver a precio + % M.O.)
            </button>
          ) : null}
          <button type="button" className="primary" onClick={onClose}>
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
