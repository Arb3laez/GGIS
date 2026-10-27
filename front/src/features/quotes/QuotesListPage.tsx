import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BUSINESS_UNIT_LABELS,
  BUSINESS_UNITS,
  daysBetween,
  FOLLOW_UP_STAGES,
  formatCop,
  QUOTE_STATUS_LABELS,
  SEND_STATUS_LABELS,
  SEND_STATUSES,
  SERVICE_TYPE_LABELS,
  SERVICE_TYPES,
  TEMPERATURE_LABELS,
  TEMPERATURES,
  todayIso,
  TRANSACTION_TYPE_LABELS,
  type Quote,
  type QuoteSummary,
} from '@ggis/domain';
import { downloadFrom } from '../../api/http';
import { backupApi, quotesApi, useQuoteList, useQuoteMutations } from '../../api/queries';
import { useConfirm } from '../../shared/confirm';
import { errorMessage, useToast } from '../../shared/feedback';
import {
  Button,
  FilterPills,
  GYG_STATUSES,
  MONTH_OPTIONS,
  monthOf,
  PageHeader,
  QuoteCard,
  QuoteList,
  SearchField,
  SelectField,
  StageSummary,
  type QuoteAction,
} from '../../shared/gyg/gyg';
import { fromGygStatus, toGygStatus } from '../../shared/status';
import { applyForm, QuoteFormPanel, type QuoteFormValue } from './QuoteFormPanel';

const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const options = <T extends string>(first: string, keys: readonly T[], labels: Record<T, string>) => [
  { value: '', label: first },
  ...keys.map((k) => ({ value: k, label: labels[k] })),
];

/** Texto que encuentra la búsqueda: cliente, NIT, proyecto, contacto, teléfonos y número. */
const searchable = (q: QuoteSummary) =>
  [q.clientName, q.identification, q.projectName, q.contactName, q.contactPhone, q.contactPhone2, q.number]
    .join(' ')
    .toLowerCase();

/**
 * Pantalla Cotizaciones con el sistema de diseño GYG (QuotesScreen): resumen por etapa, filtros
 * y tarjetas. Los filtros se aplican en el navegador sobre el listado completo y quedan en la URL.
 */
