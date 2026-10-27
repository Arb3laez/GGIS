import { useEffect, useState } from 'react';
import {
  BUSINESS_UNIT_LABELS,
  BUSINESS_UNITS,
  findStage,
  formatCop,
  SEND_STATUS_LABELS,
  SEND_STATUSES,
  SERVICE_TYPE_LABELS,
  SERVICE_TYPES,
  TEMPERATURE_LABELS,
  TEMPERATURES,
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPES,
  type BusinessUnit,
  type Quote,
  type QuoteDraft,
  type SendStatus,
  type ServiceType,
  type Temperature,
  type TransactionType,
} from '@ggis/domain';
import {
  Button,
  GYG_STATUSES,
  IconButton,
  SelectField,
  STAGE_OPTIONS,
  TextField,
  type GygStatus,
} from '../../shared/gyg/gyg';
import { fromGygStatus, toGygStatus } from '../../shared/status';

/** Campos del formulario Editar cotización (columnas del Excel CRM Ventas). */
export interface QuoteFormValue {
  client: string;
  identification: string;
  project: string;
  contactName: string;
  phone: string;
  phone2: string;
  type: TransactionType;
  date: string;
  unit: BusinessUnit | '';
  service: ServiceType | '';
  status: GygStatus;
  stage: string;
  temperature: Temperature | '';
  sendStatus: SendStatus | '';
  closeDate: string;
  nextFollowUp: string;
  note: string;
}

export function quoteToForm(q: Quote): QuoteFormValue {
  return {
    client: q.client.name,
    identification: q.client.identification,
    project: q.client.project,
    contactName: q.client.contact,
    phone: q.client.phone,
    phone2: q.client.phone2,
    type: q.transactionType,
    date: q.issueDate,
    unit: q.businessUnit ?? '',
    service: q.serviceType ?? '',
    status: toGygStatus(q.status),
    stage: q.stage ?? '',
    temperature: q.followUp.temperature ?? '',
    sendStatus: q.followUp.sendStatus ?? '',
    closeDate: q.followUp.closeDate ?? '',
    nextFollowUp: q.nextFollowUp ?? '',
    note: q.followUp.note,
  };
}

/** Aplica el formulario sobre el borrador completo (los ítems y precios no se tocan). */
export function applyForm(draft: QuoteDraft, f: QuoteFormValue): QuoteDraft {
  const status = fromGygStatus(f.status);
  return {
    ...draft,
    client: {
      ...draft.client,
      name: f.client,
      identification: f.identification.trim(),
      project: f.project,
      contact: f.contactName,
      phone: f.phone.trim(),
      phone2: f.phone2.trim(),
    },
    transactionType: f.type,
    issueDate: f.date || draft.issueDate,
    businessUnit: f.unit || null,
    serviceType: f.service || null,
    status,
    lossReason: status === 'lost' ? draft.lossReason : null,
    stage: f.stage || null,
    nextFollowUp: f.nextFollowUp || null,
    followUp: {
      temperature: f.temperature || null,
      sendStatus: f.sendStatus || null,
      closeDate: f.closeDate || null,
      note: f.note,
    },
  };
}

const opt = <T extends string>(labels: Record<T, string>, keys: readonly T[], first: string) => [
  { value: '', label: first },
  ...keys.map((k) => ({ value: k, label: labels[k] })),
];

/**
 * QuoteForm del sistema de diseño en panel lateral: Cliente, Cotización y Seguimiento.
 * Número y total se muestran de solo lectura (el total sale de los ítems de la cotización).
 */
