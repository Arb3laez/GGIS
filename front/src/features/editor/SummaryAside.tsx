import { ReceiptText } from 'lucide-react';
import { formatCop, formatPct, negotiationFloor, quoteWarnings } from '@ggis/domain';
import { Alerts } from '../../shared/feedback';
import { useBidAnalysis, useBreakdown, useDraft } from './store';

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`srow${strong ? ' strong' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** Columna derecha del editor: total, desglose, piso de negociación y avisos, siempre visibles. */
export function SummaryAside() {
  const d = useDraft();
  const breakdown = useBreakdown();
  const t = breakdown.totals;
  const p = d.pricing;
  const nego = negotiationFloor(t);
  const warnings = quoteWarnings(d, breakdown).filter((w) => w.level === 'danger' || w.level === 'warning');
  const billable = breakdown.items.filter((i) => i.isBillable).length;
  const bidMode = p.method === 'aiu_bid';

  return (
    <aside aria-label="Resumen de precios" className="no-print">
      <div className="total-card">
        <div className="k">
          Total oferta <ReceiptText size={18} />
        </div>
        <div className="v">{formatCop(t.total)}</div>
        <div className="d">
          {billable} ítem{billable === 1 ? '' : 's'} ·{' '}
          {bidMode
            ? `AIU licitación ${formatPct(breakdown.aiuAdminPct)} / ${p.aiu.contingencyPct}% / ${p.aiu.profitPct}%`
            : `${p.method === 'aiu' ? 'AIU' : `IVA ${p.vatPct}%`} · margen ${p.marginPct}%`}
        </div>
      </div>

      <Alerts items={warnings} />

      {bidMode ? (
        <BidSummary />
      ) : (
        <div className="summary">
          <h2>Desglose</h2>
          <Row label="Materiales" value={formatCop(t.materials)} />
          <Row label="M.O. instalación + personal" value={formatCop(t.itemLabor + t.staff)} />
          <Row label="M.O. por actividad" value={formatCop(t.laborActivities)} />
          <Row label="Otros costos" value={formatCop(t.otherCosts)} />
          <Row label="Costo directo" value={formatCop(t.directCost)} strong />
          <Row
            label={`Pólizas ${p.policiesPct}% · Impuestos ${p.taxesPct}%`}
            value={formatCop(t.policies + t.taxes)}
          />
          <Row
            label={`Financ. ${p.financingPct}% · Imprev. ${p.contingencyPct}% · Admin. ${p.adminPct}%`}
            value={formatCop(t.financing + t.contingency + t.adminCost)}
          />
          <Row label="Costo total" value={formatCop(t.totalCost)} strong />
          <Row label={`Utilidad (${p.marginPct}%)`} value={formatCop(t.profit)} />
          <Row label="Subtotal (valor venta)" value={formatCop(t.subtotal)} strong />
          {t.aiu ? (
            <>
              <Row
                label={`A ${p.aiu.adminPct}% · I ${p.aiu.contingencyPct}% · U ${p.aiu.profitPct}%`}
                value={formatCop(t.aiu.admin + t.aiu.contingency + t.aiu.profit)}
              />
              <Row
                label={`IVA sobre la utilidad (${p.aiu.vatOnProfitPct}%)`}
                value={formatCop(t.aiu.vatOnProfit)}
              />
            </>
          ) : (
            <Row label={`IVA (${p.vatPct}%)`} value={formatCop(t.vat)} />
          )}
        </div>
      )}

      {bidMode ? null : (
        <div className="nego">
          <div className="k">Piso de negociación</div>
          <div>
            <span>Margen bruto sobre venta</span>
            <b
              style={{
                color:
                  nego.grossMarginPct >= 30
                    ? 'var(--ok)'
                    : nego.grossMarginPct >= 20
                      ? 'var(--warn)'
                      : 'var(--danger)',
              }}
            >
              {formatPct(nego.grossMarginPct)}
            </b>
          </div>
          <div>
            <span>Descuento máx. sin perder</span>
            <b>{formatPct(nego.maxDiscountPct)}</b>
          </div>
          <div>
            <span>Descuento máx. dejando 15%</span>
            <b style={{ color: 'var(--accent)' }}>{formatPct(nego.discountKeepingFloorPct)}</b>
          </div>
          <div>
            <span>Precio piso</span>
            <b>{formatCop(nego.floorPrice)}</b>
          </div>
          {nego.belowIndustryReference ? (
            <p className="hint" style={{ color: 'var(--warn)', margin: '6px 0 0', lineHeight: 1.5 }}>
              Margen bajo 28%: en integración, el gasto administrativo suele consumir cerca de eso.
            </p>
          ) : null}
        </div>
      )}
    </aside>
  );
}

/** Desglose para AIU licitación: costo directo (APU) + A + I + U + IVA sobre U, y topes del pliego. */
function BidSummary() {
  const d = useDraft();
  const breakdown = useBreakdown();
  const analysis = useBidAnalysis();
  const t = breakdown.totals;
  const p = d.pricing;
  const aiu = t.aiu;
  return (
    <>
      <div className="summary">
        <h2>Desglose licitación</h2>
        <Row label="Suministro" value={formatCop(analysis.supplyTotal)} />
        <Row label="Instalación" value={formatCop(analysis.installTotal)} />
        <Row label="Costo directo" value={formatCop(t.subtotal)} strong />
        {aiu ? (
          <>
            <Row label={`Administración ${formatPct(breakdown.aiuAdminPct)}`} value={formatCop(aiu.admin)} />
            <Row label={`Imprevistos ${p.aiu.contingencyPct}%`} value={formatCop(aiu.contingency)} />
            <Row label={`Utilidad ${p.aiu.profitPct}%`} value={formatCop(aiu.profit)} />
            <Row label="Valor sin IVA" value={formatCop(aiu.subtotal)} strong />
            <Row
              label={`IVA sobre la utilidad (${p.aiu.vatOnProfitPct}%)`}
              value={formatCop(aiu.vatOnProfit)}
            />
          </>
        ) : null}
      </div>
      {d.bid.caps.enabled ? (
        <div className="nego">
          <div className="k">Topes del pliego</div>
          {analysis.caps.map((c) => (
            <div key={c.key}>
              <span>
                {c.label} (máx. {formatPct(c.maxPct)})
              </span>
              <b style={{ color: c.ok ? 'var(--ok)' : 'var(--danger)' }}>{formatPct(c.sharePct)}</b>
            </div>
          ))}
        </div>
      ) : null}
      {analysis.review ? (
        <div className="nego">
          <div className="k">Si se subcontrata</div>
          <div>
            <span>Resultado</span>
            <b style={{ color: analysis.review.resultIfSubcontracted < 0 ? 'var(--danger)' : 'var(--ok)' }}>
              {formatCop(analysis.review.resultIfSubcontracted)}
            </b>
          </div>
          <div>
            <span>Reducción requerida</span>
            <b>{formatPct(analysis.review.requiredReduction * 100)}</b>
          </div>
        </div>
      ) : null}
    </>
  );
}
