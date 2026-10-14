import { Copy, Trash2 } from 'lucide-react';
import {
  adminPersonCost,
  computeAdminBreakdown,
  formatCop,
  formatPct,
  newRowId,
  PRICE_REVIEW_LABELS,
  type PriceReviewStatus,
} from '@ggis/domain';
import { useToast } from '../../../shared/feedback';
import { Checkbox, NumberField, NumberInput } from '../../../shared/inputs';
import { useBidAnalysis, useBreakdown, useDraft, useEdit } from '../store';

const REVIEW_COLOR: Record<PriceReviewStatus, string> = {
  very_low: 'var(--danger)',
  low: 'var(--warn)',
  ok: 'var(--ok)',
  high: 'var(--warn)',
  very_high: 'var(--danger)',
};

function StatusBadge({ status }: { status: PriceReviewStatus }) {
  const color = REVIEW_COLOR[status];
  return (
    <span className="badge" style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}>
      {PRICE_REVIEW_LABELS[status]}
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'danger' }) {
  return (
    <div className="bid-stat">
      <span>{label}</span>
      <b style={tone ? { color: `var(--${tone})` } : undefined}>{value}</b>
    </div>
  );
}

const signedPct = (ratio: number) => `${ratio > 0 ? '+' : ''}${formatPct(ratio * 100)}`;

