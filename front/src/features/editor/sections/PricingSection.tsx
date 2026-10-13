import { useState } from 'react';
import { Calculator, Sparkles } from 'lucide-react';
import { quoteWarnings, suggestAiu, suggestMargin } from '@ggis/domain';
import { Alerts } from '../../../shared/feedback';
import { NumberField } from '../../../shared/inputs';
import { SectionTitle } from '../../../shared/SectionTitle';
import { useBreakdown, useDraft, useEdit } from '../store';

/** Parámetros del precio. El resultado se ve en vivo en la columna derecha. */
export function PricingSection() {
  const d = useDraft();
  const edit = useEdit();
  const breakdown = useBreakdown();
  const [marginReasons, setMarginReasons] = useState<string[] | null>(null);
  const [aiuReasons, setAiuReasons] = useState<string[] | null>(null);
  const p = d.pricing;
  const aiuWarning = quoteWarnings(d, breakdown).filter((w) => w.code === 'aiu-total');

  return (
    <section className="card" id="precio" aria-labelledby="pricing-title">
      <SectionTitle icon={<Calculator size={16} />} id="pricing-title">
        Precio final
      </SectionTitle>
      <div className="sub">El resultado se actualiza en vivo en el resumen de la derecha.</div>

      <div className="method-toggle" role="group" aria-label="Método de precio">
        {(['simple', 'aiu'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={p.method === m ? 'active' : ''}
            aria-pressed={p.method === m}
            onClick={() => edit((x) => void (x.pricing.method = m))}
          >
            {m === 'simple' ? 'Subtotal + IVA' : 'AIU'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
        <div style={{ flex: 1 }}>
          <NumberField
            label="Utilidad sobre el precio de venta (%) — margen, no recargo"
            value={p.marginPct}
            onChange={(n) => edit((x) => void (x.pricing.marginPct = Math.min(95, n)))}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            const s = suggestMargin(d, breakdown.totals);
            edit((x) => void (x.pricing.marginPct = s.value));
            setMarginReasons([`Sugerencia: ${s.value}% de utilidad`, ...s.reasons]);
          }}
        >
          <Sparkles size={15} /> Sugerir
        </button>
      </div>
      <div className="hint" style={{ marginTop: 6 }}>
        Con 30%, el precio queda calculado para que el 30% del precio de venta sea utilidad (coincide con la
        columna "Margen" de los ítems).
      </div>
      {marginReasons ? <Reasons lines={marginReasons} /> : null}

      <div className="section-title">Costos que se suman antes del subtotal</div>
      <div className="grid-3">
        <NumberField
          label="Pólizas (%)"
          value={p.policiesPct}
          onChange={(n) => edit((x) => void (x.pricing.policiesPct = n))}
        />
        <NumberField
          label="Impuestos (%)"
          value={p.taxesPct}
          onChange={(n) => edit((x) => void (x.pricing.taxesPct = n))}
        />
        <NumberField
          label="Financiamiento (%)"
          value={p.financingPct}
          onChange={(n) => edit((x) => void (x.pricing.financingPct = n))}
        />
        <NumberField
          label="Imprevistos internos (%)"
          value={p.contingencyPct}
          onChange={(n) => edit((x) => void (x.pricing.contingencyPct = n))}
        />
        <NumberField
          label="Administración interna (%)"
          value={p.adminPct}
          onChange={(n) => edit((x) => void (x.pricing.adminPct = n))}
        />
        {p.method === 'simple' ? (
          <NumberField
            label="IVA sobre el subtotal (%)"
            value={p.vatPct}
            onChange={(n) => edit((x) => void (x.pricing.vatPct = n))}
          />
        ) : null}
      </div>

      {p.method === 'aiu' ? (
        <>
          <div className="section-title">AIU para el cliente — independiente de la utilidad interna</div>
          <div className="grid-2">
            <NumberField
              label="Administración (%) — usual 8–15%"
              value={p.aiu.adminPct}
              onChange={(n) => edit((x) => void (x.pricing.aiu.adminPct = n))}
            />
            <NumberField
              label="Imprevistos (%) — usual 1–5%"
              value={p.aiu.contingencyPct}
              onChange={(n) => edit((x) => void (x.pricing.aiu.contingencyPct = n))}
            />
            <NumberField
              label="Utilidad (%) — usual 3–8%"
              value={p.aiu.profitPct}
              onChange={(n) => edit((x) => void (x.pricing.aiu.profitPct = n))}
            />
            <NumberField
              label="IVA sobre la utilidad (%)"
              value={p.aiu.vatOnProfitPct}
              onChange={(n) => edit((x) => void (x.pricing.aiu.vatOnProfitPct = n))}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              const s = suggestAiu(d, breakdown.totals);
              edit((x) => {
                x.pricing.aiu.adminPct = s.value.adminPct;
                x.pricing.aiu.contingencyPct = s.value.contingencyPct;
                x.pricing.aiu.profitPct = s.value.profitPct;
              });
              setAiuReasons([
                `Sugerencia: A ${s.value.adminPct}% · I ${s.value.contingencyPct}% · U ${s.value.profitPct}%`,
                ...s.reasons,
              ]);
            }}
          >
            <Sparkles size={15} /> Sugerir AIU
          </button>
          {aiuReasons ? <Reasons lines={aiuReasons} /> : null}
          <Alerts items={aiuWarning} />
        </>
      ) : null}
    </section>
  );
}

function Reasons({ lines }: { lines: string[] }) {
  const [head, ...rest] = lines;
  return (
    <div className="alert info">
      <b>{head}</b>
      {rest.map((r) => (
        <div key={r}>· {r}</div>
      ))}
      <div style={{ opacity: 0.75 }}>Puedes ajustarlo a mano.</div>
    </div>
  );
}
