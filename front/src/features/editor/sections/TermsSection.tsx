import { PAYMENT_MODE_LABELS, quoteWarnings, type PaymentMode } from '@ggis/domain';
import { ScrollText } from 'lucide-react';
import { Alerts } from '../../../shared/feedback';
import { SectionTitle } from '../../../shared/SectionTitle';
import { NumberField, SelectField, TextArea, TextField } from '../../../shared/inputs';
import { useBreakdown, useDraft, useEdit } from '../store';

export function TermsSection() {
  const d = useDraft();
  const edit = useEdit();
  const breakdown = useBreakdown();
  const t = d.terms;
  const warnings = quoteWarnings(d, breakdown).filter(
    (w) => w.code === 'payment-split' || w.code === 'financing-rate',
  );

  return (
    <section className="card" id="condiciones" aria-labelledby="terms-title">
      <SectionTitle icon={<ScrollText size={16} />} id="terms-title">
        Condiciones de la oferta
      </SectionTitle>
      <div className="sub">Se aplican en los dos métodos (IVA pleno y AIU). Edítalas según el proyecto.</div>
      <div className="grid-3">
        <TextField
          label="Entrega — equipos nacionales"
          value={t.deliveryNational}
          onChange={(v) => edit((x) => void (x.terms.deliveryNational = v))}
        />
        <TextField
          label="Tiempo de importación"
          value={t.deliveryImport}
          onChange={(v) => edit((x) => void (x.terms.deliveryImport = v))}
        />
        <TextField
          label="Tiempo de instalación"
          value={t.installationTime}
          onChange={(v) => edit((x) => void (x.terms.installationTime = v))}
        />
      </div>

      <div className="section-title">Condición de pago</div>
      <div className="grid-2">
        <SelectField<PaymentMode>
          label="Modalidad"
          value={t.paymentMode}
          options={Object.entries(PAYMENT_MODE_LABELS) as Array<[PaymentMode, string]>}
          onChange={(v) => edit((x) => void (x.terms.paymentMode = v ?? 'advance_balance'))}
        />
        <NumberField
          label="Días de financiación (si aplica)"
          value={t.financingDays}
          step={15}
          onChange={(n) => edit((x) => void (x.terms.financingDays = Math.round(n)))}
        />
      </div>
      <div className="section-title">Distribución del pago (% sobre el valor de venta)</div>
      <div className="grid-3">
        <NumberField
          label="Anticipo (%)"
          value={t.advancePct}
          onChange={(n) => edit((x) => void (x.terms.advancePct = n))}
        />
        <NumberField
          label="Avance por ejecución (%)"
          value={t.progressPct}
          onChange={(n) => edit((x) => void (x.terms.progressPct = n))}
        />
        <NumberField
          label="Contra entrega (%)"
          value={t.onDeliveryPct}
          onChange={(n) => edit((x) => void (x.terms.onDeliveryPct = n))}
        />
      </div>
      <Alerts items={warnings} />

      <TextArea
        label="Alcance del suministro"
        value={t.scope}
        rows={4}
        onChange={(v) => edit((x) => void (x.terms.scope = v))}
      />
      <TextArea
        label="Garantía"
        value={t.warranty}
        onChange={(v) => edit((x) => void (x.terms.warranty = v))}
      />
      <TextArea
        label="Exclusiones y comentarios"
        value={t.exclusions}
        onChange={(v) => edit((x) => void (x.terms.exclusions = v))}
      />
      <TextArea
        label="Condiciones generales"
        value={t.generalConditions}
        rows={4}
        onChange={(v) => edit((x) => void (x.terms.generalConditions = v))}
      />
    </section>
  );
}
