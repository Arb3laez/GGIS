import { formatCop, formatPct, negotiationFloor, quoteWarnings } from '@ggis/domain';
import { Alerts } from '../../shared/feedback';
import { useBreakdown, useDraft } from './store';

function Row({
  label,
  value,
  pct,
  strong,
  top,
}: {
  label: string;
  value: string;
  /** Porcentaje que se muestra entre paréntesis al lado del valor. */
  pct?: number;
  strong?: boolean;
  /** Línea superior para separar los totales. */
  top?: boolean;
}) {
  return (
    <div className={`srow${strong ? ' strong' : ''}${top ? ' top' : ''}`}>
      <span>{label}</span>
      <span>
        {value}
        {pct !== undefined ? <em className="pct">({formatPct(pct, 0)})</em> : null}
      </span>
    </div>
  );
}

/** Columna derecha del editor: resumen de costos, precio, margen y piso de negociación. */
export function SummaryAside() {
  const d = useDraft();
  const breakdown = useBreakdown();
  const t = breakdown.totals;
  const p = d.pricing;
  const nego = negotiationFloor(t);
  const warnings = quoteWarnings(d, breakdown).filter((w) => w.level === 'danger' || w.level === 'warning');
  const marginColor =
    nego.grossMarginPct >= 30 ? 'var(--ok)' : nego.grossMarginPct >= 20 ? 'var(--warn)' : 'var(--danger)';

  return (
    <aside aria-label="Resumen de precios" className="no-print">
      <Alerts items={warnings} />

      <div className="summary">
        <h2>Resumen</h2>

        <Row label="Materiales" value={formatCop(t.materials)} />
        <Row label="Mano de obra (instalación + personal)" value={formatCop(t.itemLabor + t.staff)} />
        <Row label="Mano de obra por actividad" value={formatCop(t.laborActivities)} />
        <Row label="Otros costos del proyecto" value={formatCop(t.otherCosts)} />

        <Row label="Costo directo (mat + M.O. + personal + otros)" value={formatCop(t.directCost)} strong />
        <Row label="Pólizas" value={formatCop(t.policies)} pct={p.policiesPct} />
        <Row label="Impuestos" value={formatCop(t.taxes)} pct={p.taxesPct} />
        <Row label="Financiamiento" value={formatCop(t.financing)} pct={p.financingPct} />
        <Row label="Imprevistos" value={formatCop(t.contingency)} pct={p.contingencyPct} />
        <Row label="Administración" value={formatCop(t.adminCost)} pct={p.adminPct} />

        <Row label="= COSTO TOTAL" value={formatCop(t.totalCost)} strong top />
        <Row label="Utilidad esperada sobre el costo total" value={formatCop(t.profit)} pct={p.marginPct} />
        <Row label="SUBTOTAL" value={formatCop(t.subtotal)} strong top />
        {t.aiu ? (
          <>
            <Row label="Administración" value={formatCop(t.aiu.admin)} pct={p.aiu.adminPct} />
            <Row label="Imprevisto" value={formatCop(t.aiu.contingency)} pct={p.aiu.contingencyPct} />
            <Row label="Utilidad" value={formatCop(t.aiu.profit)} pct={p.aiu.profitPct} />
            <Row
              label="IVA sobre la utilidad"
              value={formatCop(t.aiu.vatOnProfit)}
              pct={p.aiu.vatOnProfitPct}
            />
          </>
        ) : (
          <Row label="IVA" value={formatCop(t.vat)} pct={p.vatPct} />
        )}

        <div className="srow total">
          <span>Total oferta</span>
          <span>{formatCop(t.total)}</span>
        </div>

        <div className="nego-block">
          <div className="nego-title">Margen y piso de negociación</div>
          <div className="nego-row">
            <span>Margen bruto real sobre venta</span>
            <b style={{ color: marginColor }}>{formatPct(nego.grossMarginPct)}</b>
          </div>
          <div className="nego-row">
            <span>Descuento máx. sin perder plata</span>
            <b>{formatPct(nego.maxDiscountPct)}</b>
          </div>
          <div className="nego-row">
            <span>Descuento máx. dejando 15% de utilidad</span>
            <b style={{ color: 'var(--warn)' }}>{formatPct(nego.discountKeepingFloorPct)}</b>
          </div>
          <div className="nego-row">
            <span>Precio piso recomendado</span>
            <b>{formatCop(nego.floorPrice)}</b>
          </div>
          {nego.belowIndustryReference ? (
            <p className="nego-warn">
              ⚠ Margen por debajo del 28%: la referencia de la industria de integración indica que el gasto
              administrativo suele consumir cerca de eso.
            </p>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
