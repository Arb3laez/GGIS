import { useMemo, useState } from 'react';
import {
  evaluateLinks,
  lineFactor,
  type ImportedRow,
  type MatchLink,
  type MatchLinkKind,
  type MatchTargetItem,
  type PriceMatchResult,
  type PriceSource,
} from '@ggis/domain';
import { formatPrice } from '../../../shared/inputs';

/** Precio que se aplica a un ítem existente al confirmar. */
export interface PriceUpdate {
  itemId: string;
  unitPrice: number;
  currency: 'COP' | 'USD';
  sources: PriceSource[];
}

interface Props {
  items: Array<MatchTargetItem & { unitPrice: number; currency: 'COP' | 'USD' }>;
  rows: ImportedRow[];
  initial: PriceMatchResult;
  document: string;
  /** TRM de la cotización (COP por USD) para ítems con líneas en monedas distintas. */
  exchangeRate: number;
  onApply: (updates: PriceUpdate[]) => void;
  onCancel: () => void;
}

const KIND_LABEL: Record<MatchLinkKind, string> = {
  direct: 'Directo',
  shared: 'Compartido',
  component: 'Componente',
  reference: 'Precio de otro grupo',
};

/** "× 1/3" cuando la línea es un tubo de 3 m y el ítem va en metros. */
const factorText = (f: number) =>
  f === 1 ? '' : f < 1 ? ` · 1/${Math.round(1 / f)} por unidad del ítem` : ` · ×${f}`;

const fmtQty = (n: number) => n.toLocaleString('es-CO', { maximumFractionDigits: 2 });

/**
 * Revisión de la asociación de precios: cada ítem del Excel con las líneas del proveedor que le
 * dan precio, las alertas, las líneas que no se relacionaron (se pueden asignar a mano) y los
 * ítems que quedan sin precio. Nada se agrega como ítem nuevo.
 */
