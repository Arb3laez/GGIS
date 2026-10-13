import { ReceiptText } from 'lucide-react';
import { formatCop, formatPct, negotiationFloor, quoteWarnings } from '@ggis/domain';
import { Alerts } from '../../shared/feedback';
import { useBreakdown, useDraft } from './store';

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

  return (
    <aside aria-label="Resumen de precios" className="no-print">
      <div className="total-card">
        <div className="k">
          Total oferta <ReceiptText size={18} />
        </div>
        <div className="v">{formatCop(t.total)}</div>
        <div className="d">
          {billable} ítem{billable === 1 ? '' : 's'} · {p.method === 'aiu' ? 'AIU' : `IVA ${p.vatPct}%`} ·
          margen {p.marginPct}%
        </div>
      </div>

      <Alerts items={warnings} />

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
    </aside>
  );
}
