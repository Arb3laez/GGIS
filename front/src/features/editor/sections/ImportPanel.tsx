import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { blankItem, type ImportedRow, type PriceMatchResult } from '@ggis/domain';
import { importsApi, keys, useImportCapabilities } from '../../../api/queries';
import { errorMessage, useToast } from '../../../shared/feedback';
import { formatPrice, NumberInput } from '../../../shared/inputs';
import { useDraft, useEdit, useEditor } from '../store';
import { PriceMatchReview, type PriceUpdate } from './PriceMatchReview';

type PreviewRow = ImportedRow & { selected: boolean };

/**
 * Importar ítems desde Excel/CSV, PDF/imagen (con IA en el servidor) o filas pegadas.
 * Siempre muestra una previsualización editable antes de agregarlos. Si la cotización ya tiene
 * ítems (p. ej. la lista del cliente), los precios del proveedor se pueden ASOCIAR a esos ítems
 * en vez de agregarlos como nuevos, para no duplicar.
 */
export function ImportPanel() {
  const edit = useEdit();
  const quoteId = useEditor((s) => s.quoteId);
  const notify = useToast();
  const qc = useQueryClient();
  const caps = useImportCapabilities();
  const sheetInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);
  const allInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [docName, setDocName] = useState('');
  const [match, setMatch] = useState<{ result: PriceMatchResult; rows: ImportedRow[] } | null>(null);
  /** Aviso persistente: ítems sin coincidencia en los PDF después de aplicar precios. */
  const [unpriced, setUnpriced] = useState<{ docs: string; items: string[] } | null>(null);
  const draft = useDraft();
  const existing = draft.items.filter((i) => i.description.trim());
  const canMatch = existing.length > 0 && preview.some((r) => r.selected && r.unitPrice > 0);

  async function run(task: () => Promise<{ rows: ImportedRow[]; message: string }>, name = '') {
    setBusy(true);
    setMatch(null);
    setDocName(name);
    setStatus('Leyendo…');
    try {
      const res = await task();
      setPreview(res.rows.map((r) => ({ ...r, selected: true })));
      setStatus(res.message);
    } catch (err) {
      setStatus('');
      notify(errorMessage(err), true);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Carga varios archivos a la vez: la lista del cliente (Excel sin precios) crea los ítems si la
   * cotización está vacía, y las cotizaciones de proveedor (PDF, Excel con precios, imágenes) se
   * relacionan todas juntas con esos ítems para revisar y aplicar los precios de una vez.
   */
  async function loadAll(files: File[]) {
    setBusy(true);
    setMatch(null);
    setPreview([]);
    setUnpriced(null);
    const summary: string[] = [];
    try {
      const clientLists: Array<{ name: string; rows: ImportedRow[] }> = [];
      const supplierRows: ImportedRow[] = [];
      const supplierNames: string[] = [];
      for (const [i, f] of files.entries()) {
        setStatus(`Leyendo ${i + 1} de ${files.length}: ${f.name}…`);
        const isSheet = /\.(xlsx|xls|csv)$/i.test(f.name);
        try {
          const res = isSheet ? await importsApi.spreadsheet(f) : await importsApi.document(f, quoteId);
          if (!isSheet && res.attachment && quoteId)
            void qc.invalidateQueries({ queryKey: keys.attachments(quoteId) });
          const priced = res.rows.filter((r) => r.unitPrice > 0).length;
          if (!res.rows.length) {
            summary.push(`${f.name}: sin ítems`);
          } else if (isSheet && priced < res.rows.length * 0.4) {
            clientLists.push({ name: f.name, rows: res.rows });
            summary.push(`${f.name}: lista del cliente (${res.rows.length} ítems)`);
          } else {
            supplierRows.push(
              ...res.rows.filter((r) => r.unitPrice > 0).map((r) => ({ ...r, source: f.name })),
            );
            supplierNames.push(f.name);
            const ok = /cuadra con el subtotal/.test(res.message) ? ' ✓ cuadra con el subtotal' : '';
            summary.push(`${f.name}: ${priced} líneas con precio${ok}`);
          }
        } catch (err) {
          summary.push(`${f.name}: ${errorMessage(err)}`);
        }
      }

      // Ítems a los que se les pone precio: los de la cotización o los de la lista del cliente.
      let targets = existing.map((i) => ({
        id: i.id,
        description: i.description,
        unit: i.unit,
        quantity: i.quantity,
        group: i.group ?? null,
        clientRef: i.clientRef ?? null,
      }));
      const list = clientLists[0];
      if (list && targets.length) {
        summary.push(
          `La cotización ya tiene ${targets.length} ítems: no se volvió a cargar ${list.name} (para no duplicar)`,
        );
      } else if (list) {
        summary.push(`Se crearon ${list.rows.length} ítems desde ${list.name}`);
        const created = list.rows.map((r) => ({
          ...blankItem(r.description, r.unit || 'UN'),
          quantity: r.quantity,
          currency: r.currency,
          unitPrice: r.unitPrice,
          ...(r.clientRef ? { clientRef: r.clientRef } : {}),
          ...(r.group ? { group: r.group } : {}),
        }));
        edit((x) => {
          const onlyBlank = x.items.length === 1 && !x.items[0]!.description.trim();
          x.items = onlyBlank ? created : [...x.items, ...created];
        });
        targets = created.map((i) => ({
          id: i.id,
          description: i.description,
          unit: i.unit,
          quantity: i.quantity,
          group: i.group ?? null,
          clientRef: i.clientRef ?? null,
        }));
      }

      if (supplierRows.length && targets.length) {
        setStatus('Relacionando las cotizaciones con los ítems…');
        const result = await importsApi.match(targets, supplierRows);
        setDocName(supplierNames.join(' + '));
        setMatch({ result, rows: supplierRows });
      } else if (supplierRows.length) {
        // Cotización vacía: no hay a qué ponerle precio. Se muestran las líneas, pero solo se
        // agregan como ítems si el usuario lo confirma.
        setDocName(supplierNames.join(' + '));
        setPreview(supplierRows.map((r) => ({ ...r, selected: true })));
        summary.push(
          'La cotización no tiene ítems: carga primero la lista del cliente (Excel) para ponerle precios a esos ítems',
        );
      }
      setStatus(summary.join(' · '));
    } catch (err) {
      setStatus(summary.join(' · '));
      notify(errorMessage(err), true);
    } finally {
      setBusy(false);
    }
  }

  function confirmImport() {
    const rows = preview.filter((r) => r.selected && r.description.trim());
    edit((x) => {
      const items = rows.map((r) => ({
        ...blankItem(r.description, r.unit || 'UN'),
        quantity: r.quantity,
        currency: r.currency,
        unitPrice: r.unitPrice,
        ...(r.clientRef ? { clientRef: r.clientRef } : {}),
        ...(r.group ? { group: r.group } : {}),
      }));
      const onlyBlank = x.items.length === 1 && !x.items[0]!.description.trim();
      x.items = onlyBlank ? items : [...x.items, ...items];
    });
    setPreview([]);
    setStatus(`Se importaron ${rows.length} ítems.`);
  }

  /** Relaciona las filas leídas con los ítems que ya tiene la cotización (sin crear ítems). */
  async function associate() {
    const rows = preview.filter((r) => r.selected && r.description.trim()).map(({ selected: _s, ...r }) => r);
    setBusy(true);
    setStatus('Relacionando con los ítems de la cotización…');
    try {
      const targets = existing.map((i) => ({
        id: i.id,
        description: i.description,
        unit: i.unit,
        quantity: i.quantity,
        group: i.group ?? null,
        clientRef: i.clientRef ?? null,
      }));
      const result = await importsApi.match(targets, rows);
      setMatch({ result, rows });
      setPreview([]);
      setStatus('');
    } catch (err) {
      setStatus('');
      notify(errorMessage(err), true);
    } finally {
      setBusy(false);
    }
  }

  function applyPrices(updates: PriceUpdate[]) {
    edit((x) => {
      for (const u of updates) {
        const it = x.items.find((i) => i.id === u.itemId);
        if (!it) continue;
        it.unitPrice = u.unitPrice;
        it.currency = u.currency;
        it.priceSources = u.sources;
      }
    });
    setMatch(null);
    // Ítems que siguen sin precio después de todos los documentos cargados hasta ahora.
    const updated = new Set(updates.map((u) => u.itemId));
    const left = existing
      .filter((i) => !updated.has(i.id) && !(i.unitPrice > 0))
      .map(
        (i) =>
          `${i.clientRef ? `Ítem ${i.clientRef}` : 'Ítem'} · ${i.description}${i.group ? ` (${i.group})` : ''}`,
      );
    setUnpriced({ docs: docName, items: left });
    const msg = `Se actualizó el precio de ${updates.length} ítems${docName ? ` con ${docName}` : ''}. No se agregaron ítems nuevos.`;
    setStatus(msg);
    notify(
      left.length
        ? `${msg} Ojo: ${left.length} ${left.length === 1 ? 'ítem no tiene' : 'ítems no tienen'} coincidencia en los PDF: ${left.slice(0, 3).join('; ')}${left.length > 3 ? '…' : ''}`
        : `${msg} Todos los ítems quedaron con precio.`,
      left.length > 0,
    );
  }

  const setRow = (i: number, patch: Partial<PreviewRow>) =>
    setPreview((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="filters">
        <button
          type="button"
          className="small primary"
          disabled={busy}
          onClick={() => allInput.current?.click()}
          title="Elige juntos la lista del cliente (Excel) y las cotizaciones de los proveedores (PDF o Excel): se crean los ítems y se les ponen los precios"
        >
          Cargar todos los archivos
        </button>
        <input
          ref={allInput}
          type="file"
          hidden
          multiple
          accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            if (files.length) void loadAll(files);
          }}
        />
        <button
          type="button"
          className="small"
          disabled={busy}
          onClick={() => sheetInput.current?.click()}
          title="La lista del cliente crea los ítems; un Excel de proveedor (con precios) solo pone precios"
        >
          Lista del cliente (Excel / CSV)
        </button>
        <button
          type="button"
          className="small"
          disabled={busy}
          onClick={() => docInput.current?.click()}
          title={`Pone los precios en los ítems que ya tiene la cotización (no crea ítems nuevos). ${
            caps.data?.ai
              ? 'Si la tabla del PDF no cuadra con su subtotal, se lee con IA.'
              : 'Se lee la tabla del PDF; la IA no está configurada.'
          }`}
        >
          Cotizaciones de proveedor (PDF)
        </button>
        <button type="button" className="small" disabled={busy} onClick={() => setPasteOpen((o) => !o)}>
          Pegar filas copiadas
        </button>
        <span className="hint" aria-live="polite">
          {status}
        </span>
        <input
          ref={sheetInput}
          type="file"
          hidden
          multiple
          accept=".xlsx,.xls,.csv"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            if (files.length) void loadAll(files);
          }}
        />
        <input
          ref={docInput}
          type="file"
          hidden
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            if (!files.length) return;
            if (!quoteId)
              notify(
                'Guarda la cotización para que los PDF queden adjuntos. Por ahora solo se leen los precios.',
              );
            void loadAll(files);
          }}
        />
      </div>

      {unpriced?.items.length ? (
        <div className="match-section match-unpriced" role="alert">
          <div className="filters" style={{ justifyContent: 'space-between' }}>
            <b>
              {unpriced.items.length === 1
                ? 'Este ítem no encontró ninguna coincidencia'
                : `Estos ${unpriced.items.length} ítems no encontraron ninguna coincidencia`}{' '}
              en los PDF agregados{unpriced.docs ? ` (${unpriced.docs})` : ''} y{' '}
              {unpriced.items.length === 1 ? 'quedó' : 'quedaron'} sin precio:
            </b>
            <button
              type="button"
              className="match-remove"
              aria-label="Cerrar aviso"
              title="Cerrar aviso"
              onClick={() => setUnpriced(null)}
            >
              ×
            </button>
          </div>
          <ul className="match-missing">
            {unpriced.items.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <div className="hint">
            Agrega la cotización del proveedor que los incluya o ponles el precio a mano en la tabla de ítems.
          </div>
        </div>
      ) : null}

      {pasteOpen ? (
        <div style={{ marginBottom: 12 }}>
          <div className="hint">
            Una fila por línea: Descripción, Cantidad, Precio unitario (separadas por tabulación o coma).
          </div>
          <textarea
            className="input"
            rows={5}
            style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={'Cámara bala IP\t10\t183200\nGrabador NVR\t1\t1070802'}
          />
          <div className="filters" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="small primary"
              disabled={!pasteText.trim() || busy}
              onClick={() =>
                void run(() => importsApi.text(pasteText)).then(() => {
                  setPasteOpen(false);
                  setPasteText('');
                })
              }
            >
              Leer filas
            </button>
            <button type="button" className="small" onClick={() => setPasteOpen(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {preview.length > 0 ? (
        <div className="preview-box">
          <div className="filters" style={{ justifyContent: 'space-between' }}>
            <b style={{ fontSize: 13, color: 'var(--navy)' }}>
              Ítems detectados — revisa y corrige antes de importar
            </b>
            <span style={{ display: 'flex', gap: 6 }}>
              {canMatch ? (
                <button
                  type="button"
                  className="small primary"
                  disabled={busy}
                  title="Pone los precios en los ítems que ya tiene la cotización, sin duplicarlos"
                  onClick={() => void associate()}
                >
                  Asociar precios a ítems existentes
                </button>
              ) : null}
              <button type="button" className={canMatch ? 'small' : 'small primary'} onClick={confirmImport}>
                {canMatch ? 'Agregar como ítems nuevos' : 'Importar seleccionados'}
              </button>
              <button type="button" className="small" onClick={() => setPreview([])}>
                Cancelar
              </button>
            </span>
          </div>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th className="col-xs" />
                  <th>Descripción</th>
                  <th className="col-xs">Und.</th>
                  <th className="col-sm">Cant.</th>
                  <th className="col-sm">Moneda</th>
                  <th className="col-md">Precio unit.</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>
                    <td className="col-center">
                      <input
                        type="checkbox"
                        checked={r.selected}
                        aria-label="Importar fila"
                        onChange={(e) => setRow(i, { selected: e.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        className="cell"
                        value={r.description}
                        onChange={(e) => setRow(i, { description: e.target.value })}
                      />
                      {r.note ? <div className="hint">↳ {r.note}</div> : null}
                    </td>
                    <td>
                      <input
                        className="cell"
                        value={r.unit}
                        onChange={(e) => setRow(i, { unit: e.target.value })}
                      />
                    </td>
                    <td>
                      <NumberInput value={r.quantity} onChange={(n) => setRow(i, { quantity: n ?? 0 })} />
                    </td>
                    <td>
                      <select
                        className="cell"
                        value={r.currency}
                        onChange={(e) => setRow(i, { currency: e.target.value as 'COP' | 'USD' })}
                      >
                        <option value="COP">COP</option>
                        <option value="USD">USD</option>
                      </select>
                    </td>
                    <td>
                      <NumberInput
                        key={r.currency /* se vuelve a formatear al cambiar la moneda */}
                        value={r.unitPrice}
                        ariaLabel="Precio unitario"
                        format={(n) => formatPrice(n, r.currency)}
                        onChange={(n) => setRow(i, { unitPrice: n ?? 0 })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {match ? (
        <PriceMatchReview
          items={existing.map((i) => ({
            id: i.id,
            description: i.description,
            unit: i.unit,
            quantity: i.quantity,
            group: i.group ?? null,
            clientRef: i.clientRef ?? null,
            unitPrice: i.unitPrice,
            currency: i.currency,
          }))}
          rows={match.rows}
          initial={match.result}
          document={docName || 'cotización de proveedor'}
          exchangeRate={draft.exchangeRate}
          onApply={applyPrices}
          onCancel={() => setMatch(null)}
        />
      ) : null}
    </div>
  );
}
