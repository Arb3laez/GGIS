import {
  BUSINESS_UNIT_LABELS,
  COMPLEXITY_LABELS,
  DEFAULT_COMPLEXITY_BY_UNIT,
  findStage,
  FOLLOW_UP_STAGES,
  formatPct,
  LOSS_REASON_LABELS,
  QUOTE_STATUS_LABELS,
  SEND_STATUS_LABELS,
  SERVICE_TYPE_LABELS,
  TEMPERATURE_LABELS,
  TRANSACTION_TYPE_LABELS,
  type BusinessUnit,
  type Complexity,
  type LossReason,
  type QuoteStatus,
  type SendStatus,
  type ServiceType,
  type Temperature,
  type TransactionType,
} from '@ggis/domain';
import { UserRound } from 'lucide-react';
import { useHistory } from '../../../api/queries';
import { SectionTitle } from '../../../shared/SectionTitle';
import { NumberField, SelectField, TextArea, TextField } from '../../../shared/inputs';
import { useDraft, useEdit, useEditor } from '../store';

const entries = <K extends string>(r: Record<K, string>) => Object.entries(r) as Array<[K, string]>;
const COMPLEXITY_OPTIONS: Array<[Complexity, string]> = [
  ['low', 'Baja — instalación estándar'],
  ['medium', 'Media — complejidad normal'],
  ['high', 'Alta — obra civil / normativa exigente'],
];

/** Opciones del nivel de oferta; conserva una etapa escrita en versiones anteriores. */
function stageOptions(current: string | null): Array<[string, string]> {
  const opts: Array<[string, string]> = FOLLOW_UP_STAGES.map((st) => [
    st.value,
    st.label + (st.pct != null ? ` (${st.pct}%)` : ''),
  ]);
  if (current && !findStage(current)) opts.push([current, `${current} (anterior)`]);
  return opts;
}

function stageHint(stage: string | null, since: string | null): string {
  const st = findStage(stage);
  const parts = [st?.pct != null ? `Probabilidad de cierre ${st.pct}%` : 'Probabilidad de cierre sin definir'];
  if (stage && since) parts.push(`desde el ${since}`);
  return parts.join(' · ');
}

