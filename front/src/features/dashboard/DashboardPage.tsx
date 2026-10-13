import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarClock,
  ChartColumn,
  CircleCheckBig,
  Download,
  Grid3x3,
  Handshake,
  MessagesSquare,
  Plus,
  Search,
  ShieldAlert,
  Target,
} from 'lucide-react';
import {
  BUSINESS_UNIT_LABELS,
  BUSINESS_UNITS,
  buildDashboard,
  daysBetween,
  formatCop,
  formatCopCompact,
  formatPct,
  LOSS_REASON_LABELS,
  LOSS_REASONS,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUSES,
  todayIso,
  type BusinessUnit,
  type LossReason,
  type QuoteSummary,
} from '@ggis/domain';
import { downloadFrom } from '../../api/http';
import { useCompanyProfile, useQuoteList } from '../../api/queries';
import { errorMessage, useToast } from '../../shared/feedback';
import { PartChart } from '../quotes/PartChart';
import { MonthlyChart } from './MonthlyChart';
import { UnitHeatmap } from './UnitHeatmap';

const SERIES = Array.from({ length: 7 }, (_, i) => `var(--series-${i + 1})`);

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días,' : h < 19 ? 'Buenas tardes,' : 'Buenas noches,';
}

function pctChange(curr: number, prev: number): string | null {
  if (prev <= 0) return null;
  const c = ((curr - prev) / prev) * 100;
  return `${c >= 0 ? '+' : ''}${c.toFixed(1)}%`;
}

