import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  apuContext,
  formatCop,
  newRowId,
  SUPPLY_PRICE_TYPE_LABELS,
  SUPPLY_PRICE_TYPES,
  SUPPLY_TYPE_LABELS,
  SUPPLY_TYPES,
  supplyUnitPrice,
  type Supply,
  type SupplyPriceType,
  type SupplyType,
} from '@ggis/domain';
import { useConfirm } from '../../../shared/confirm';
import { Checkbox, NumberInput } from '../../../shared/inputs';
import { useDraft, useEdit } from '../store';

/** Base de insumos de la cotización (hoja INSUMOS). El precio en COP se calcula según el tipo de precio. */
export function SuppliesTable() {
  const d = useDraft();
  const edit = useEdit();
  const confirm = useConfirm();
  const [filter, setFilter] = useState('');
  const ctx = apuContext(d);

  const uses = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of d.items) for (const l of it.apu ?? []) m.set(l.supplyId, (m.get(l.supplyId) ?? 0) + 1);
    return m;
  }, [d.items]);

  const q = filter.trim().toLowerCase();
  const visible = q
    ? d.supplies.filter((s) => s.code.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
    : d.supplies;
  const estimated = d.supplies.filter((s) => s.estimated).length;

  const editSupply = (id: string, patch: Partial<Supply>) =>
    edit((x) => {
      const s = x.supplies.find((y) => y.id === id);
      if (s) Object.assign(s, patch);
    });

  async function remove(s: Supply) {
    const n = uses.get(s.id) ?? 0;
    if (
      n > 0 &&
      !(await confirm({
        title: '¿Eliminar el insumo?',
        message: `${s.code} se usa en ${n} línea${n === 1 ? '' : 's'} de APU. Esas líneas se quitan también.`,
        confirmLabel: 'Eliminar',
        cancelLabel: 'Cancelar',
        tone: 'danger',
      }))
    )
      return;
    edit((x) => {
      x.supplies = x.supplies.filter((y) => y.id !== s.id);
      for (const it of x.items) {
        if (!it.apu) continue;
        const rest = it.apu.filter((l) => l.supplyId !== s.id);
        it.apu = rest.length ? rest : null;
      }
    });
  }

  function add() {
    edit((x) => {
      const n = x.supplies.length + 1;
      x.supplies.push({
        id: newRowId(),
        code: `IN${String(n).padStart(2, '0')}`,
        description: '',
        unit: 'und',
        type: 'MAT',
        baseValue: 0,
        priceType: 'COP',
        source: '',
        estimated: true,
      });
    });
  }

  return (
    <>
      <div className="section-title">
        Base de insumos{' '}
        <span className="hint" style={{ fontWeight: 400 }}>
          {d.supplies.length} insumos{estimated ? ` · ${estimated} con precio estimado` : ''}
        </span>
      </div>
      {d.supplies.length > 8 ? (
        <div className="filters">
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="Buscar insumo por código o descripción…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Buscar insumo"
          />
        </div>
      ) : null}
      <div className="table-scroll" style={{ maxHeight: 420 }}>
        <table style={{ minWidth: 1120 }}>
          <thead>
            <tr>
              <th className="col-sm">Código</th>
              <th style={{ minWidth: 220 }}>Descripción</th>
              <th className="col-xs">Und.</th>
              <th className="col-sm">Tipo</th>
              <th className="col-md">Valor base</th>
              <th className="col-sm">Tipo de precio</th>
              <th
                className="col-md"
                title="USD × TRM × factor de importación · Lista × escalamiento · COP tal cual"
              >
                Precio COP
              </th>
              <th style={{ minWidth: 160 }}>Fuente</th>
              <th className="col-xs" title="Precio estimado: verificar o cotizar antes de adjudicar">
                ¿Estimado?
              </th>
              <th className="col-xs" />
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => (
              <tr key={s.id} className={s.estimated ? 'row-estimated' : undefined}>
                <td>
                  <input
                    className="cell"
                    value={s.code}
                    aria-label="Código"
                    onChange={(e) => e.target.value.trim() && editSupply(s.id, { code: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="cell"
                    value={s.description}
                    aria-label="Descripción del insumo"
                    onChange={(e) => editSupply(s.id, { description: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="cell"
                    value={s.unit}
                    aria-label="Unidad"
                    onChange={(e) => editSupply(s.id, { unit: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    className="cell"
                    value={s.type}
                    aria-label="Tipo de insumo"
                    onChange={(e) => editSupply(s.id, { type: e.target.value as SupplyType })}
                  >
                    {SUPPLY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {SUPPLY_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <NumberInput
                    value={s.baseValue}
                    ariaLabel="Valor base"
                    onChange={(n) => editSupply(s.id, { baseValue: n ?? 0 })}
                  />
                </td>
                <td>
                  <select
                    className="cell"
                    value={s.priceType}
                    aria-label="Tipo de precio"
                    onChange={(e) => editSupply(s.id, { priceType: e.target.value as SupplyPriceType })}
                  >
                    {SUPPLY_PRICE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {SUPPLY_PRICE_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="num-out">{formatCop(supplyUnitPrice(s, ctx))}</td>
                <td>
                  <input
                    className="cell"
                    value={s.source}
                    aria-label="Fuente del precio"
                    onChange={(e) => editSupply(s.id, { source: e.target.value })}
                  />
                </td>
                <td className="col-center">
                  <Checkbox
                    checked={s.estimated}
                    title="Precio estimado"
                    onChange={(v) => editSupply(s.id, { estimated: v })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="ghost-danger"
                    aria-label={`Eliminar insumo ${s.code}`}
                    onClick={() => void remove(s)}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="small add-row" onClick={add}>
        + Agregar insumo
      </button>
    </>
  );
}
