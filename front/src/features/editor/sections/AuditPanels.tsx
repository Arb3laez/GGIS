import { Fragment } from 'react';
import {
  auditLines,
  formatCop,
  formatPct,
  WORKER_PAY_STATUS_LABELS,
  type LineActual,
  type LineAuditRow,
  type LineAuditSection,
  type WorkerPayStatus,
} from '@ggis/domain';
import { NumberInput } from '../../../shared/inputs';
import { useBreakdown, useDraft, useEdit } from '../store';

const STATUS_COLORS: Record<WorkerPayStatus, { bg: string; fg: string }> = {
  unpaid: { bg: 'var(--status-replaced-bg)', fg: 'var(--status-replaced-ink)' },
  pending: { bg: 'var(--status-sent-bg)', fg: 'var(--status-sent-ink)' },
  paid: { bg: 'var(--status-won-bg)', fg: 'var(--status-won-ink)' },
  overpaid: { bg: 'var(--status-lost-bg)', fg: 'var(--status-lost-ink)' },
};

function StatusBadge({ status }: { status: WorkerPayStatus }) {
  const c = STATUS_COLORS[status];
  return (
    <span className="badge" style={{ background: c.bg, color: c.fg }}>
      {WORKER_PAY_STATUS_LABELS[status]}
    </span>
  );
}

const signed = (n: number) => `${n > 0 ? '+' : ''}${formatCop(n)}`;
const deviationColor = (n: number) => (n > 0.5 ? 'var(--danger)' : n < -0.5 ? 'var(--ok)' : undefined);
const dev = (n: number | null) => (n == null ? '—' : signed(n));
const pct = (n: number | null) => (n == null ? '—' : `${n > 0 ? '+' : ''}${formatPct(n)}`);
const EMPTY: LineActual = { actual: null, advance: 0, settlement: 0, bonus: 0, note: '' };

/** Guarda lo real de una línea; si queda vacía, se borra. */
function useSetLine() {
  const edit = useEdit();
  return (key: string, patch: Partial<LineActual>) =>
    edit((x) => {
      const next = { ...(x.closure.lineActuals[key] ?? EMPTY), ...patch };
      const empty =
        next.actual == null && !next.advance && !next.settlement && !next.bonus && !next.note.trim();
      if (empty) delete x.closure.lineActuals[key];
      else x.closure.lineActuals[key] = next;
    });
}

/**
 * Auditoría del cierre: toda la cotización duplicada, línea por línea, con lo cotizado y lo que en
 * realidad se pagó. En Personal se registra lo que se le dio a cada cargo: costo total, abono,
 * liquidación y bonificaciones.
 */
