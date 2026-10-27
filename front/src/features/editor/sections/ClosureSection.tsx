import { analyzeClosure, formatCop, formatPct } from '@ggis/domain';
import { ClipboardCheck } from 'lucide-react';
import { SectionTitle } from '../../../shared/SectionTitle';
import { NumberField, TextArea, TextField } from '../../../shared/inputs';
import { levelColor } from '../../../shared/status';
import { LineAuditPanel } from './AuditPanels';
import { useBreakdown, useDraft, useEdit } from '../store';

/** Auditoría: lo cotizado frente a lo que en realidad se pagó (cotizaciones en negociación y adjudicadas). */
export function ClosureSection() {
  const d = useDraft();
  const edit = useEdit();
  const { totals } = useBreakdown();
  const c = d.closure;
  const a = analyzeClosure(d, totals);

  return (
    <section className="card" id="cierre" aria-labelledby="closure-title">
      <SectionTitle icon={<ClipboardCheck size={16} />} id="closure-title">
        Auditoría — ejecución y cierre real
      </SectionTitle>
      <div className="sub">
        Auditoría de lo cotizado frente a lo que en realidad se pagó, línea por línea: registra el precio
        final de cada ítem y costo, y lo que se le dio al personal (abono, liquidación y bonificaciones).
      </div>

      <LineAuditPanel />

      {c.entries.length > 0 ? <LegacyLog /> : null}

      <div className="subtotal-line">
        Costo real acumulado (todo lo pagado según la auditoría): <b>{formatCop(a.actualCost)}</b>
      </div>

      <div className="grid-2" style={{ marginTop: 14 }}>
        <NumberField
          label="Valor real cobrado al cliente"
          value={c.actualSale ?? 0}
          format={formatCop}
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

/**
 * Bitácora de costos de versiones anteriores (solo lectura). Se muestra cuando la cotización la
 * trae; cuenta como costo real mientras la auditoría esté vacía.
 */
function LegacyLog() {
  const d = useDraft();
  const c = d.closure;
  const name = new Map(c.categories.map((cat) => [cat.id, cat.name]));
  const total = c.entries.reduce((s, e) => s + e.amount, 0);
  return (
    <details style={{ marginTop: 12 }}>
      <summary className="hint" style={{ cursor: 'pointer' }}>
        Bitácora de costos anterior ({c.entries.length} registros · {formatCop(total)}) — solo lectura
      </summary>
      <table style={{ marginTop: 6 }}>
        <thead>
          <tr>
            <th className="col-md">Fecha</th>
            <th>Categoría</th>
            <th>Concepto</th>
            <th className="col-md">Valor</th>
          </tr>
        </thead>
        <tbody>
          {c.entries.map((e) => (
            <tr key={e.id}>
              <td>{e.date || '—'}</td>
              <td>{name.get(e.categoryId) ?? e.categoryId}</td>
              <td>{e.concept || '—'}</td>
              <td className="num-out">{formatCop(e.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="hint" style={{ marginTop: 4 }}>
        Mientras la auditoría de arriba esté vacía, este valor se usa como costo real del proyecto.
      </div>
    </details>
  );
}
