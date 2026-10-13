import { useState } from 'react';
import {
  analyzeClosure,
  costByCategory,
  formatCop,
  formatPct,
  newRowId,
  removeClosureCategory,
  todayIso,
  type ClosureEntry,
} from '@ggis/domain';
import { ClipboardCheck } from 'lucide-react';
import { useToast } from '../../../shared/feedback';
import { SectionTitle } from '../../../shared/SectionTitle';
import { NumberInput, NumberField, TextArea, TextField } from '../../../shared/inputs';
import { levelColor } from '../../../shared/status';
import { useBreakdown, useDraft, useEdit } from '../store';

/** Bitácora de costos reales y auditoría paralela (solo cotizaciones adjudicadas). */
export function ClosureSection() {
  const d = useDraft();
  const edit = useEdit();
  const notify = useToast();
  const { totals } = useBreakdown();
  const [newCategory, setNewCategory] = useState('');
  const c = d.closure;
  const byCat = costByCategory(c);
  const a = analyzeClosure(d, totals);

  const editEntry = (id: string, recipe: (e: ClosureEntry) => void) =>
    edit((x) => {
      const e = x.closure.entries.find((r) => r.id === id);
      if (e) recipe(e);
    });

  return (
    <section className="card" id="cierre" aria-labelledby="closure-title">
      <SectionTitle icon={<ClipboardCheck size={16} />} id="closure-title">
        Ejecución y cierre real
      </SectionTitle>
      <div className="sub">
        Registra los costos reales a medida que avanza la obra, en las mismas categorías del Resumen, para
        comparar contra lo presupuestado.
      </div>

      {c.categories.map((cat) => (
        <div key={cat.id} style={{ marginTop: 14 }}>
          <div className="filters" style={{ marginBottom: 4 }}>
            <b style={{ fontSize: 12.5, color: 'var(--navy)' }}>{cat.name}</b>
            <span className="spacer" style={{ flex: 1 }} />
            <button
              type="button"
              className="ghost-danger small"
              title="Sus costos se mueven a 'Otros costos del proyecto'"
              onClick={() => {
                try {
                  edit((x) => void (x.closure = removeClosureCategory(x.closure, cat.id)));
                } catch (err) {
                  notify((err as Error).message, true);
                }
              }}
            >
              Quitar categoría
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th className="col-md">Fecha</th>
                <th>Proveedor / técnico / concepto</th>
                <th className="col-md">Valor</th>
                <th className="col-xs" />
              </tr>
            </thead>
            <tbody>
              {c.entries
                .filter((e) => e.categoryId === cat.id)
                .map((e) => (
                  <tr key={e.id}>
                    <td>
                      <input
                        className="cell"
                        type="date"
                        value={e.date}
                        aria-label="Fecha"
                        onChange={(ev) => editEntry(e.id, (x) => void (x.date = ev.target.value))}
                      />
                    </td>
                    <td>
                      <input
                        className="cell"
                        value={e.concept}
                        placeholder="Ej: factura proveedor, técnico X…"
                        aria-label="Concepto"
                        onChange={(ev) => editEntry(e.id, (x) => void (x.concept = ev.target.value))}
                      />
                    </td>
                    <td>
                      <NumberInput
                        value={e.amount}
                        ariaLabel="Valor"
                        onChange={(n) => editEntry(e.id, (x) => void (x.amount = n ?? 0))}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ghost-danger"
                        aria-label="Eliminar costo"
                        onClick={() =>
                          edit(
                            (x) => void (x.closure.entries = x.closure.entries.filter((r) => r.id !== e.id)),
                          )
                        }
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="filters" style={{ justifyContent: 'space-between', marginTop: 6 }}>
            <button
              type="button"
              className="small"
              onClick={() =>
                edit(
                  (x) =>
                    void x.closure.entries.push({
                      id: newRowId(),
                      date: todayIso(),
                      concept: '',
                      amount: 0,
                      categoryId: cat.id,
                    }),
                )
              }
            >
              + Agregar costo
            </button>
            <span className="num-out">Subtotal: {formatCop(byCat[cat.id])}</span>
          </div>
        </div>
      ))}

      <div className="filters" style={{ marginTop: 12 }}>
        <input
          className="input"
          style={{ flex: 1 }}
          value={newCategory}
          placeholder="Categoría adicional (ej: Transporte, Alquiler de andamios…)"
          onChange={(e) => setNewCategory(e.target.value)}
        />
        <button
          type="button"
          className="small"
          disabled={!newCategory.trim()}
          onClick={() => {
            edit((x) => void x.closure.categories.push({ id: newRowId(), name: newCategory.trim() }));
            setNewCategory('');
          }}
        >
          + Agregar categoría
        </button>
      </div>

      <div className="subtotal-line">
        Costo real acumulado: <b>{formatCop(a.actualCost)}</b>
      </div>

      <div className="grid-2" style={{ marginTop: 14 }}>
        <NumberField
          label="Valor real cobrado al cliente"
          value={c.actualSale ?? 0}
          onChange={(n) => edit((x) => void (x.closure.actualSale = n > 0 ? n : null))}
        />
        <TextField
          label="Fecha de cierre (proyecto terminado)"
          type="date"
          value={c.closedOn ?? ''}
          onChange={(v) => edit((x) => void (x.closure.closedOn = v || null))}
        />
      </div>
      <TextArea
        label="Notas del cierre (qué se desvió y por qué)"
        value={c.notes}
        rows={2}
        onChange={(v) => edit((x) => void (x.closure.notes = v))}
      />

      {!a.hasActualCost ? (
        <div className="hint" style={{ marginTop: 8 }}>
          Aún no hay costos reales. En cuanto agregues el primero verás aquí cuánto llevas gastado frente a lo
          presupuestado.
        </div>
      ) : (
        <ClosureAnalysisView
          a={a}
          onUsePrice={(v) => edit((x) => void (x.closure.actualSale = Math.round(v)))}
        />
      )}
    </section>
  );
}

function Meter({
  label,
  pct,
  level,
  value,
}: {
  label: string;
  pct: number;
  level: 'ok' | 'warning' | 'danger';
  value: string;
}) {
  const color = levelColor(level);
  return (
    <div style={{ margin: '10px 0' }}>
      <div className="filters" style={{ justifyContent: 'space-between', marginBottom: 4, fontSize: 11.5 }}>
        <span className="hint">{label}</span>
        <b style={{ color }}>{value}</b>
      </div>
      <div
        className="meter"
        role="meter"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div style={{ width: `${Math.max(0, Math.min(pct, 100))}%`, background: color }} />
      </div>
    </div>
  );
}

function ClosureAnalysisView({
  a,
  onUsePrice,
}: {
  a: ReturnType<typeof analyzeClosure>;
  onUsePrice: (v: number) => void;
}) {
  const devColor =
    a.costDeviation <= 0 ? 'var(--ok)' : a.costDeviationPct <= 10 ? 'var(--warn)' : 'var(--danger)';
  const sign = (n: number) => (n > 0 ? '+' : '');
  return (
    <div style={{ marginTop: 12 }}>
      {!a.isClosed ? (
        <>
          <Meter
            label="Auditoría paralela — presupuesto de costo consumido"
            pct={a.consumedPct}
            level={a.consumedLevel}
            value={formatPct(a.consumedPct, 0)}
          />
          {a.consumedMessage ? <div className={`alert ${a.consumedLevel}`}>{a.consumedMessage}</div> : null}
          <Meter
            label={`Margen que queda hoy sobre ${a.actualSaleProvided ? 'lo cobrado' : 'lo presupuestado'} (${formatCop(a.actualSale)})`}
            pct={a.marginTodayPct}
            level={a.marginTodayLevel}
            value={formatPct(a.marginTodayPct)}
          />
        </>
      ) : null}

      <table className="compare" style={{ border: '1px solid var(--line)', borderRadius: 8, marginTop: 8 }}>
        <thead>
          <tr>
            <th />
            <th className="n">Presupuestado</th>
            <th className="n">Real</th>
            <th className="n">Diferencia</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Costo total</td>
            <td className="n">{formatCop(a.budgetCost)}</td>
            <td className="n">{formatCop(a.actualCost)}</td>
            <td className="n" style={{ color: devColor }}>
              {sign(a.costDeviation)}
              {formatCop(a.costDeviation)} ({sign(a.costDeviationPct)}
              {formatPct(a.costDeviationPct)})
            </td>
          </tr>
          <tr>
            <td>Valor de venta</td>
            <td className="n">{formatCop(a.budgetSale)}</td>
            <td className="n">{formatCop(a.actualSale)}</td>
            <td className="n">{formatCop(a.actualSale - a.budgetSale)}</td>
          </tr>
          <tr>
            <td>
              <b>Utilidad</b>
            </td>
            <td className="n">
              {formatCop(a.budgetProfit)} ({formatPct(a.budgetMarginPct)})
            </td>
            <td
              className="n"
              style={{ color: a.actualProfit >= a.budgetProfit ? 'var(--ok)' : 'var(--danger)' }}
            >
              {formatCop(a.actualProfit)} ({formatPct(a.actualMarginPct)})
            </td>
            <td className="n" style={{ color: a.profitDeviation >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
              {sign(a.profitDeviation)}
              {formatCop(a.profitDeviation)}
            </td>
          </tr>
        </tbody>
      </table>
      {a.overBudget ? (
        <div className="alert danger">
          ⚠ El costo real superó el presupuesto en más de 10%. Revisa si el % de imprevistos o de M.O. de este
          tipo de solución debe subir.
        </div>
      ) : null}

      <div className="section-title">Con este costo real, ¿en cuánto se debió vender?</div>
      {a.unusuallyHighMargin ? (
        <div className="alert warning">
          La utilidad real quedó en {formatPct(a.actualMarginPct)}, por encima del rango sano de 15–20%. En
          ofertas similares podrías cobrar menos y seguir con buen margen.
        </div>
      ) : null}
      <div className="target-prices">
        {a.targetPrices.map((tp) => (
          <div key={tp.marginPct}>
            <div className="hint" style={{ textTransform: 'uppercase' }}>
              Para {tp.marginPct}% de utilidad
            </div>
            <div className="num-out" style={{ textAlign: 'left', fontSize: 15, fontWeight: 700 }}>
              {formatCop(tp.total)}
            </div>
            <button
              type="button"
              className="small"
              style={{ marginTop: 6 }}
              onClick={() => onUsePrice(tp.total)}
            >
              Usar este precio
            </button>
          </div>
        ))}
      </div>
      <div className="hint" style={{ marginTop: 8 }}>
        {a.soldAboveHealthyRange
          ? `Vendiste en ${formatCop(a.actualSale)} — por encima de lo necesario para 15%. Hay espacio para bajar el precio en ofertas similares.`
          : `Vendiste en ${formatCop(a.actualSale)} — por debajo de lo necesario para 15% con este costo real. Sube el precio de referencia en ofertas similares.`}
      </div>
    </div>
  );
}
