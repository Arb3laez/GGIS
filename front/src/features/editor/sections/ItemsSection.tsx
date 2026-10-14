import { useCallback, useMemo, useState } from 'react';
import {
  blankItem,
  formatCop,
  newRowId,
  quoteWarnings,
  type CatalogItem,
  type Complexity,
  type Currency,
  type QuoteItem,
} from '@ggis/domain';
import { Calculator, Package } from 'lucide-react';
import { exchangeRateApi, useCatalog } from '../../../api/queries';
import { SectionTitle } from '../../../shared/SectionTitle';
import { Alerts, errorMessage, useToast } from '../../../shared/feedback';
import { Checkbox, NumberField, NumberInput } from '../../../shared/inputs';
import { useBreakdown, useDraft, useEdit } from '../store';
import { ApuEditor } from '../bid/ApuEditor';
import { ImportPanel } from './ImportPanel';

const marginColor = (pct: number) => (pct >= 25 ? 'var(--ok)' : pct >= 12 ? 'var(--warn)' : 'var(--danger)');

export function ItemsSection() {
  const d = useDraft();
  const edit = useEdit();
  const breakdown = useBreakdown();
  const notify = useToast();
  const catalog = useCatalog();
  const [filter, setFilter] = useState('');
  const [trmStatus, setTrmStatus] = useState('');
  const [apuItemId, setApuItemId] = useState<string | null>(null);

  const catalogByKey = useMemo(() => {
    const m = new Map<string, CatalogItem>();
    for (const c of catalog.data?.items ?? []) m.set(c.description.trim().toLowerCase(), c);
    return m;
  }, [catalog.data]);

  const byId = useMemo(() => new Map(breakdown.items.map((b) => [b.id, b])), [breakdown.items]);
  const visible = filter
    ? d.items.filter((i) => i.description.toLowerCase().includes(filter.toLowerCase()))
    : d.items;
  const warnings = quoteWarnings(d, breakdown).filter(
    (w) => w.code.startsWith('orphan') || w.code.startsWith('labor') || w.code === 'no-billable-items',
  );
  const t = breakdown.totals;
  const closeApu = useCallback(() => setApuItemId(null), []);

  const editItem = (id: string, recipe: (i: QuoteItem) => void) =>
    edit((x) => {
      const it = x.items.find((i) => i.id === id);
      if (it) recipe(it);
    });

  const setDescription = (id: string, value: string) =>
    editItem(id, (it) => {
      it.description = value;
      const match = catalogByKey.get(value.trim().toLowerCase());
      if (match) {
        it.unit = match.unit;
        it.currency = match.currency;
        it.unitPrice = match.unitPrice;
        it.laborPct = match.laborPct;
      }
    });

  async function fetchTrm() {
    setTrmStatus('Consultando…');
    try {
      const r = await exchangeRateApi.current();
      edit((x) => void (x.exchangeRate = r.rate));
      setTrmStatus(
        `${r.source === 'trm-oficial' ? 'TRM oficial' : 'Tasa de mercado'} vigente el ${r.validOn}`,
      );
    } catch (err) {
      setTrmStatus('');
      notify(errorMessage(err), true);
    }
  }

  return (
    <section className="card" id="items" aria-labelledby="items-title">
      <SectionTitle icon={<Package size={16} />} id="items-title">
        Ítems de la cotización
      </SectionTitle>
      <div className="sub">
        Precio en COP o USD (se convierte con la TRM). Cada material con precio se guarda en el catálogo: al
        escribir su nombre se autocompletan precio, moneda, unidad y % de M.O.
      </div>

      <ImportPanel />

      <div className="grid-3" style={{ alignItems: 'end' }}>
        <NumberField
          label="TRM del día (COP/USD)"
          value={d.exchangeRate}
          onChange={(n) => n > 0 && edit((x) => void (x.exchangeRate = n))}
        />
        <NumberField
          label="% nacionalización + transporte a bodega"
          value={d.importCostPct}
          onChange={(n) => edit((x) => void (x.importCostPct = n))}
        />
        <div>
          <button type="button" className="small" onClick={fetchTrm}>
            Actualizar TRM
          </button>
          <div className="hint">{trmStatus}</div>
        </div>
      </div>

      <div className="filters">
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder="Buscar ítem por descripción…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Buscar ítem"
        />
        <span className="hint">
          {filter ? `${visible.length} de ${d.items.length} ítems` : `${d.items.length} ítems`}
          {catalog.data?.total ? ` · ${catalog.data.total} en catálogo` : ''}
        </span>
      </div>

      <datalist id="catalog-list">
        {(catalog.data?.items ?? []).map((c) => (
          <option key={c.id} value={c.description} />
        ))}
      </datalist>

      <div className="table-scroll">
        <table className="items-table">
          <thead>
            <tr>
              <th className="col-desc">Descripción</th>
              <th className="col-xs">Und.</th>
              <th className="col-sm">Cant.</th>
              <th className="col-sm">Moneda</th>
              <th className="col-md">Precio unit. material</th>
              <th className="col-xs" title="Suma el % de nacionalización y transporte">
                ¿Nac./ transp.?
              </th>
              <th className="col-xs" title="El precio del proveedor no trae IVA: se suma 19%">
                ¿+IVA 19%?
              </th>
              <th className="col-xs">% M.O.</th>
              <th className="col-xs" title="Carga a este ítem el personal fijo y la M.O. por actividad">
                ¿Cargar M.O. aquí?
              </th>
              <th className="col-md">Costo unit.</th>
              <th className="col-sm">Complej. ítem</th>
              <th className="col-md">Precio venta unit.</th>
              <th className="col-xs">Margen</th>
              <th className="col-md">Venta total</th>
              <th className="col-md">Costo total</th>
              <th className="row-actions" />
            </tr>
          </thead>
          <tbody>
            {visible.map((it) => {
              const b = byId.get(it.id);
              return (
                <tr key={it.id}>
                  <td className="col-desc">
                    <input
                      className="cell"
                      list="catalog-list"
                      value={it.description}
                      placeholder="Escribe o elige del catálogo"
                      aria-label="Descripción"
                      onChange={(e) => setDescription(it.id, e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="cell"
                      value={it.unit}
                      aria-label="Unidad"
                      onChange={(e) => editItem(it.id, (x) => void (x.unit = e.target.value))}
                    />
                  </td>
                  <td>
                    <NumberInput
                      value={it.quantity}
                      ariaLabel="Cantidad"
                      onChange={(n) => editItem(it.id, (x) => void (x.quantity = n ?? 0))}
                    />
                  </td>
                  <td>
                    <select
                      className="cell"
                      value={it.currency}
                      aria-label="Moneda"
                      onChange={(e) => editItem(it.id, (x) => void (x.currency = e.target.value as Currency))}
                    >
                      <option value="COP">COP</option>
                      <option value="USD">USD</option>
                    </select>
                  </td>
                  <td>
                    {b?.apu ? (
                      <div className="num-out" title="Costo del APU: suministro por unidad">
                        {formatCop(b.unitSupplyCost)}
                        <div className="hint">desde APU</div>
                      </div>
                    ) : (
                      <NumberInput
                        value={it.unitPrice}
                        ariaLabel="Precio unitario"
                        onChange={(n) => editItem(it.id, (x) => void (x.unitPrice = n ?? 0))}
                      />
                    )}
                  </td>
                  <td className="col-center">
                    <Checkbox
                      checked={it.applyImportCost}
                      title="Nacionalización y transporte"
                      onChange={(v) => editItem(it.id, (x) => void (x.applyImportCost = v))}
                    />
                  </td>
                  <td className="col-center">
                    <Checkbox
                      checked={it.supplierVatIncluded}
                      title="Sumar IVA del proveedor"
                      onChange={(v) => editItem(it.id, (x) => void (x.supplierVatIncluded = v))}
                    />
                  </td>
                  <td>
                    {b?.apu ? (
                      <span className="hint">APU</span>
                    ) : (
                      <NumberInput
                        value={it.laborPct}
                        ariaLabel="% mano de obra"
                        onChange={(n) => editItem(it.id, (x) => void (x.laborPct = n ?? 0))}
                      />
                    )}
                  </td>
                  <td className="col-center">
                    <Checkbox
                      checked={it.carriesFixedLabor}
                      title="Cargar M.O. fija a este ítem"
                      onChange={(v) => editItem(it.id, (x) => void (x.carriesFixedLabor = v))}
                    />
                  </td>
                  <td className="num-out">{formatCop(b?.unitCost)}</td>
                  <td>
                    <select
                      className="cell"
                      value={it.complexity}
                      aria-label="Complejidad del ítem"
                      onChange={(e) =>
                        editItem(it.id, (x) => void (x.complexity = e.target.value as Complexity))
                      }
                    >
                      <option value="low">Baja</option>
                      <option value="medium">Media</option>
                      <option value="high">Alta</option>
                    </select>
                  </td>
                  <td>
                    <NumberInput
                      value={it.salePriceOverride}
                      allowNull
                      ariaLabel="Precio de venta fijo"
                      placeholder={String(Math.round(b?.saleUnitPrice ?? 0))}
                      onChange={(n) =>
                        editItem(it.id, (x) => void (x.salePriceOverride = n && n > 0 ? n : null))
                      }
                    />
                  </td>
                  <td
                    className="col-center"
                    style={{ fontWeight: 700, color: marginColor(b?.marginPct ?? 0) }}
                  >
                    {(b?.marginPct ?? 0).toFixed(0)}%
                  </td>
                  <td className="num-out" style={{ color: 'var(--steel)' }}>
                    {formatCop(b?.saleTotal)}
                  </td>
                  <td className="num-out">
                    {formatCop(b?.totalCost)}
                    {b && b.assignedFixedLabor > 0 ? (
                      <div className="hint">incl. M.O. {formatCop(b.assignedFixedLabor)}</div>
                    ) : null}
                  </td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className={`small${it.apu?.length ? ' apu-on' : ''}`}
                      title={
                        it.apu?.length
                          ? `APU: ${it.apu.length} línea(s)`
                          : 'Análisis de precio unitario (APU)'
                      }
                      aria-label="Abrir APU del ítem"
                      onClick={() => setApuItemId(it.id)}
                    >
                      <Calculator size={13} />
                    </button>
                    <button
                      type="button"
                      className="small"
                      title="Duplicar"
                      aria-label="Duplicar ítem"
                      onClick={() =>
                        edit((x) => {
                          const idx = x.items.findIndex((i) => i.id === it.id);
                          x.items.splice(idx + 1, 0, { ...x.items[idx]!, id: newRowId() });
                        })
                      }
                    >
                      ⧉
                    </button>
                    <button
                      type="button"
                      className="ghost-danger"
                      title="Eliminar"
                      aria-label="Eliminar ítem"
                      onClick={() => edit((x) => void (x.items = x.items.filter((i) => i.id !== it.id)))}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="small add-row"
        onClick={() => edit((x) => void x.items.push(blankItem()))}
      >
        + Agregar ítem
      </button>

      <div className="totals-bar">
        <span>
          materiales: <b>{formatCop(t.materials)}</b>
        </span>
        <span>
          M.O. instalación: <b>{formatCop(t.itemLabor)}</b>
        </span>
        <span>
          Valor venta (subtotal): <b className="big">{formatCop(t.subtotal)}</b>
        </span>
      </div>
      <Alerts items={warnings} />
      {apuItemId ? <ApuEditor itemId={apuItemId} onClose={closeApu} /> : null}
    </section>
  );
}