export function PriceMatchReview({ items, rows, initial, document, exchangeRate, onApply, onCancel }: Props) {
  const [links, setLinks] = useState<MatchLink[]>(() => initial.items.flatMap((i) => i.links));
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const result = useMemo(
    () => evaluateLinks(items, rows, links, initial.method, exchangeRate),
    [items, rows, links, initial.method, exchangeRate],
  );
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const label = (it: MatchTargetItem) =>
    `${it.clientRef ? `#${it.clientRef} ` : ''}${it.description}${it.group ? ` · ${it.group}` : ''}`;

  const priced = result.items.filter((r) => r.status !== 'none');
  const missing = result.items.filter((r) => r.status === 'none');
  const toApply = priced.filter((r) => !r.blocked && !skipped.has(r.itemId));

  const removeLink = (l: MatchLink) =>
    setLinks((ls) => ls.filter((x) => !(x.row === l.row && x.itemId === l.itemId)));
  const assign = (row: number, itemId: string, kind: MatchLinkKind) =>
    setLinks((ls) => {
      const item = byId.get(itemId);
      const factor = item && rows[row] ? lineFactor(item, rows[row]) : 1;
      return [...ls, { row, itemId, kind, factor }];
    });

  function apply() {
    onApply(
      toApply.map((r) => ({
        itemId: r.itemId,
        unitPrice: Math.round(r.unitPrice * 100) / 100,
        currency: r.currency,
        sources: r.links.map((l) => {
          const row = rows[l.row]!;
          return {
            document: (row.source || document).slice(0, 200),
            reference: (row.reference ?? '').slice(0, 120),
            description: row.description.slice(0, 500),
            currency: row.currency,
            unitPrice: row.unitPrice,
            factor: l.factor,
          };
        }),
      })),
    );
  }

  return (
    <div className="preview-box match-review">
      <div className="filters" style={{ justifyContent: 'space-between' }}>
        <div>
          <b style={{ fontSize: 13, color: 'var(--navy)' }}>Asociar precios a los ítems existentes</b>
          <div className="hint">
            {document} · {result.method === 'ai' ? 'relacionado con IA' : 'relacionado por reglas'} ·{' '}
            {result.message}
          </div>
        </div>
        <span style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="small primary" disabled={!toApply.length} onClick={apply}>
            Aplicar precios a {toApply.length} ítems
          </button>
          <button type="button" className="small" onClick={onCancel}>
            Cancelar
          </button>
        </span>
      </div>

      {priced.length ? (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th className="col-xs" />
                <th>Ítem del Excel</th>
                <th>Líneas del proveedor</th>
                <th className="col-md">Costo unit.</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {priced.map((r) => {
                const it = byId.get(r.itemId)!;
                return (
                  <tr key={r.itemId}>
                    <td className="col-center">
                      <input
                        type="checkbox"
                        aria-label={`Aplicar precio a ${it.description}`}
                        checked={!r.blocked && !skipped.has(r.itemId)}
                        disabled={r.blocked}
                        onChange={(e) =>
                          setSkipped((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.delete(r.itemId);
                            else n.add(r.itemId);
                            return n;
                          })
                        }
                      />
                    </td>
                    <td>
                      <div>{label(it)}</div>
                      <div className="hint">Cant. Excel: {fmtQty(it.quantity)}</div>
                    </td>
                    <td>
                      {r.links.map((l) => {
                        const row = rows[l.row]!;
                        return (
                          <div key={`${l.row}-${l.kind}`} className="match-line">
                            <span className="badge match-kind">{KIND_LABEL[l.kind]}</span>{' '}
                            {row.reference ? <b>{row.reference} </b> : null}
                            {row.description}
                            <span className="hint">
                              {' '}
                              · {fmtQty(row.quantity)} × {formatPrice(row.unitPrice, row.currency)}
                              {factorText(l.factor)}
                              {row.group ? ` · ${row.group}` : ''}
                              {row.source ? ` · ${row.source}` : ''}
                            </span>{' '}
                            <button
                              type="button"
                              className="match-remove"
                              aria-label="Quitar esta línea del ítem"
                              title="Quitar esta línea del ítem"
                              onClick={() => removeLink(l)}
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </td>
                    <td className="num-out">
                      {r.blocked ? '—' : formatPrice(r.unitPrice, r.currency)}
                      {!r.blocked && it.unitPrice > 0 && Math.abs(it.unitPrice - r.unitPrice) > 0.5 ? (
                        <div className="hint">antes {formatPrice(it.unitPrice, it.currency)}</div>
                      ) : null}
                    </td>
                    <td>
                      <span className={`badge match-status-${r.status}`}>
                        {r.status === 'ok' ? 'Cuadra' : 'Revisar'}
                      </span>
                      {r.warnings.map((w) => (
                        <div key={w} className="hint match-warning">
                          {w}
                        </div>
                      ))}
                      {r.notes.map((n) => (
                        <div key={n} className="hint">
                          {n}
                        </div>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="hint">Ningún ítem quedó con precio.</div>
      )}

      {result.unmatchedRows.length ? (
        <div className="match-section" role="alert">
          <b>
            Líneas del proveedor sin relacionar ({result.unmatchedRows.length}) — asígnalas a mano o quedan
            por fuera
          </b>
          {result.unmatchedRows.map((u) => {
            const row = rows[u.row]!;
            return (
              <UnmatchedLine
                key={u.row}
                text={`${row.reference ? `${row.reference} · ` : ''}${row.description}`}
                detail={`${fmtQty(row.quantity)} × ${formatPrice(row.unitPrice, row.currency)}${row.group ? ` · ${row.group}` : ''}${row.source ? ` · ${row.source}` : ''}`}
                reason={u.reason}
                options={items.map((i) => ({ id: i.id, label: label(i) }))}
                onAssign={(itemId, kind) => assign(u.row, itemId, kind)}
              />
            );
          })}
        </div>
      ) : null}

      {missing.length ? (
        <div className="match-section" role="alert">
          <b>
            Sin coincidencia en {document} ({missing.length} {missing.length === 1 ? 'ítem' : 'ítems'}) — no
            se crean ítems nuevos; quedan sin precio
          </b>
          <ul className="match-missing">
            {missing.map((m) => {
              const it = byId.get(m.itemId)!;
              return (
                <li key={m.itemId}>
                  {it.clientRef ? <b>Ítem {it.clientRef}</b> : <b>Ítem</b>} · {it.description}
                  {it.group ? ` (${it.group})` : ''}
                  {it.unitPrice > 0 ? (
                    <span className="hint"> · conserva su precio actual</span>
                  ) : (
                    <span className="hint"> · no encontré esta línea en los documentos</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="hint" style={{ marginTop: 8 }}>
          ✓ Todos los ítems de la cotización encontraron su precio en {document}.
        </div>
      )}
    </div>
  );
}

function UnmatchedLine({
  text,
  detail,
  reason,
  options,
  onAssign,
}: {
  text: string;
  detail: string;
  reason: string;
  options: Array<{ id: string; label: string }>;
  onAssign: (itemId: string, kind: MatchLinkKind) => void;
}) {
  const [itemId, setItemId] = useState('');
  const [kind, setKind] = useState<MatchLinkKind>('direct');
  return (
    <div className="match-unmatched">
      <div>
        {text} <span className="hint">· {detail}</span>
        <div className="hint match-warning">{reason}</div>
      </div>
      <div className="filters">
        <select
          className="cell"
          aria-label="Ítem al que se asigna la línea"
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
        >
          <option value="">Asignar a ítem…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          className="cell"
          aria-label="Tipo de relación"
          value={kind}
          onChange={(e) => setKind(e.target.value as MatchLinkKind)}
        >
          <option value="direct">como el equipo</option>
          <option value="component">sumar como componente</option>
          <option value="shared">compartir con otros ítems</option>
        </select>
        <button type="button" className="small" disabled={!itemId} onClick={() => onAssign(itemId, kind)}>
          Asignar
        </button>
      </div>
    </div>
  );
}