export function QuotesListPage() {
  const [params, setParams] = useSearchParams();
  const { data: quotes, isLoading, error } = useQuoteList({});
  const m = useQuoteMutations();
  const notify = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const importInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<{ quote: Quote; total: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const today = todayIso();

  const f = {
    tab: params.get('status') ?? 'all',
    stage: params.get('stage') ?? 'all',
    q: params.get('q') ?? '',
    unit: params.get('unit') ?? '',
    svc: params.get('service') ?? '',
    year: params.get('year') ?? '',
    month: params.get('month') ?? '',
    temp: params.get('temp') ?? '',
    send: params.get('send') ?? '',
  };
  const setParam = (key: string) => (value: string) => {
    const next = new URLSearchParams(params);
    if (value && value !== 'all') next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const rows = useMemo(() => quotes ?? [], [quotes]);
  const term = f.q.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (f.tab === 'all' || toGygStatus(r.status) === f.tab) &&
      (f.stage === 'all' || r.stage === f.stage) &&
      (!f.unit || r.businessUnit === f.unit) &&
      (!f.svc || r.serviceType === f.svc) &&
      (!f.year || r.issueDate.slice(0, 4) === f.year) &&
      (!f.month || monthOf(r.issueDate) === f.month) &&
      (!f.temp || r.temperature === f.temp) &&
      (!f.send || r.sendStatus === f.send) &&
      (!term || searchable(r).includes(term)),
  );

  const statusOptions = [
    { value: 'all', label: 'Todas', count: rows.length },
    ...GYG_STATUSES.map((s) => ({
      value: s.value,
      label: s.label,
      count: rows.filter((r) => toGygStatus(r.status) === s.value).length,
    })),
  ];
  const stageItems = FOLLOW_UP_STAGES.filter((s) => s.pct != null).map((s) => {
    const inStage = rows.filter((r) => r.stage === s.value);
    return {
      value: s.value,
      label: s.label,
      pct: s.pct,
      count: inStage.length,
      total: inStage.reduce((n, r) => n + r.total, 0),
    };
  });
  const years = [...new Set(rows.map((r) => r.issueDate.slice(0, 4)))].sort().reverse();

  async function importBackup(file: File) {
    try {
      const r = await backupApi.import(file);
      m.invalidate();
      notify(`Se importaron ${r.imported} cotizaciones${r.attachments ? ` y ${r.attachments} adjuntos` : ''}.`);
      if (r.warnings.length) notify(r.warnings.slice(0, 3).join(' · '), true);
    } catch (err) {
      notify(errorMessage(err), true);
    }
  }

  async function onAction(q: QuoteSummary, k: QuoteAction) {
    switch (k) {
      case 'view':
        navigate(`/quotes/${q.id}/offer`);
        return;
      case 'edit':
        try {
          setEditing({ quote: await quotesApi.get(q.id), total: q.total });
        } catch (err) {
          notify(errorMessage(err), true);
        }
        return;
      case 'duplicate':
        m.duplicate.mutate(q.id, {
          onSuccess: (dup) => {
            notify(`Duplicada como ${dup.number}`);
            navigate(`/quotes/${dup.id}`);
          },
          onError: (e) => notify(errorMessage(e), true),
        });
        return;
      case 'copy': {
        const text = [
          `${q.number} · ${q.clientName || '(sin cliente)'}`,
          q.projectName,
          [q.contactName, q.contactPhone].filter(Boolean).join(' · '),
          `${QUOTE_STATUS_LABELS[q.status]} · ${formatCop(q.total)}`,
        ]
          .filter(Boolean)
          .join('\n');
        try {
          await navigator.clipboard.writeText(text);
          notify('Resumen copiado al portapapeles');
        } catch {
          notify('No se pudo copiar al portapapeles', true);
        }
        return;
      }
      case 'delete': {
        const ok = await confirm({
          title: `¿Eliminar la ${q.number}?`,
          message: 'Dejará de aparecer en el listado y en los indicadores. Queda guardada para auditoría.',
          details: (
            <>
              <div>{q.clientName || '(sin cliente)'}</div>
              {q.projectName ? <div className="muted">{q.projectName}</div> : null}
              <div className="muted">
                {QUOTE_STATUS_LABELS[q.status]} · {formatCop(q.total)}
              </div>
            </>
          ),
          confirmLabel: 'Eliminar cotización',
          tone: 'danger',
        });
        if (ok) m.remove.mutate(q.id, { onError: (e) => notify(errorMessage(e), true) });
      }
    }
  }

  async function supersede(q: QuoteSummary) {
    const ok = await confirm({
      title: `¿Sustituir la ${q.number}?`,
      message:
        'Se crea una cotización nueva con número propio para el nuevo requerimiento. La actual queda como Sustituida y vinculada a la nueva.',
      confirmLabel: 'Crear sustitución',
      cancelLabel: 'Cancelar',
    });
    if (!ok) return;
    m.supersede.mutate(q.id, {
      onSuccess: (dup) => {
        notify(`La ${q.number} quedó sustituida por ${dup.number}`);
        navigate(`/quotes/${dup.id}`);
      },
      onError: (e) => notify(errorMessage(e), true),
    });
  }

  async function saveForm(v: QuoteFormValue) {
    if (!editing) return;
    setSaving(true);
    try {
      const { id, number, version, createdAt: _c, updatedAt: _u, ...draft } = editing.quote;
      await quotesApi.update(id, version, applyForm(draft, v));
      m.invalidate();
      notify(`${number} guardada`);
      setEditing(null);
    } catch (err) {
      notify(errorMessage(err), true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="gyg-screen">
      <PageHeader title="Cotizaciones">
        <Button
          variant="secondary"
          icon="download"
          collapse
          onClick={() =>
            downloadFrom('/api/backup/export', 'respaldo.json').catch((e) => notify(errorMessage(e), true))
          }
        >
          Exportar respaldo
        </Button>
        <Button
          variant="secondary"
          icon="upload"
          collapse
          title="Acepta respaldos de esta versión y del cotizador anterior (v40–v68)"
          onClick={() => importInput.current?.click()}
        >
          Importar respaldo
        </Button>
        <Button variant="primary" icon="plus" onClick={() => navigate('/quotes/new')}>
          Nueva cotización
        </Button>
        <input
          ref={importInput}
          type="file"
          accept=".json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void importBackup(file);
          }}
        />
      </PageHeader>

      <StageSummary
        items={stageItems}
        allCount={rows.length}
        allTotal={rows.reduce((n, r) => n + r.total, 0)}
        value={f.stage}
        onChange={setParam('stage')}
      />

      <div className="gyg-filterbar">
        <FilterPills options={statusOptions} value={f.tab} onChange={setParam('status')} />
        <div className="gyg-filterbar__row">
          <SearchField value={f.q} onChange={setParam('q')} placeholder="Cliente, NIT, proyecto, contacto, tel" />
          <SelectField
            label="Unidad de negocio"
            value={f.unit}
            onChange={setParam('unit')}
            options={options('Todas las unidades', BUSINESS_UNITS, BUSINESS_UNIT_LABELS)}
          />
          <SelectField
            label="Servicio"
            value={f.svc}
            onChange={setParam('service')}
            options={options('Todos los servicios', SERVICE_TYPES, SERVICE_TYPE_LABELS)}
          />
        </div>
        <div className="gyg-filterbar__row gyg-filterbar__row--more">
          <SelectField
            label="Año"
            value={f.year}
            onChange={setParam('year')}
            options={[{ value: '', label: 'Todos los años' }, ...years.map((y) => ({ value: y, label: y }))]}
          />
          <SelectField
            label="Mes"
            value={f.month}
            onChange={setParam('month')}
            options={[
              { value: '', label: 'Todos los meses' },
              ...MONTH_OPTIONS.map((mo) => ({ value: mo, label: cap1(mo) })),
            ]}
          />
          <SelectField
            label="Temperatura"
            value={f.temp}
            onChange={setParam('temp')}
            options={options('Toda temperatura', TEMPERATURES, TEMPERATURE_LABELS)}
          />
          <SelectField
            label="Estado de envío"
            value={f.send}
            onChange={setParam('send')}
            options={options('Todo estado de envío', SEND_STATUSES, SEND_STATUS_LABELS)}
          />
        </div>
      </div>

      <QuoteList>
        {isLoading ? <p className="body gyg-muted gyg-empty">Cargando…</p> : null}
        {error ? <div className="alert danger">{errorMessage(error)}</div> : null}
        {quotes && shown.length === 0 ? (
          <p className="body gyg-muted gyg-empty">
            {rows.length === 0
              ? 'Aún no hay cotizaciones. Si vienes del cotizador anterior, usa "Importar respaldo".'
              : 'Ninguna cotización coincide con los filtros.'}
          </p>
        ) : null}
        {shown.map((q) => {
          const overdue = !!q.nextFollowUp && q.nextFollowUp <= today && (q.status === 'sent' || q.status === 'negotiating');
          return (
            <QuoteCard
              key={q.id}
              href={`/quotes/${q.id}`}
              client={q.clientName}
              identification={q.identification}
              project={q.projectName}
              type={TRANSACTION_TYPE_LABELS[q.transactionType]}
              code={q.number}
              date={q.issueDate}
              age={`hace ${daysBetween(q.issueDate, today)} d`}
              unit={q.businessUnit ? BUSINESS_UNIT_LABELS[q.businessUnit] : null}
              service={q.serviceType ? SERVICE_TYPE_LABELS[q.serviceType] : null}
              contactName={q.contactName}
              phone={q.contactPhone}
              phone2={q.contactPhone2}
              status={toGygStatus(q.status)}
              stage={q.stage}
              temperature={q.temperature}
              sendStatus={q.sendStatus}
              closeDate={q.closeDate}
              due={
                q.nextFollowUp
                  ? { label: overdue ? `Vencido · ${q.nextFollowUp}` : `Seguimiento ${q.nextFollowUp}`, overdue }
                  : null
              }
              note={q.note}
              total={q.total}
              onStatusChange={(s) =>
                m.setStatus.mutate(
                  { id: q.id, change: { status: fromGygStatus(s) } },
                  { onError: (e) => notify(errorMessage(e), true) },
                )
              }
              onAction={(k) => void onAction(q, k)}
              extraActions={
                <>
                  <Button
                    variant="secondary"
                    disabled={!!q.supersededByNumber}
                    title={q.supersededByNumber ? `Ya fue sustituida por ${q.supersededByNumber}` : undefined}
                    onClick={() => void supersede(q)}
                  >
                    {q.supersededByNumber ? `Sustituida por ${q.supersededByNumber}` : 'Sustituir'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      downloadFrom(`/api/quotes/${q.id}/cost-analysis.xlsx`, 'analisis.xlsx').catch((e) =>
                        notify(errorMessage(e), true),
                      )
                    }
                  >
                    Análisis de costos (Excel)
                  </Button>
                  <Button variant="secondary" onClick={() => navigate(`/quotes/${q.id}`)}>
                    Abrir editor completo
                  </Button>
                </>
              }
            />
          );
        })}
      </QuoteList>

      {editing ? (
        <QuoteFormPanel
          quote={editing.quote}
          total={editing.total}
          saving={saving} onSave={(v) => void saveForm(v)} onCancel={() => setEditing(null)} />
      ) : null}
    </div>
  );
}