/** Revisión de precios del subcontratista contra el costo directo propio (hoja REVISION PRECIOS). */
export function ReviewPanel() {
  const d = useDraft();
  const edit = useEdit();
  const breakdown = useBreakdown();
  const analysis = useBidAnalysis();
  const review = analysis.review;
  const rowById = new Map(review?.rows.map((r) => [r.id, r]));
  const billable = d.items.filter((_, i) => breakdown.items[i]?.isBillable);

  if (billable.length === 0)
    return <div className="hint">Agrega ítems con cantidad para revisar precios.</div>;

  return (
    <>
      <div className="table-scroll" style={{ maxHeight: 460 }}>
        <table style={{ minWidth: 860 }}>
          <thead>
            <tr>
              <th style={{ minWidth: 220 }}>Ítem</th>
              <th className="col-xs">Cant.</th>
              <th className="col-md">Costo directo unit.</th>
              <th className="col-md">PU subcontratista</th>
              <th className="col-sm">Diferencia</th>
              <th className="col-sm">Estado</th>
              <th className="col-md" title="Total del subcontratista − total de la oferta">
                Sobrecosto
              </th>
            </tr>
          </thead>
          <tbody>
            {billable.map((it) => {
              const r = rowById.get(it.id);
              const b = breakdown.items.find((x) => x.id === it.id);
              return (
                <tr key={it.id}>
                  <td>{it.description || '(sin descripción)'}</td>
                  <td className="num-out">{it.quantity.toLocaleString('es-CO')}</td>
                  <td className="num-out">{formatCop(b?.unitCost)}</td>
                  <td>
                    <NumberInput
                      value={it.subcontractorUnitPrice}
                      allowNull
                      placeholder="—"
                      ariaLabel="Precio unitario del subcontratista"
                      onChange={(n) =>
                        edit((x) => {
                          const y = x.items.find((i) => i.id === it.id);
                          if (y) y.subcontractorUnitPrice = n;
                        })
                      }
                    />
                  </td>
                  <td className="num-out">{r ? signedPct(r.diff) : '—'}</td>
                  <td>{r ? <StatusBadge status={r.status} /> : null}</td>
                  <td
                    className="num-out"
                    style={r && r.overcost > 0 ? { color: 'var(--danger)' } : undefined}
                  >
                    {r ? formatCop(r.overcost) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {review ? (
        <>
          <div className="bid-stats">
            <Stat label="Total subcontratista" value={formatCop(review.subTotal)} />
            <Stat label="Costo directo oferta (mismos ítems)" value={formatCop(review.offerTotal)} />
            <Stat
              label="Diferencia"
              value={signedPct(review.diff)}
              tone={review.diff > 0.2 ? 'danger' : review.diff > 0 ? 'warn' : 'ok'}
            />
            <Stat
              label="Resultado si se subcontrata"
              value={formatCop(review.resultIfSubcontracted)}
              tone={review.resultIfSubcontracted < 0 ? 'danger' : 'ok'}
            />
            <Stat label="Precio máximo de subcontrato" value={formatCop(review.maxSubcontractPrice)} />
            <Stat
              label="Reducción que debe hacer"
              value={formatPct(review.requiredReduction * 100)}
              tone={review.requiredReduction > 0 ? 'warn' : 'ok'}
            />
          </div>
          <div className="hint">
            Resultado = valor sin IVA − costo del subcontratista − administración. El precio máximo conserva
            imprevistos y utilidad.
            {review.missing
              ? ` ${review.missing} ítem(s) sin precio del subcontratista no entran a la comparación.`
              : ''}
          </div>
          {review.topOvercosts.length ? (
            <div className="alert warning">
              <b>Mayores sobrecostos</b>
              {review.topOvercosts.map((r) => (
                <div key={r.id}>
                  · {r.description}: {formatCop(r.overcost)} ({signedPct(r.diff)})
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="hint">
          Escribe el precio unitario del subcontratista en los ítems para compararlo.
        </div>
      )}
    </>
  );
}

/** Administración: % manual o desglosada en personal, gastos e indirectos (bloques A.1, A.2 y A.3). */
export function AdminPanel() {
  const d = useDraft();
  const edit = useEdit();
  const breakdown = useBreakdown();
  const bid = d.bid;
  const cd = breakdown.totals.subtotal;
  const adm = breakdown.adminBreakdown ?? computeAdminBreakdown(bid, cd);
  const bidMode = d.pricing.method === 'aiu_bid';

  return (
    <>
      <div className="section-title">Administración (A del AIU)</div>
      <div className="method-toggle" role="group" aria-label="Cómo se calcula la administración">
        {(['manual', 'breakdown'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={bid.adminMode === m ? 'active' : ''}
            aria-pressed={bid.adminMode === m}
            onClick={() => edit((x) => void (x.bid.adminMode = m))}
          >
            {m === 'manual' ? '% manual' : 'Desglosada'}
          </button>
        ))}
      </div>
      {bid.adminMode === 'manual' ? (
        <div className="hint">
          El % de administración se escribe en la sección Precio ({d.pricing.aiu.adminPct}%).
        </div>
      ) : (
        <>
          {!bidMode ? (
            <div className="alert info">
              El desglose solo se aplica al precio con el método AIU licitación.
            </div>
          ) : null}

          <div className="hint" style={{ margin: '10px 0 4px' }}>
            <b>A.1 Personal</b> — costo mensual × dedicación × meses
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Cargo</th>
                  <th className="col-md">Costo mensual</th>
                  <th className="col-sm">Dedicación %</th>
                  <th className="col-md">Meses</th>
                  <th className="col-md">Valor</th>
                  <th className="col-xs" />
                </tr>
              </thead>
              <tbody>
                {bid.adminPersonnel.map((p) => {
                  const set = (patch: Partial<typeof p>) =>
                    edit((x) => {
                      const y = x.bid.adminPersonnel.find((z) => z.id === p.id);
                      if (y) Object.assign(y, patch);
                    });
                  return (
                    <tr key={p.id}>
                      <td>
                        <input
                          className="cell"
                          value={p.role}
                          aria-label="Cargo"
                          onChange={(e) => set({ role: e.target.value })}
                        />
                      </td>
                      <td>
                        <NumberInput
                          value={p.monthlyCost}
                          ariaLabel="Costo mensual"
                          onChange={(n) => set({ monthlyCost: n ?? 0 })}
                        />
                      </td>
                      <td>
                        <NumberInput
                          value={p.dedicationPct}
                          ariaLabel="Dedicación %"
                          onChange={(n) => set({ dedicationPct: Math.min(100, n ?? 0) })}
                        />
                      </td>
                      <td>
                        <select
                          className="cell"
                          value={p.period}
                          aria-label="Meses que se cobran"
                          onChange={(e) => set({ period: e.target.value as 'contract' | 'field' })}
                        >
                          <option value="contract">Contrato ({bid.contractMonths})</option>
                          <option value="field">En campo ({bid.fieldMonths})</option>
                        </select>
                      </td>
                      <td className="num-out">{formatCop(adminPersonCost(p, bid))}</td>
                      <td>
                        <RemoveButton
                          label="Eliminar cargo"
                          onClick={() =>
                            edit(
                              (x) =>
                                void (x.bid.adminPersonnel = x.bid.adminPersonnel.filter(
                                  (z) => z.id !== p.id,
                                )),
                            )
                          }
                        />
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
            onClick={() =>
              edit(
                (x) =>
                  void x.bid.adminPersonnel.push({
                    id: newRowId(),
                    role: '',
                    monthlyCost: 0,
                    dedicationPct: 100,
                    period: 'field',
                  }),
              )
            }
          >
            + Agregar cargo
          </button>

          <div className="grid-2" style={{ marginTop: 12 }}>
            <div>
              <div className="hint" style={{ marginBottom: 4 }}>
                <b>A.2 Gastos generales</b> — valores fijos
              </div>
              <table>
                <tbody>
                  {bid.adminExpenses.map((g) => (
                    <tr key={g.id}>
                      <td>
                        <input
                          className="cell"
                          value={g.concept}
                          aria-label="Concepto"
                          onChange={(e) =>
                            edit((x) => {
                              const y = x.bid.adminExpenses.find((z) => z.id === g.id);
                              if (y) y.concept = e.target.value;
                            })
                          }
                        />
                      </td>
                      <td className="col-md">
                        <NumberInput
                          value={g.value}
                          ariaLabel="Valor"
                          onChange={(n) =>
                            edit((x) => {
                              const y = x.bid.adminExpenses.find((z) => z.id === g.id);
                              if (y) y.value = n ?? 0;
                            })
                          }
                        />
                      </td>
                      <td className="col-xs">
                        <RemoveButton
                          label="Eliminar gasto"
                          onClick={() =>
                            edit(
                              (x) =>
                                void (x.bid.adminExpenses = x.bid.adminExpenses.filter((z) => z.id !== g.id)),
                            )
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                className="small add-row"
                onClick={() =>
                  edit((x) => void x.bid.adminExpenses.push({ id: newRowId(), concept: '', value: 0 }))
                }
              >
                + Agregar gasto
              </button>
            </div>
            <div>
              <div className="hint" style={{ marginBottom: 4 }}>
                <b>A.3 Otros indirectos</b> — % del costo directo (pólizas, ICA, GMF…)
              </div>
              <table>
                <tbody>
                  {bid.adminIndirects.map((g) => (
                    <tr key={g.id}>
                      <td>
                        <input
                          className="cell"
                          value={g.concept}
                          aria-label="Concepto"
                          onChange={(e) =>
                            edit((x) => {
                              const y = x.bid.adminIndirects.find((z) => z.id === g.id);
                              if (y) y.concept = e.target.value;
                            })
                          }
                        />
                      </td>
                      <td className="col-sm">
                        <NumberInput
                          value={g.pct}
                          ariaLabel="%"
                          onChange={(n) =>
                            edit((x) => {
                              const y = x.bid.adminIndirects.find((z) => z.id === g.id);
                              if (y) y.pct = Math.min(100, n ?? 0);
                            })
                          }
                        />
                      </td>
                      <td className="num-out col-md">{formatCop((g.pct / 100) * cd)}</td>
                      <td className="col-xs">
                        <RemoveButton
                          label="Eliminar indirecto"
                          onClick={() =>
                            edit(
                              (x) =>
                                void (x.bid.adminIndirects = x.bid.adminIndirects.filter(
                                  (z) => z.id !== g.id,
                                )),
                            )
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                className="small add-row"
                onClick={() =>
                  edit((x) => void x.bid.adminIndirects.push({ id: newRowId(), concept: '', pct: 0 }))
                }
              >
                + Agregar indirecto
              </button>
            </div>
          </div>

          <div className="bid-stats">
            <Stat label="A.1 Personal" value={formatCop(adm.personnel)} />
            <Stat label="A.2 Gastos generales" value={formatCop(adm.expenses)} />
            <Stat label="A.3 Otros indirectos" value={formatCop(adm.indirects)} />
            <Stat label="Total administración" value={formatCop(adm.total)} />
            <Stat label="% sobre el costo directo" value={formatPct(adm.pct)} />
          </div>
        </>
      )}
    </>
  );
}

/** Topes del pliego sobre el valor sin IVA (materiales, mano de obra y administración). */
export function CapsPanel() {
  const d = useDraft();
  const edit = useEdit();
  const analysis = useBidAnalysis();
  const caps = d.bid.caps;

  return (
    <>
      <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Checkbox
          checked={caps.enabled}
          title="Verificar topes del pliego"
          onChange={(v) => edit((x) => void (x.bid.caps.enabled = v))}
        />
        Topes del pliego
      </div>
      {caps.enabled ? (
        <>
          <div className="grid-3">
            <NumberField
              label="Materiales y equipos máx. (%)"
              value={caps.materialsMaxPct}
              onChange={(n) => edit((x) => void (x.bid.caps.materialsMaxPct = Math.min(100, n)))}
            />
            <NumberField
              label="Mano de obra máx. (%)"
              value={caps.laborMaxPct}
              onChange={(n) => edit((x) => void (x.bid.caps.laborMaxPct = Math.min(100, n)))}
            />
            <NumberField
              label="Administración máx. (%)"
              value={caps.adminMaxPct}
              onChange={(n) => edit((x) => void (x.bid.caps.adminMaxPct = Math.min(100, n)))}
            />
          </div>
          <table style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th>Componente</th>
                <th className="col-md">Valor</th>
                <th className="col-sm">Participación</th>
                <th className="col-sm">Tope</th>
                <th className="col-sm">¿Cumple?</th>
              </tr>
            </thead>
            <tbody>
              {analysis.caps.map((c) => (
                <tr key={c.key}>
                  <td>{c.label}</td>
                  <td className="num-out">{formatCop(c.value)}</td>
                  <td className="num-out">{formatPct(c.sharePct)}</td>
                  <td className="num-out">{formatPct(c.maxPct)}</td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        color: c.ok ? 'var(--ok)' : 'var(--danger)',
                        background: `color-mix(in srgb, ${c.ok ? 'var(--ok)' : 'var(--danger)'} 16%, transparent)`,
                      }}
                    >
                      {c.ok ? 'SÍ' : 'NO'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="hint" style={{ marginTop: 6 }}>
            Base: valor sin IVA {formatCop(analysis.totalWithoutVat)}.
            {analysis.minProfitPctForMaterialsCap !== null
              ? ` Utilidad mínima para cumplir el tope de materiales: ${formatPct(analysis.minProfitPctForMaterialsCap)}.`
              : ''}
          </div>
        </>
      ) : (
        <div className="hint">
          Actívalo si el pliego limita la participación de materiales, mano de obra o administración.
        </div>
      )}
    </>
  );
}

/** Valores para diligenciar en la plataforma de licitación (hoja LICIFY). */
export function LicifyPanel() {
  const analysis = useBidAnalysis();
  const notify = useToast();
  const l = analysis.licify;
  const rows: Array<[string, string, string]> = [
    ['Suministro', formatCop(l.supply), String(Math.round(l.supply))],
    ['Instalación', formatCop(l.installation), String(Math.round(l.installation))],
    ['Costo directo', formatCop(l.directCost), String(Math.round(l.directCost))],
    ['% Administración', formatPct(l.adminPct), String(l.adminPct)],
    ['% Imprevistos', formatPct(l.contingencyPct), String(l.contingencyPct)],
    ['% Utilidad', formatPct(l.profitPct), String(l.profitPct)],
    ['% IVA', formatPct(l.vatPct), String(l.vatPct)],
    ['Valor total', formatCop(l.total), String(Math.round(l.total))],
  ];

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify(`${label} copiado`);
    } catch {
      notify('No se pudo copiar al portapapeles', true);
    }
  }

  return (
    <>
      <div className="section-title">Datos para Licify</div>
      <div className="licify-grid">
        {rows.map(([label, shown, raw]) => (
          <button
            key={label}
            type="button"
            className="licify-cell"
            onClick={() => void copy(label, raw)}
            title="Copiar valor"
          >
            <span>{label}</span>
            <b>{shown}</b>
            <Copy size={13} aria-hidden />
          </button>
        ))}
      </div>
      {analysis.estimatedApuLines > 0 ? (
        <div className="alert warning">
          {analysis.estimatedApuLines} línea(s) de APU usan precios estimados ({analysis.estimatedSupplies}{' '}
          insumos): verifícalos antes de presentar la oferta.
        </div>
      ) : null}
    </>
  );
}

/** Aclaraciones y exclusiones de la oferta (hoja ACLARACIONES). */
export function ClarificationsPanel() {
  const d = useDraft();
  const edit = useEdit();
  const list = d.bid.clarifications;
  const set = (id: string, patch: Partial<(typeof list)[number]>) =>
    edit((x) => {
      const y = x.bid.clarifications.find((z) => z.id === id);
      if (y) Object.assign(y, patch);
    });

  return (
    <>
      <div className="section-title">Aclaraciones de la oferta</div>
      {list.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="col-xs">N°</th>
                <th style={{ minWidth: 160 }}>Tema</th>
                <th style={{ minWidth: 280 }}>Observación</th>
                <th style={{ minWidth: 160 }}>Impacto</th>
                <th className="col-xs" />
              </tr>
            </thead>
            <tbody>
              {list.map((c, i) => (
                <tr key={c.id}>
                  <td className="num-out">{i + 1}</td>
                  <td>
                    <input
                      className="cell"
                      value={c.topic}
                      aria-label="Tema"
                      onChange={(e) => set(c.id, { topic: e.target.value })}
                    />
                  </td>
                  <td>
                    <textarea
                      className="cell"
                      rows={2}
                      value={c.observation}
                      aria-label="Observación"
                      onChange={(e) => set(c.id, { observation: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="cell"
                      value={c.impact}
                      aria-label="Impacto"
                      onChange={(e) => set(c.id, { impact: e.target.value })}
                    />
                  </td>
                  <td>
                    <RemoveButton
                      label="Eliminar aclaración"
                      onClick={() =>
                        edit(
                          (x) =>
                            void (x.bid.clarifications = x.bid.clarifications.filter((z) => z.id !== c.id)),
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="hint">Supuestos, exclusiones y condiciones que acompañan la oferta.</div>
      )}
      <button
        type="button"
        className="small add-row"
        onClick={() =>
          edit(
            (x) => void x.bid.clarifications.push({ id: newRowId(), topic: '', observation: '', impact: '' }),
          )
        }
      >
        + Agregar aclaración
      </button>
    </>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="ghost-danger" aria-label={label} onClick={onClick}>
      <Trash2 size={14} />
    </button>
  );
}
