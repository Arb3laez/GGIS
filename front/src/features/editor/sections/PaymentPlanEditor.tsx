import { useState } from 'react';
import {
  effectivePaymentPlan,
  formatCop,
  monthlyCuts,
  newRowId,
  PAYMENT_KIND_LABELS,
  paymentSchedule,
  summarizePaymentPlan,
  type PaymentBase,
  type PaymentKind,
  type PaymentRow,
  type QuoteDraft,
} from '@ggis/domain';
import { NumberInput, TextArea } from '../../../shared/inputs';
import { useBreakdown, useDraft, useEdit } from '../store';

const BASE_LABELS: Record<PaymentBase, string> = {
  total: 'Todo el contrato',
  rest: 'Resto del contrato',
  items: 'Ítems específicos',
};

const NEW_ROW: Record<PaymentKind, Omit<PaymentRow, 'id'>> = {
  advance: {
    kind: 'advance',
    concept: 'Anticipo',
    pct: 0,
    base: 'total',
    itemIds: [],
    when: 'Al aprobar la orden',
  },
  progress: { kind: 'progress', concept: 'Corte de obra', pct: 0, base: 'total', itemIds: [], when: '' },
  final: { kind: 'final', concept: 'Pago final', pct: 0, base: 'total', itemIds: [], when: 'Al entregar' },
};

/**
 * Plan de pagos por cortes: anticipos (de todo el contrato, de unos ítems como la bomba o del
 * resto), cortes de obra y pago final. Calcula el valor en pesos de cada pago sobre el total con
 * IVA/AIU y avisa si lo programado no suma el total.
 */
