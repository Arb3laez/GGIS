import { useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Copy, Download, FileSpreadsheet, FileText, Plus, Search, Trash2, Upload } from 'lucide-react';
import {
  BUSINESS_UNIT_LABELS,
  BUSINESS_UNITS,
  daysBetween,
  formatCop,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUSES,
  todayIso,
  type BusinessUnit,
  type QuoteStatus,
  type QuoteSummary,
} from '@ggis/domain';
import { downloadFrom } from '../../api/http';
import { backupApi, useQuoteList, useQuoteMutations } from '../../api/queries';
import { useConfirm } from '../../shared/confirm';
import { errorMessage, useToast } from '../../shared/feedback';
import { STATUS_STYLE } from '../../shared/status';

export function QuotesListPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') || undefined) as QuoteStatus | undefined;
  const businessUnit = (params.get('unit') || undefined) as BusinessUnit | undefined;
  const q = params.get('q') ?? '';
  const { data: quotes, isLoading, error } = useQuoteList({ status, businessUnit, q: q || undefined });
  const m = useQuoteMutations();
  const notify = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const importInput = useRef<HTMLInputElement>(null);
  const today = todayIso();

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  async function importBackup(file: File) {
    try {
      const r = await backupApi.import(file);
      m.invalidate();
      notify(
        `Se importaron ${r.imported} cotizaciones${r.attachments ? ` y ${r.attachments} adjuntos` : ''}.`,
      );
      if (r.warnings.length) notify(r.warnings.slice(0, 3).join(' · '), true);
    } catch (err) {
      notify(errorMessage(err), true);
    }
  }

  return (
    <>
      <div className="editor-head">
        <div>
          <div className="kicker">Gestión comercial</div>
          <h1>Cotizaciones</h1>
        </div>
        <div className="toolbar">
          <button
            type="button"
            onClick={() =>
              downloadFrom('/api/backup/export', 'respaldo.json').catch((e) => notify(errorMessage(e), true))
            }
          >
            <Download size={16} /> Exportar respaldo
          </button>
          <button
            type="button"
            onClick={() => importInput.current?.click()}
            title="Acepta respaldos de esta versión y del cotizador anterior (v40–v68)"
          >
            <Upload size={16} /> Importar respaldo
          </button>
          <Link to="/quotes/new" className="btn primary">
            <Plus size={16} /> Nueva cotización
          </Link>
          <input
            ref={importInput}
            type="file"
            accept=".json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importBackup(f);
            }}
          />
        </div>
      </div>

      <div className="filters-bar">
        <div className="chip-tabs" role="group" aria-label="Filtrar por estado">
          <button
            type="button"
            className={!status ? 'active' : ''}
            aria-pressed={!status}
            onClick={() => setParam('status', undefined)}
          >
            Todas
          </button>
          {QUOTE_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={status === s ? 'active' : ''}
              aria-pressed={status === s}
              onClick={() => setParam('status', s)}
            >
              {QUOTE_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="actions">
          <label className="search-input" style={{ margin: 0, minWidth: 240 }}>
            <Search size={15} />
            <input
              value={q}
              placeholder="Cliente, proyecto u OT…"
              aria-label="Buscar"
              onChange={(e) => setParam('q', e.target.value || undefined)}
            />
          </label>
          <select
            className="input"
            style={{ width: 'auto', borderRadius: 999 }}
            value={businessUnit ?? ''}
            aria-label="Filtrar por unidad"
            onChange={(e) => setParam('unit', e.target.value || undefined)}
          >
            <option value="">Todas las unidades</option>
            {BUSINESS_UNITS.map((u) => (
              <option key={u} value={u}>
                {BUSINESS_UNIT_LABELS[u]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="card">
        {isLoading ? <div className="empty">Cargando…</div> : null}
        {error ? <div className="alert danger">{errorMessage(error)}</div> : null}
        {quotes && quotes.length === 0 ? (
          <div className="empty">
            No hay cotizaciones{q || status || businessUnit ? ' con esos filtros' : ''}. Si vienes del
            cotizador anterior, usa "Importar respaldo" con el archivo de "Exportar todas (respaldo)".
          </div>
        ) : null}
        <div className="list">
          {quotes?.map((x) => (
            <QuoteRow
              key={x.id}
              q={x}
              today={today}
              onStatus={(s) =>
                m.setStatus.mutate(
                  { id: x.id, change: { status: s } },
                  { onError: (e) => notify(errorMessage(e), true) },
                )
              }
              onDuplicate={() =>
                m.duplicate.mutate(x.id, {
                  onSuccess: (dup) => {
                    notify(`Duplicada como ${dup.number}`);
                    navigate(`/quotes/${dup.id}`);
                  },
                  onError: (e) => notify(errorMessage(e), true),
                })
              }
              onDelete={async () => {
                const ok = await confirm({
                  title: `¿Eliminar la ${x.number}?`,
                  message:
                    'Dejará de aparecer en el listado y en los indicadores. Queda guardada para auditoría.',
                  details: (
                    <>
                      <div>{x.clientName || '(sin cliente)'}</div>
                      {x.projectName ? <div className="muted">{x.projectName}</div> : null}
                      <div className="muted">
                        {QUOTE_STATUS_LABELS[x.status]} · {formatCop(x.total)}
                      </div>
                    </>
                  ),
                  confirmLabel: 'Eliminar cotización',
                  tone: 'danger',
                });
                if (!ok) return;
                m.remove.mutate(x.id, { onError: (e) => notify(errorMessage(e), true) });
              }}
              onAnalysis={() =>
                downloadFrom(`/api/quotes/${x.id}/cost-analysis.xlsx`, 'analisis.xlsx').catch((e) =>
                  notify(errorMessage(e), true),
                )
              }
            />
          ))}
        </div>
      </section>
    </>
  );
}

function QuoteRow({
  q,
  today,
  onStatus,
  onDuplicate,
  onDelete,
  onAnalysis,
}: {
  q: QuoteSummary;
  today: string;
  onStatus: (s: QuoteStatus) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAnalysis: () => void;
}) {
  const days = daysBetween(q.issueDate, today);
  const s = STATUS_STYLE[q.status];
  const overdue = q.nextFollowUp && q.nextFollowUp <= today;
  return (
    <div className="list-item">
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link to={`/quotes/${q.id}`} style={{ fontWeight: 600, fontSize: 14.5 }}>
            {q.clientName || '(sin cliente)'}
          </Link>
          <select
            aria-label={`Estado de ${q.number}`}
            className="status-select"
            value={q.status}
            style={{ background: s.bg, color: s.fg }}
            onChange={(e) => onStatus(e.target.value as QuoteStatus)}
          >
            {QUOTE_STATUSES.map((v) => (
              <option key={v} value={v}>
                {QUOTE_STATUS_LABELS[v]}
              </option>
            ))}
          </select>
          {q.nextFollowUp ? (
            <span className="hint" style={{ color: overdue ? 'var(--danger)' : undefined }}>
              Seguimiento {q.nextFollowUp}
            </span>
          ) : null}
        </div>
        <div style={{ color: 'var(--text-2)', fontSize: 13, margin: '3px 0' }}>{q.projectName || '—'}</div>
        <div className="meta">
          {q.number} · {q.issueDate} (hace {days} d)
          {q.businessUnit ? ` · ${BUSINESS_UNIT_LABELS[q.businessUnit]}` : ''}
        </div>
      </div>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 15,
          fontWeight: 600,
          minWidth: 130,
          textAlign: 'right',
        }}
      >
        {formatCop(q.total)}
      </div>
      <div className="actions">
        <Link className="btn small" to={`/quotes/${q.id}/offer`} title="Ver oferta para el cliente">
          <FileText size={14} /> Oferta
        </Link>
        <button
          type="button"
          className="icon-btn sm"
          onClick={onAnalysis}
          title="Análisis de costos (Excel)"
          aria-label={`Análisis de costos de ${q.number}`}
        >
          <FileSpreadsheet size={15} />
        </button>
        <button
          type="button"
          className="icon-btn sm"
          onClick={onDuplicate}
          title="Duplicar"
          aria-label={`Duplicar ${q.number}`}
        >
          <Copy size={15} />
        </button>
        <button
          type="button"
          className="icon-btn sm ghost-danger"
          onClick={onDelete}
          title="Eliminar"
          aria-label={`Eliminar ${q.number}`}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
