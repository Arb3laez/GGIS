import { useState } from 'react';
import { Calculator, Sparkles } from 'lucide-react';
import {
  PRICING_METHOD_LABELS,
  PRICING_METHODS,
  quoteWarnings,
  suggestAiu,
  suggestMargin,
} from '@ggis/domain';
import { Alerts } from '../../../shared/feedback';
import { NumberField } from '../../../shared/inputs';
import { SectionTitle } from '../../../shared/SectionTitle';
import { useBreakdown, useDraft, useEdit } from '../store';

/**
 * Parámetros del precio, con la misma estructura de la calculadora v68:
 * utilidad → costos internos (en los dos métodos) → IVA (simple) o AIU (encima del subtotal).
 */
export function PricingSection() {
  const d = useDraft();
  const edit = useEdit();
  const breakdown = useBreakdown();
  const [marginReasons, setMarginReasons] = useState<string[] | null>(null);
  const [aiuReasons, setAiuReasons] = useState<string[] | null>(null);
  const p = d.pricing;
  const aiuMode = p.method === 'aiu';
  const aiuWarnings = quoteWarnings(d, breakdown).filter((w) => w.code.startsWith('aiu'));

  function suggestAiuValues() {
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
  }

  return (
    <section className="card" id="precio" aria-labelledby="pricing-title">
      <SectionTitle icon={<Calculator size={16} />} id="pricing-title">
        Precio final
      </SectionTitle>

      <div className="method-toggle" role="group" aria-label="Método de precio">
        {PRICING_METHODS.map((m) => (
          <button
            key={m}
            type="button"
            className={p.method === m ? 'active' : ''}
            aria-pressed={p.method === m}
            onClick={() => edit((x) => void (x.pricing.method = m))}
          >
            {PRICING_METHOD_LABELS[m]}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
        <div style={{ flex: 1 }}>
          <NumberField
            label="% de utilidad sobre el precio de venta (margen, no recargo sobre el costo)"
            value={p.marginPct}
            onChange={(n) => edit((x) => void (x.pricing.marginPct = Math.min(95, n)))}
          />
        </div>
        <button
          type="button"
          title="Sugerir según monto, tipo de solución, complejidad e importados"
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
        Si pones 30%, el precio de venta queda calculado para que el 30% de ese precio sea utilidad — coincide
        con el % que ves en la columna "Margen" de cada ítem. La complejidad del proyecto (arriba, en "Cliente
        y proyecto") también ajusta este % al presionar "Sugerir".
      </div>
      {marginReasons ? <Reasons lines={marginReasons} /> : null}

      <div className="section-title">Costos que se suman antes del subtotal (en los dos métodos)</div>
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
      </div>
      <div className="grid-2" style={{ marginTop: 10 }}>
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
      </div>
      <div className="hint" style={{ marginTop: 6 }}>
        Estos son tu costo interno real (junto con la Utilidad de arriba) — valen igual en los dos métodos y
        ya están cubiertos antes de calcular cualquier otra cosa. El AIU, más abajo, es aparte: son los
        porcentajes que le presentas al cliente, y los puedes ajustar independientemente.
      </div>

      {aiuMode ? (
        <>
          <div className="section-title">Solo en "AIU" — independiente de la utilidad interna de arriba</div>
          <div className="grid-2">
            <NumberField
              label="Administración (%) — usual 8% a 15%"
              value={p.aiu.adminPct}
              onChange={(n) => edit((x) => void (x.pricing.aiu.adminPct = n))}
            />
            <NumberField
              label="Imprevistos (%) — usual 1% a 5%"
              value={p.aiu.contingencyPct}
              onChange={(n) => edit((x) => void (x.pricing.aiu.contingencyPct = n))}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
              <div style={{ flex: 1 }}>
                <NumberField
                  label="Utilidad (%) — usual 3% a 8% en AIU"
                  value={p.aiu.profitPct}
                  onChange={(n) => edit((x) => void (x.pricing.aiu.profitPct = n))}
                />
              </div>
              <button type="button" title="Sugerir AIU según el proyecto" onClick={suggestAiuValues}>
                <Sparkles size={15} /> Sugerir
              </button>
            </div>
            <NumberField
              label="IVA sobre la utilidad (%)"
              value={p.aiu.vatOnProfitPct}
              onChange={(n) => edit((x) => void (x.pricing.aiu.vatOnProfitPct = n))}
            />
          </div>
          <Alerts items={aiuWarnings} />
          {aiuReasons ? <Reasons lines={aiuReasons} /> : null}
        </>
      ) : (
        <>
          <div className="section-title">Solo en "Subtotal + IVA"</div>
          <div className="grid-3">
            <NumberField
              label="IVA sobre el subtotal (%)"
              value={p.vatPct}
              onChange={(n) => edit((x) => void (x.pricing.vatPct = n))}
            />
          </div>
        </>
      )}
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