export function LineAuditPanel() {
  const d = useDraft();
  const breakdown = useBreakdown();
  const setLine = useSetLine();
  const audit = auditLines(d, breakdown);
  const recordedDeviation = audit.actual - audit.quotedRecorded;

  return (
    <>
      <div className="section-title">Auditoría — precio cotizado vs. lo que en realidad se pagó</div>
      <div className="hint" style={{ marginBottom: 8 }}>
        Toda la cotización, línea por línea. Escribe el precio final de cada línea y, en Personal, lo que se le dio a
        cada cargo (abono, liquidación y bonificaciones). Lo que no tenga valor queda como "sin registrar".
      </div>
      {audit.total === 0 ? (
        <div className="hint">La cotización no tiene ítems, personal ni costos para auditar.</div>
      ) : (
        <div className="table-scroll">
          <table style={{ minWidth: 960 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 240 }}>Descripción</th>
                <th className="col-md">Cantidad</th>
                <th className="col-md">Precio cotizado</th>
                <th className="col-md">Precio final</th>
                <th className="col-md">Diferencia</th>
                <th className="col-sm">Desviación</th>
                <th style={{ minWidth: 180 }}>Nota</th>
              </tr>
            </thead>
            <tbody>
              {audit.sections.map((sec) => (
                <Fragment key={sec.section}>
                  <tr>
                    <td colSpan={7} style={{ background: 'var(--panel-2)' }}>
                      <b>{sec.label}</b>
                      <span className="hint">
                        {' '}
                        · {sec.recorded} de {sec.rows.length}{' '}
                        {sec.section === 'staff' ? 'pagados por completo' : 'con precio final'}
                      </span>
                    </td>
                  </tr>
                  {sec.section === 'staff' ? (
                    <tr>
                      <td colSpan={7}>
                        <StaffPayments section={sec} onChange={setLine} />
                      </td>
                    </tr>
                  ) : (
                    sec.rows.map((r) => <LineRow key={r.key} r={r} onChange={setLine} />)
                  )}
                  <tr>
                    <td colSpan={2} className="hint">
                      Subtotal {sec.label.toLowerCase()}
                    </td>
                    <td className="num-out">{formatCop(sec.quoted)}</td>
                    <td className="num-out">{formatCop(sec.section === 'staff' ? sec.spent : sec.actual)}</td>
                    <td className="num-out" style={{ color: deviationColor(sec.actual - sec.quotedRecorded) }}>
                      {sec.recorded ? signed(sec.actual - sec.quotedRecorded) : '—'}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </Fragment>
              ))}
              <tr>
                <td colSpan={2}>
                  <b>Total</b>
                </td>
                <td className="num-out">
                  <b>{formatCop(audit.quoted)}</b>
                </td>
                <td className="num-out">
                  <b>{formatCop(audit.spent)}</b>
                </td>
                <td className="num-out" style={{ color: deviationColor(recordedDeviation) }}>
                  <b>{audit.recorded ? signed(recordedDeviation) : '—'}</b>
                </td>
                <td colSpan={2} className="hint">
                  {audit.recorded} de {audit.total} líneas cerradas
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <div className="hint" style={{ marginTop: 6 }}>
        El total real es todo lo pagado hasta hoy (en Personal, también lo abonado). La diferencia compara solo las
        líneas cerradas: con precio final, o personal pagado por completo. Rojo: se pagó más de lo cotizado; verde:
        menos.
      </div>
    </>
  );
}

function LineRow({ r, onChange }: { r: LineAuditRow; onChange: (key: string, patch: Partial<LineActual>) => void }) {
  return (
    <tr>
      <td>{r.description}</td>
      <td className="hint">{r.quantity}</td>
      <td className="num-out">{formatCop(r.quoted)}</td>
      <td>
        <NumberInput
          value={r.actual}
          allowNull
          placeholder="Sin registrar"
          ariaLabel={`Precio final de ${r.description}`}
          format={formatCop}
          onChange={(n) => onChange(r.key, { actual: n })}
        />
      </td>
      <td className="num-out" style={{ color: r.deviation == null ? undefined : deviationColor(r.deviation) }}>
        {dev(r.deviation)}
      </td>
      <td className="num-out" style={{ color: r.deviation == null ? undefined : deviationColor(r.deviation) }}>
        {pct(r.deviationPct)}
      </td>
      <td>
        <input
          className="cell"
          value={r.note}
          placeholder="Ej: proveedor, factura…"
          aria-label={`Nota de ${r.description}`}
          onChange={(e) => onChange(r.key, { note: e.target.value })}
        />
      </td>
    </tr>
  );
}

/** Personal en la auditoría: por cargo, costo total · abono · liquidación · bonificaciones. */
function StaffPayments({
  section,
  onChange,
}: {
  section: LineAuditSection;
  onChange: (key: string, patch: Partial<LineActual>) => void;
}) {
  const rows = section.rows;
  const total = (k: 'advance' | 'settlement' | 'bonus' | 'paid') =>
    rows.reduce((s, r) => s + (r.payments?.[k] ?? 0), 0);
  const balance = rows.reduce((s, r) => s + Math.max(0, r.payments?.balance ?? 0), 0);
  const pending = rows.filter((r) => r.payments?.status === 'pending').length;
  const unpaid = rows.filter((r) => r.payments?.status === 'unpaid').length;
  const money = (r: LineAuditRow, field: 'advance' | 'settlement' | 'bonus', label: string) => (
    <NumberInput
      value={r.payments?.[field] ?? 0}
      ariaLabel={`${label} de ${r.description}`}
      format={formatCop}
      onChange={(n) => onChange(r.key, { [field]: n ?? 0 })}
    />
  );

  return (
    <div style={{ padding: '2px 0 6px' }}>
      <table>
        <thead>
          <tr>
            <th style={{ minWidth: 170 }}>Cargo</th>
            <th className="col-md">Cantidad</th>
            <th className="col-md">Costo total</th>
            <th className="col-md">Abono</th>
            <th className="col-md">Liquidación</th>
            <th className="col-md">Bonificaciones</th>
            <th className="col-md">Total dado</th>
            <th className="col-md">Saldo por pagar</th>
            <th className="col-sm">Estado</th>
            <th style={{ minWidth: 150 }}>Nota</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const p = r.payments!;
            return (
              <tr key={r.key}>
                <td>{r.description}</td>
                <td className="hint">{r.quantity}</td>
                <td className="num-out">{formatCop(r.quoted)}</td>
                <td>{money(r, 'advance', 'Abono')}</td>
                <td>{money(r, 'settlement', 'Liquidación')}</td>
                <td>{money(r, 'bonus', 'Bonificaciones')}</td>
                <td className="num-out" style={{ fontWeight: 700 }}>
                  {formatCop(p.paid)}
                </td>
                <td className="num-out" style={{ color: p.balance > 0.5 ? 'var(--danger)' : undefined }}>
                  {formatCop(Math.max(0, p.balance))}
                </td>
                <td>
                  <StatusBadge status={p.status} />
                </td>
                <td>
                  <input
                    className="cell"
                    value={r.note}
                    placeholder="Ej: nombre, recibo…"
                    aria-label={`Nota de ${r.description}`}
                    onChange={(e) => onChange(r.key, { note: e.target.value })}
                  />
                </td>
              </tr>
            );
          })}
          <tr>
            <td colSpan={2}>
              <b>Total personal</b>
            </td>
            <td className="num-out">{formatCop(section.quoted)}</td>
            <td className="num-out">{formatCop(total('advance'))}</td>
            <td className="num-out">{formatCop(total('settlement'))}</td>
            <td className="num-out">{formatCop(total('bonus'))}</td>
            <td className="num-out" style={{ fontWeight: 700 }}>
              {formatCop(total('paid'))}
            </td>
            <td className="num-out" style={{ color: balance > 0.5 ? 'var(--danger)' : undefined }}>
              {formatCop(balance)}
            </td>
            <td colSpan={2} />
          </tr>
        </tbody>
      </table>
      {pending + unpaid > 0 ? (
        <div className="alert warning">
          {unpaid > 0 ? `${unpaid} cargo(s) sin ningún pago. ` : ''}
          {pending > 0 ? `${pending} con saldo pendiente. ` : ''}
          Falta por pagar {formatCop(balance)} de lo cotizado.
        </div>
      ) : (
        <div className="alert ok">Todo el personal tiene su pago completo.</div>
      )}
    </div>
  );
}