export function ClientSection() {
  const d = useDraft();
  const edit = useEdit();
  const quoteId = useEditor((s) => s.quoteId);

  return (
    <section className="card" id="cliente" aria-labelledby="client-title">
      <SectionTitle icon={<UserRound size={16} />} id="client-title">
        Cliente y proyecto
      </SectionTitle>
      <div className="grid-2">
        <TextField
          label="Cliente / empresa"
          value={d.client.name}
          placeholder="Nombre del cliente"
          onChange={(v) => edit((x) => void (x.client.name = v))}
        />
        <div className="grid-2">
          <TextField
            label="Proyecto / sucursal"
            value={d.client.project}
            placeholder="Ej: Sistema CCTV bodega principal"
            onChange={(v) => edit((x) => void (x.client.project = v))}
          />
          <TextField
            label="Identificación (NIT / CC)"
            value={d.client.identification}
            placeholder="900123456-7"
            onChange={(v) => edit((x) => void (x.client.identification = v))}
          />
        </div>
        <div className="grid-2">
          <TextField
            label="Contacto"
            value={d.client.contact}
            onChange={(v) => edit((x) => void (x.client.contact = v))}
          />
          <TextField
            label="Teléfono / celular"
            type="tel"
            value={d.client.phone}
            placeholder="300 123 4567"
            onChange={(v) => edit((x) => void (x.client.phone = v))}
          />
        </div>
        <div className="grid-2">
          <TextField
            label="Teléfono 2"
            type="tel"
            value={d.client.phone2}
            onChange={(v) => edit((x) => void (x.client.phone2 = v))}
          />
          <TextField
            label="Correo del cliente"
            type="email"
            value={d.client.email}
            placeholder="cliente@empresa.com"
            onChange={(v) => edit((x) => void (x.client.email = v.trim()))}
          />
        </div>
        <div>
          <SelectField<BusinessUnit>
            label="Unidad de negocio"
            value={d.businessUnit}
            emptyLabel="— Seleccionar —"
            options={entries(BUSINESS_UNIT_LABELS)}
            onChange={(v) =>
              edit((x) => {
                x.businessUnit = v;
                if (v) x.complexity = DEFAULT_COMPLEXITY_BY_UNIT[v];
              })
            }
          />
          <SelectField<ServiceType>
            label="Tipo de servicio"
            value={d.serviceType}
            emptyLabel="— Seleccionar —"
            options={entries(SERVICE_TYPE_LABELS)}
            onChange={(v) => edit((x) => void (x.serviceType = v))}
          />
          {d.businessUnit || d.serviceType ? (
            <div className="hint">
              {[
                d.businessUnit ? BUSINESS_UNIT_LABELS[d.businessUnit] : null,
                d.serviceType ? SERVICE_TYPE_LABELS[d.serviceType] : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          ) : null}
        </div>
        <div>
          <SelectField<Complexity>
            label="Complejidad del proyecto"
            value={d.complexity}
            options={COMPLEXITY_OPTIONS}
            onChange={(v) => edit((x) => void (x.complexity = v ?? 'medium'))}
            hint={`Se sugiere sola según la unidad de negocio. Afecta el % de margen sugerido. Actual: ${COMPLEXITY_LABELS[d.complexity]}.`}
          />
          <HistoryHint unit={d.businessUnit} excludeId={quoteId} />
        </div>
        <div className="grid-2">
          <SelectField<QuoteStatus>
            label="Estado de la cotización"
            value={d.status}
            options={entries(QUOTE_STATUS_LABELS)}
            onChange={(v) => edit((x) => void (x.status = v ?? 'sent'))}
          />
          <SelectField<string>
            label="Nivel de oferta (etapa)"
            value={d.stage}
            emptyLabel="Etapa sin definir"
            options={stageOptions(d.stage)}
            onChange={(v) => edit((x) => void (x.stage = v))}
            hint={stageHint(d.stage, d.stageUpdatedOn)}
          />
        </div>
        {d.status === 'lost' ? (
          <SelectField<LossReason>
            label="Motivo de la pérdida"
            value={d.lossReason}
            emptyLabel="— Seleccionar —"
            options={entries(LOSS_REASON_LABELS)}
            onChange={(v) => edit((x) => void (x.lossReason = v))}
          />
        ) : (
          <TextField
            label="Próximo seguimiento"
            type="date"
            value={d.nextFollowUp ?? ''}
            onChange={(v) => edit((x) => void (x.nextFollowUp = v || null))}
          />
        )}
        <TextField
          label="Ciudad del servicio"
          value={d.client.city}
          onChange={(v) => edit((x) => void (x.client.city = v))}
        />
        <TextField
          label="Fecha de la oferta"
          type="date"
          value={d.issueDate}
          onChange={(v) => v && edit((x) => void (x.issueDate = v))}
        />
        <NumberField
          label="Validez de la oferta (días)"
          value={d.validDays}
          onChange={(n) => edit((x) => void (x.validDays = Math.max(1, Math.round(n))))}
        />
      </div>

      <div className="section-title">Seguimiento comercial</div>
      <div className="grid-3">
        <SelectField<Temperature>
          label="Temperatura"
          value={d.followUp.temperature}
          emptyLabel="Sin temperatura"
          options={entries(TEMPERATURE_LABELS)}
          onChange={(v) => edit((x) => void (x.followUp.temperature = v))}
        />
        <SelectField<SendStatus>
          label="Estado de envío"
          value={d.followUp.sendStatus}
          emptyLabel="— Seleccionar —"
          options={entries(SEND_STATUS_LABELS)}
          onChange={(v) => edit((x) => void (x.followUp.sendStatus = v))}
        />
        <TextField
          label="Cierre estimado"
          type="date"
          value={d.followUp.closeDate ?? ''}
          onChange={(v) => edit((x) => void (x.followUp.closeDate = v || null))}
        />
        <SelectField<TransactionType>
          label="Tipo de transacción"
          value={d.transactionType}
          options={entries(TRANSACTION_TYPE_LABELS)}
          onChange={(v) => edit((x) => void (x.transactionType = v ?? 'quote'))}
        />
      </div>
      <TextArea
        label="Observación"
        value={d.followUp.note}
        rows={2}
        onChange={(v) => edit((x) => void (x.followUp.note = v))}
      />
    </section>
  );
}

function HistoryHint({ unit, excludeId }: { unit: BusinessUnit | null; excludeId: string | null }) {
  const { data } = useHistory(unit, excludeId);
  if (!unit || !data) return null;
  const r = data.recommendation;
  if (!r) {
    return (
      <div className="hint" style={{ marginTop: 6 }}>
        Aún no hay proyectos de {BUSINESS_UNIT_LABELS[unit]} adjudicados y cerrados con costo real. Cuando los
        cierres, aquí verás una recomendación basada en tu historial.
      </div>
    );
  }
  return (
    <div className="alert info">
      <b>Historial real de {BUSINESS_UNIT_LABELS[unit]}</b> ({r.projects} proyecto{r.projects > 1 ? 's' : ''}{' '}
      cerrado
      {r.projects > 1 ? 's' : ''}): el costo real quedó en promedio{' '}
      <b>
        {r.avgCostDeviationPct > 0 ? '+' : ''}
        {formatPct(r.avgCostDeviationPct)}
      </b>{' '}
      frente a lo presupuestado, con margen real promedio de <b>{formatPct(r.avgActualMarginPct)}</b>.{' '}
      {r.advice}
    </div>
  );
}
