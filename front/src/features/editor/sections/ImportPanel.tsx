import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { blankItem, type ImportedRow } from '@ggis/domain';
import { importsApi, keys, useImportCapabilities } from '../../../api/queries';
import { errorMessage, useToast } from '../../../shared/feedback';
import { NumberInput } from '../../../shared/inputs';
import { useEdit, useEditor } from '../store';

type PreviewRow = ImportedRow & { selected: boolean };

/**
 * Importar ítems desde Excel/CSV, PDF/imagen (con IA en el servidor) o filas pegadas.
 * Siempre muestra una previsualización editable antes de agregarlos.
 */
export function ImportPanel() {
  const edit = useEdit();
  const quoteId = useEditor((s) => s.quoteId);
  const notify = useToast();
  const qc = useQueryClient();
  const caps = useImportCapabilities();
  const sheetInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  async function run(task: () => Promise<{ rows: ImportedRow[]; message: string }>) {
    setBusy(true);
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

  function confirmImport() {
    const rows = preview.filter((r) => r.selected && r.description.trim());
    edit((x) => {
      const items = rows.map((r) => ({
        ...blankItem(r.description, r.unit || 'UN'),
        quantity: r.quantity,
        currency: r.currency,
        unitPrice: r.unitPrice,
      }));
      const onlyBlank = x.items.length === 1 && !x.items[0]!.description.trim();
      x.items = onlyBlank ? items : [...x.items, ...items];
    });
    setPreview([]);
    setStatus(`Se importaron ${rows.length} ítems.`);
  }

  const setRow = (i: number, patch: Partial<PreviewRow>) =>
    setPreview((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="filters">
        <button type="button" className="small" disabled={busy} onClick={() => sheetInput.current?.click()}>
          Cargar Excel / CSV
        </button>
        <button
          type="button"
          className="small"
          disabled={busy}
          onClick={() => docInput.current?.click()}
          title={
            caps.data?.ai
              ? 'Se lee con IA en el servidor'
              : 'La IA no está configurada: se lee el texto del PDF'
          }
        >
          Adjuntar PDF o imagen{caps.data?.ai ? ' (IA)' : ''}
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
          accept=".xlsx,.xls,.csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void run(() => importsApi.spreadsheet(f));
          }}
        />
        <input
          ref={docInput}
          type="file"
          hidden
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            if (!quoteId)
              notify(
                'Guarda la cotización para que el documento quede adjunto. Por ahora solo se leerán los ítems.',
              );
            void run(async () => {
              const res = await importsApi.document(f, quoteId);
              if (res.attachment && quoteId)
                void qc.invalidateQueries({ queryKey: keys.attachments(quoteId) });
              return res;
            });
          }}
        />
      </div>

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
              <button type="button" className="small primary" onClick={confirmImport}>
                Importar seleccionados
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
                      <NumberInput value={r.unitPrice} onChange={(n) => setRow(i, { unitPrice: n ?? 0 })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