export function QuoteFormPanel({
  quote,
  total,
  saving,
  onSave,
  onCancel,
}: {
  quote: Quote;
  /** Total de la oferta (del listado; sale de los ítems). */
  total: number;
  saving?: boolean;
  onSave: (v: QuoteFormValue) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<QuoteFormValue>(() => quoteToForm(quote));
  const set =
    <K extends keyof QuoteFormValue>(k: K) =>
    (x: string) =>
      setV((prev) => ({ ...prev, [k]: x }) as QuoteFormValue);
  const stage = findStage(v.stage);
  const legacyStage = v.stage && !stage ? [{ value: v.stage, label: `${v.stage} (anterior)` }] : [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onCancel]);

  return (
    <div className="gyg-overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <section className="gyg-form" role="dialog" aria-modal="true" aria-label="Editar cotización">
        <header className="gyg-form__head">
          <h2 className="card-title">Editar cotización · {quote.number}</h2>
          <IconButton icon="close" label="Cerrar" onClick={onCancel} />
        </header>
        <div className="gyg-form__body">
          <fieldset className="gyg-form__sec">
            <legend className="col-label">Cliente</legend>
            <div className="gyg-form__grid">
              <TextField caption="Nombre del cliente" value={v.client} onChange={set('client')} className="is-wide" />
              <TextField
                caption="Identificación (NIT / CC)"
                value={v.identification}
                onChange={set('identification')}
                inputMode="numeric"
                maxLength={30}
              />
              <TextField caption="Sucursal / proyecto" value={v.project} onChange={set('project')} className="is-wide" />
              <TextField caption="Contacto" value={v.contactName} onChange={set('contactName')} />
              <TextField caption="Número de contacto" type="tel" value={v.phone} onChange={set('phone')} maxLength={40} />
              <TextField
                caption="Número de contacto 2"
                type="tel"
                value={v.phone2}
                onChange={set('phone2')}
                maxLength={40}
              />
            </div>
          </fieldset>

          <fieldset className="gyg-form__sec">
            <legend className="col-label">Cotización</legend>
            <div className="gyg-form__grid">
              <SelectField
                caption="Tipo de transacción"
                value={v.type}
                onChange={set('type')}
                options={TRANSACTION_TYPES.map((t) => ({ value: t, label: TRANSACTION_TYPE_LABELS[t] }))}
              />
              <TextField caption="Número de cotización" value={quote.number} disabled />
              <TextField caption="Fecha de elaboración" type="date" value={v.date} onChange={set('date')} />
              <SelectField
                caption="Unidad de negocio"
                value={v.unit}
                onChange={set('unit')}
                options={opt(BUSINESS_UNIT_LABELS, BUSINESS_UNITS, 'Seleccione')}
              />
              <SelectField
                caption="Servicio"
                value={v.service}
                onChange={set('service')}
                options={opt(SERVICE_TYPE_LABELS, SERVICE_TYPES, 'Seleccione')}
              />
              <div className="gyg-fw">
                <span className="meta gyg-fw__cap">Total (COP) · sale de los ítems</span>
                <div className="gyg-form__prob body-strong">{formatCop(total)}</div>
              </div>
            </div>
          </fieldset>

          <fieldset className="gyg-form__sec">
            <legend className="col-label">Seguimiento</legend>
            <div className="gyg-form__grid">
              <SelectField
                caption="Estado"
                value={v.status}
                onChange={set('status')}
                options={GYG_STATUSES}
              />
              <SelectField
                caption="Nivel de oferta (etapa)"
                value={v.stage}
                onChange={set('stage')}
                options={[...STAGE_OPTIONS, ...legacyStage]}
              />
              <SelectField
                caption="Temperatura"
                value={v.temperature}
                onChange={set('temperature')}
                options={opt(TEMPERATURE_LABELS, TEMPERATURES, 'Sin temperatura')}
              />
              <SelectField
                caption="Estado de envío"
                value={v.sendStatus}
                onChange={set('sendStatus')}
                options={opt(SEND_STATUS_LABELS, SEND_STATUSES, 'Seleccione')}
              />
              <TextField caption="Cierre estimado" type="date" value={v.closeDate} onChange={set('closeDate')} />
              <div className="gyg-fw">
                <span className="meta gyg-fw__cap">Probabilidad de cierre</span>
                <div className="gyg-form__prob body-strong">
                  {stage?.pct != null ? `${stage.pct}%` : 'Sin definir'}
                </div>
              </div>
              <TextField
                caption="Próximo seguimiento"
                type="date"
                value={v.nextFollowUp}
                onChange={set('nextFollowUp')}
              />
              <TextField caption="Observación" multiline value={v.note} onChange={set('note')} className="is-wide" maxLength={2000} />
            </div>
          </fieldset>
        </div>
        <footer className="gyg-form__foot">
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={saving} onClick={() => onSave(v)}>
            {saving ? 'Guardando…' : 'Guardar cotización'}
          </Button>
        </footer>
      </section>
    </div>
  );
}