export function DashboardPage() {
  const { data: all, isLoading } = useQuoteList({});
  const { data: company } = useCompanyProfile();
  const notify = useToast();
  const [unit, setUnit] = useState<BusinessUnit | 'all'>('all');
  const [measure, setMeasure] = useState<'quoted' | 'won'>('quoted');
  const today = todayIso();

  const list = useMemo(
    () => (all ?? []).filter((q) => unit === 'all' || q.businessUnit === unit),
    [all, unit],
  );
  const d = useMemo(() => buildDashboard(list, today), [list, today]);

  const firstName = company?.signatoryName?.trim().split(/\s+/).slice(0, 2).join(' ');
  const cur = d.monthly[d.monthly.length - 1];
  const prev = d.monthly[d.monthly.length - 2];
  const pipeline = d.byStatus.sent.value + d.byStatus.negotiating.value;
  const pipelineCount = d.byStatus.sent.count + d.byStatus.negotiating.count;

  return (
    <>
      <div className="hero">
        <div className="hero-welcome">
          <div className="kicker">{greeting()}</div>
          <h1>{firstName || 'Equipo comercial'}</h1>
          <span className="badge-brand">{company?.tradeName ?? 'G&G Innova Solutions'}</span>
        </div>
        <div className="kpi-row">
          <KpiCard
            icon={<ChartColumn size={17} />}
            label="Cotizado este mes"
            value={formatCopCompact(cur?.quoted)}
            delta={pctChange(cur?.quoted ?? 0, prev?.quoted ?? 0)}
            deltaText="vs. mes anterior"
            to="/quotes"
          />
          <KpiCard
            icon={<CircleCheckBig size={17} />}
            label="Adjudicado"
            value={formatCopCompact(d.byStatus.won.value)}
            delta={d.closeRatePct === null ? null : formatPct(d.closeRatePct, 0)}
            deltaText="tasa de cierre"
            to="/quotes?status=won"
          />
          <KpiCard
            accent
            icon={<Handshake size={17} />}
            label="En curso"
            value={formatCopCompact(pipeline)}
            delta={String(pipelineCount)}
            deltaText="ofertas enviadas o en negociación"
            to="/quotes?status=negotiating"
          />
        </div>
      </div>

      <div className="filters-bar">
        <div className="chip-tabs" role="group" aria-label="Filtrar por unidad de negocio">
          <button
            type="button"
            className={unit === 'all' ? 'active' : ''}
            aria-pressed={unit === 'all'}
            onClick={() => setUnit('all')}
          >
            Todas
          </button>
          {BUSINESS_UNITS.map((u) => (
            <button
              key={u}
              type="button"
              className={unit === u ? 'active' : ''}
              aria-pressed={unit === u}
              onClick={() => setUnit(u)}
            >
              {BUSINESS_UNIT_LABELS[u]}
            </button>
          ))}
        </div>
        <div className="actions">
          <button
            type="button"
            onClick={() =>
              downloadFrom('/api/backup/export', 'respaldo.json').catch((e) => notify(errorMessage(e), true))
            }
          >
            <Download size={16} /> Descargar respaldo
          </button>
          <Link className="btn primary" to="/quotes/new">
            <Plus size={16} /> Nueva cotización
          </Link>
        </div>
      </div>

      {isLoading ? <div className="empty">Cargando indicadores…</div> : null}

      <div className="dash-grid">
        <section className="card" aria-labelledby="chart-title">
          <div className="card-head">
            <h2 className="card-title" id="chart-title">
              <span className="title-icon">
                <ChartColumn size={16} />
              </span>
              {measure === 'quoted' ? 'Valor cotizado' : 'Valor adjudicado'}
            </h2>
            <div className="segmented" role="group" aria-label="Medida">
              <button
                type="button"
                className={measure === 'quoted' ? 'active' : ''}
                onClick={() => setMeasure('quoted')}
              >
                Cotizado
              </button>
              <button
                type="button"
                className={measure === 'won' ? 'active' : ''}
                onClick={() => setMeasure('won')}
              >
                Adjudicado
              </button>
            </div>
          </div>
          <MonthlyChart months={d.monthly} measure={measure} />
        </section>

        <section className="card" aria-labelledby="heat-title">
          <div className="card-head">
            <h2 className="card-title" id="heat-title">
              <span className="title-icon">
                <Grid3x3 size={16} />
              </span>
              Actividad por unidad
            </h2>
          </div>
          <UnitHeatmap months={d.monthly} cells={d.unitMonth} />
        </section>

        <FollowUpsPanel list={list} followUpIds={new Set(d.followUps.map((f) => f.id))} today={today} />
      </div>

      <div className="dash-grid-2" style={{ marginBottom: 14 }}>
        <section className="card" aria-labelledby="results-title">
          <h2 className="card-title" id="results-title">
            <span className="title-icon">
              <Target size={16} />
            </span>
            Resultado de las ofertas
          </h2>
          <PartChart
            title="Por estado"
            parts={QUOTE_STATUSES.map((s, i) => ({
              key: s,
              label: QUOTE_STATUS_LABELS[s],
              value: d.byStatus[s].count,
              color: SERIES[i]!,
            }))}
            emptyText="Sin ofertas."
          />
          <PartChart
            title="Perdidas por motivo"
            parts={LOSS_REASONS.map((r, i) => ({
              key: r,
              label: LOSS_REASON_LABELS[r as LossReason],
              value: d.lossReasons.find((l) => l.reason === r)?.count ?? 0,
              color: SERIES[i]!,
            }))}
            emptyText="Aún no hay ofertas perdidas con motivo registrado."
          />
        </section>

        <section className="card" aria-labelledby="audit-title">
          <h2 className="card-title" id="audit-title">
            <span className="title-icon">
              <ShieldAlert size={16} />
            </span>
            Auditoría de proyectos en ejecución
          </h2>
          <div className="sub">
            {d.inExecution} adjudicado{d.inExecution === 1 ? '' : 's'} sin cerrar. Se listan los que ya
            consumieron más del 60% del presupuesto.
          </div>
          {d.atRisk.length === 0 ? (
            <div className="hint">Ningún proyecto en ejecución ha superado el 60% de su presupuesto.</div>
          ) : (
            d.atRisk.map((p) => {
              const color =
                p.marginTodayPct < 5 ? 'var(--danger)' : p.marginTodayPct < 15 ? 'var(--warn)' : 'var(--ok)';
              return (
                <Link
                  key={p.id}
                  to={`/quotes/${p.id}#cierre`}
                  style={{ display: 'block', textDecoration: 'none', color: 'inherit', marginBottom: 12 }}
                >
                  <div
                    className="filters"
                    style={{ justifyContent: 'space-between', marginBottom: 5, fontSize: 12.5 }}
                  >
                    <span>
                      <b>{p.label}</b> <span className="hint">· {p.number}</span>
                    </span>
                    <b style={{ color }}>{formatPct(p.marginTodayPct)} de margen</b>
                  </div>
                  <div className="meter">
                    <div
                      style={{ width: `${Math.max(0, Math.min(p.consumedPct, 100))}%`, background: color }}
                    />
                  </div>
                  <div className="hint" style={{ marginTop: 4 }}>
                    {formatPct(p.consumedPct, 0)} del presupuesto consumido · venta {formatCop(p.sale)}
                  </div>
                </Link>
              );
            })
          )}
          <div className="section-title">Precisión del presupuesto</div>
          {d.precision ? (
            <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <MiniStat
                label="Desviación de costo"
                value={`${d.precision.avgCostDeviationPct > 0 ? '+' : ''}${formatPct(d.precision.avgCostDeviationPct)}`}
              />
              <MiniStat label="Margen presupuestado" value={formatPct(d.precision.avgBudgetMarginPct)} />
              <MiniStat label="Margen real" value={formatPct(d.precision.avgActualMarginPct)} />
            </div>
          ) : (
            <div className="hint">
              Cuando cierres proyectos con su costo real, aquí verás qué tan bien se está presupuestando.
            </div>
          )}
        </section>
      </div>

      <section className="card" aria-labelledby="units-title">
        <h2 className="card-title" id="units-title">
          <span className="title-icon">
            <BriefcaseBusiness size={16} />
          </span>
          Indicadores por unidad de negocio
        </h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Unidad</th>
                <th className="n">Total cotizado</th>
                <th className="n">Adjudicado</th>
                <th className="col-center">Cierres</th>
                <th className="col-center">% Éxito</th>
              </tr>
            </thead>
            <tbody>
              {d.byUnit.map((u) => (
                <tr key={u.unit ?? 'none'}>
                  <td>{u.unit ? BUSINESS_UNIT_LABELS[u.unit] : 'Sin clasificar'}</td>
                  <td className="n">{formatCop(u.quoted)}</td>
                  <td className="n">{formatCop(u.won)}</td>
                  <td className="col-center">
                    {u.wonCount}/{u.quotedCount}
                  </td>
                  <td className="col-center">{formatPct(u.successPct, 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>TOTAL</td>
                <td className="n">{formatCop(d.totals.quoted)}</td>
                <td className="n">{formatCop(d.totals.won)}</td>
                <td className="col-center">
                  {d.totals.wonCount}/{d.totals.quotedCount}
                </td>
                <td className="col-center">{formatPct(d.totals.successPct, 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </>
  );
}

function KpiCard({
  icon,
  label,
  value,
  delta,
  deltaText,
  to,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta: string | null;
  deltaText: string;
  to: string;
  accent?: boolean;
}) {
  return (
    <Link to={to} className={`kpi-card${accent ? ' accent' : ''}`}>
      <div className="top">
        <span className="label">
          <span className="title-icon">{icon}</span>
          {label}
        </span>
        <span className={`btn icon-btn sm ${accent ? 'dark' : 'light'}`} aria-hidden="true">
          <ArrowUpRight size={15} />
        </span>
      </div>
      <div>
        <div className="value">{value}</div>
        <div className="delta">
          {delta ? <b>{delta}</b> : '—'} {deltaText}
        </div>
      </div>
    </Link>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--panel-2)', borderRadius: 14, padding: '10px 12px' }}>
      <div className="hint">{label}</div>
      <div style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function initials(s: string) {
  const p = s.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '?') + (p[1]?.[0] ?? '')).toUpperCase();
}

/** Seguimientos pendientes con formato de bandeja de mensajes; si no hay, muestra lo más reciente. */
function FollowUpsPanel({
  list,
  followUpIds,
  today,
}: {
  list: QuoteSummary[];
  followUpIds: Set<string>;
  today: string;
}) {
  const [q, setQ] = useState('');
  const pending = list.filter((x) => followUpIds.has(x.id));
  const showing = pending.length
    ? pending
    : [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);
  const filtered = showing.filter((x) =>
    `${x.clientName} ${x.projectName} ${x.number}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <section className="card" id="seguimientos" aria-labelledby="fu-title">
      <div className="card-head">
        <h2 className="card-title" id="fu-title">
          <span className="title-icon">
            {pending.length ? <CalendarClock size={16} /> : <MessagesSquare size={16} />}
          </span>
          {pending.length ? `Seguimientos (${pending.length})` : 'Actividad reciente'}
        </h2>
        <Link to="/quotes/new" className="btn icon-btn light sm" aria-label="Nueva cotización">
          <Plus size={16} />
        </Link>
      </div>
      <label className="search-input">
        <Search size={15} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente o proyecto"
          aria-label="Buscar en seguimientos"
        />
      </label>
      <div className="msg-list">
        {filtered.length === 0 ? <div className="empty">Nada por aquí.</div> : null}
        {filtered.map((x) => {
          const overdue = followUpIds.has(x.id);
          const days = daysBetween(x.issueDate, today);
          return (
            <Link key={x.id} to={`/quotes/${x.id}`} className="msg">
              <span
                className="ava"
                style={{
                  background: overdue ? 'var(--accent)' : 'var(--data)',
                  color: 'var(--accent-ink)',
                }}
              >
                {initials(x.clientName || x.number)}
              </span>
              <span className="body">
                <span className="name" style={{ display: 'block' }}>
                  {x.clientName || '(sin cliente)'}
                </span>
                <span className="line" style={{ display: 'block' }}>
                  {x.number} · {x.projectName || QUOTE_STATUS_LABELS[x.status]} · {formatCopCompact(x.total)}
                </span>
              </span>
              <span className="time">
                {x.nextFollowUp ? x.nextFollowUp.slice(5).split('-').reverse().join('/') : `${days} d`}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