export function PaymentPlanEditor() {
  const d = useDraft();
  const edit = useEdit();
  const breakdown = useBreakdown();
  const [months, setMonths] = useState(4);
  const [monthPct, setMonthPct] = useState(15);
  const schedule = paymentSchedule(d, breakdown);
  const billable = d.items.filter((it) => breakdown.items.find((b) => b.id === it.id)?.isBillable);

  /** Edita el plan (si la cotización aún usa los tres porcentajes, primero los convierte en filas). */
  const editPlan = (recipe: (plan: PaymentRow[], x: QuoteDraft) => void) =>
    edit((x) => {
      if (!x.terms.paymentPlan.length)
        // Conserva los id de las filas mostradas para que el primer cambio caiga en su fila.
        x.terms.paymentPlan = effectivePaymentPlan(x.terms).map((r) => ({ ...r }));
      recipe(x.terms.paymentPlan, x);
      // Los tres porcentajes de siempre se mantienen al día (avisos, correo, reportes).
      Object.assign(x.terms, summarizePaymentPlan(paymentSchedule(x as QuoteDraft, breakdown)));
    });
  const editRow = (id: string, recipe: (r: PaymentRow) => void) =>
    editPlan((plan) => {
      const r = plan.find((p) => p.id === id);
      if (r) recipe(r);
    });

  /** Agrega (o ajusta) un pago final con lo que falte para completar el total. */
  const completeWithFinal = () =>
    editPlan((plan, x) => {
      const s = paymentSchedule(x as QuoteDraft, breakdown);
      if (s.total <= 0) return;
      if (s.difference <= 0) return;
      const final = plan.find((p) => p.kind === 'final' && p.base === 'total');
      if (final) final.pct = final.pct + (s.difference / s.total) * 100;
      else plan.push({ ...NEW_ROW.final, id: newRowId(), pct: (s.difference / s.total) * 100 });
      for (const p of plan) if (p.kind === 'final') p.pct = Math.round(p.pct * 10_000) / 10_000;
    });

  return (
    <div className="pay-plan">
      <div className="pay-wrap">
        <table className="pay-table">
          <colgroup>
            <col style={{ width: '17%' }} />
            <col style={{ width: '19%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '19%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: 40 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Concepto</th>
              <th>Cuándo</th>
              <th>%</th>
              <th>Sobre</th>
              <th style={{ textAlign: 'right' }}>Valor</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {schedule.rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <select
                    className="cell"
                    value={r.kind}
                    aria-label="Tipo de pago"
                    onChange={(e) => editRow(r.id, (x) => void (x.kind = e.target.value as PaymentKind))}
                  >
                    {Object.entries(PAYMENT_KIND_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="cell"
                    value={r.concept}
                    aria-label="Concepto"
                    placeholder="Ej. Anticipo de la bomba"
                    onChange={(e) => editRow(r.id, (x) => void (x.concept = e.target.value))}
                  />
                </td>
                <td>
                  <input
                    className="cell"
                    value={r.when}
                    aria-label="Cuándo se paga"
                    placeholder="Ej. Mes 1"
                    onChange={(e) => editRow(r.id, (x) => void (x.when = e.target.value))}
                  />
                </td>
                <td>
                  <NumberInput
                    value={Math.round(r.pct * 100) / 100}
                    ariaLabel="Porcentaje"
                    onChange={(n) => editRow(r.id, (x) => void (x.pct = n ?? 0))}
                  />
                </td>
                <td>
                  <select
                    className="cell"
                    value={r.base}
                    aria-label="Sobre qué se calcula"
                    onChange={(e) => editRow(r.id, (x) => void (x.base = e.target.value as PaymentBase))}
                  >
                    {Object.entries(BASE_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {r.base === 'items' ? (
                    <details className="pay-items">
                      <summary>
                        {r.itemIds.length
                          ? `${r.itemIds.length} ítem${r.itemIds.length === 1 ? '' : 's'}`
                          : 'Elegir ítems'}
                      </summary>
                      {billable.map((it) => (
                        <label key={it.id}>
                          <input
                            type="checkbox"
                            checked={r.itemIds.includes(it.id)}
                            onChange={(e) =>
                              editRow(r.id, (x) => {
                                x.itemIds = e.target.checked
                                  ? [...x.itemIds, it.id]
                                  : x.itemIds.filter((i) => i !== it.id);
                              })
                            }
                          />{' '}
                          {it.description || 'Ítem sin descripción'}
                        </label>
                      ))}
                    </details>
                  ) : null}
                  <div className="hint">base {formatCop(r.baseAmount)}</div>
                </td>
                <td className="pay-amount">
                  {formatCop(r.amount)}
                  <div className="hint">{r.shareOfTotal.toFixed(1)}% del total</div>
                </td>
                <td className="pay-remove">
                  <button
                    type="button"
                    className="icon-btn sm"
                    title={`Quitar ${r.concept}`}
                    aria-label={`Quitar ${r.concept}`}
                    onClick={() =>
                      editPlan(
                        (plan) =>
                          void plan.splice(
                            plan.findIndex((p) => p.id === r.id),
                            1,
                          ),
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
      </div>

      <div className={`pay-summary ${schedule.balanced ? 'ok' : 'bad'}`}>
        Total del contrato <b>{formatCop(schedule.total)}</b> · Programado{' '}
        <b>{formatCop(schedule.scheduled)}</b> ·{' '}
        {schedule.balanced
          ? 'El plan cubre el total ✓'
          : schedule.difference > 0
            ? `Faltan ${formatCop(schedule.difference)}`
            : `Sobran ${formatCop(-schedule.difference)}`}
      </div>

      <div className="filters" style={{ marginTop: 8 }}>
        {(Object.keys(NEW_ROW) as PaymentKind[]).map((k) => (
          <button
            key={k}
            type="button"
            className="small"
            onClick={() => editPlan((plan) => void plan.push({ ...NEW_ROW[k], id: newRowId() }))}
          >
            + {PAYMENT_KIND_LABELS[k]}
          </button>
        ))}
        <span className="pay-months">
          <NumberInput value={months} ariaLabel="Meses de obra" onChange={(n) => setMonths(n ?? 0)} /> cortes
          mensuales de
          <NumberInput
            value={monthPct}
            ariaLabel="Porcentaje de cada corte"
            onChange={(n) => setMonthPct(n ?? 0)}
          />
          %
          <button
            type="button"
            className="small"
            disabled={months <= 0 || monthPct <= 0}
            onClick={() =>
              editPlan((plan) => {
                const start = plan.filter((p) => p.kind === 'progress').length + 1;
                plan.push(...monthlyCuts(months, monthPct, start));
              })
            }
          >
            Agregar
          </button>
        </span>
        {!schedule.balanced && schedule.difference > 0 ? (
          <button type="button" className="small" onClick={completeWithFinal}>
            Completar con pago final
          </button>
        ) : null}
      </div>

      <TextArea
        label="Nota de la forma de pago (sale en la oferta)"
        value={d.terms.paymentNote}
        rows={2}
        onChange={(v) => edit((x) => void (x.terms.paymentNote = v))}
      />
    </div>
  );
}
