import { useRef, useState } from 'react';
import { FileSpreadsheet, Gavel } from 'lucide-react';
import type { BidWorkbookImport } from '@ggis/domain';
import { importsApi } from '../../../api/queries';
import { useConfirm } from '../../../shared/confirm';
import { errorMessage, useToast } from '../../../shared/feedback';
import { Field, NumberField } from '../../../shared/inputs';
import { SectionTitle } from '../../../shared/SectionTitle';
import { useDraft, useEdit } from '../store';
import { AdminPanel, CapsPanel, ClarificationsPanel, LicifyPanel, ReviewPanel } from './BidPanels';
import { SuppliesTable } from './SuppliesTable';

/**
 * Licitación / APU: lo que antes vivía en el Excel de análisis de precios (parámetros, base de insumos,
 * revisión del subcontratista, administración desglosada, topes del pliego, datos Licify y aclaraciones).
 */
export function BidSection() {
  const d = useDraft();
  const edit = useEdit();
  const notify = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const a = d.apuParams;

  async function importWorkbook(file: File) {
    setImporting(true);
    try {
      const r = await importsApi.bidWorkbook(file);
      const ok = await confirm({
        title: '¿Aplicar el análisis de precios?',
        message:
          'Se reemplazan los ítems, insumos, parámetros APU y datos de licitación de esta cotización, y el precio pasa a "AIU licitación". El personal, la M.O. por actividad y los otros costos se vacían: en este método van dentro de la administración.',
        details: <ImportSummary r={r} />,
        confirmLabel: 'Aplicar',
        cancelLabel: 'Cancelar',
        tone: d.items.length > 0 ? 'danger' : 'default',
      });
      if (!ok) return;
      edit((x) => {
        if (r.exchangeRate) x.exchangeRate = r.exchangeRate;
        x.apuParams = r.apuParams;
        x.supplies = r.supplies;
        x.items = r.items;
        x.bid = r.bid;
        x.staff = [];
        x.laborActivities = [];
        x.otherCosts = [];
        x.pricing.method = 'aiu_bid';
        x.pricing.aiu = { ...x.pricing.aiu, ...r.aiu };
        x.terms = { ...x.terms, ...r.terms };
        if (r.validDays) x.validDays = r.validDays;
      });
      notify(`Análisis aplicado: ${r.summary.items} ítems y ${r.summary.supplies} insumos`);
    } catch (err) {
      notify(errorMessage(err), true);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <section className="card" id="licitacion" aria-labelledby="bid-title">
      <SectionTitle
        icon={<Gavel size={16} />}
        id="bid-title"
        right={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xlsm,.xls"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importWorkbook(f);
              }}
            />
            <button
              type="button"
              className="small"
              disabled={importing}
              onClick={() => fileRef.current?.click()}
            >
              <FileSpreadsheet size={15} /> {importing ? 'Leyendo…' : 'Importar análisis APU (Excel)'}
            </button>
          </>
        }
      >
        Licitación / APU
      </SectionTitle>
      <div className="sub">
        Análisis de precios unitarios por ítem, revisión del subcontratista y chequeo contra el pliego. Úsalo
        con el método de precio <b>AIU licitación</b> (precio unitario = costo directo).
      </div>

      <div className="section-title">Parámetros</div>
      <div className="grid-3">
        <NumberField
          label="Factor de importación (precios USD)"
          value={a.importFactor}
          hint="Flete, arancel y nacionalización"
          onChange={(n) => n >= 1 && edit((x) => void (x.apuParams.importFactor = n))}
        />
        <NumberField
          label="Escalamiento listas de precios"
          value={a.escalationFactor}
          onChange={(n) => n >= 0.5 && edit((x) => void (x.apuParams.escalationFactor = n))}
        />
        <NumberField
          label="Desperdicio (%)"
          value={a.wastePct}
          onChange={(n) => edit((x) => void (x.apuParams.wastePct = n))}
        />
        <NumberField
          label="Herramienta menor (% de M.O.)"
          value={a.toolsPctOfLabor}
          onChange={(n) => edit((x) => void (x.apuParams.toolsPctOfLabor = n))}
        />
        <NumberField
          label="Plazo del contrato (meses)"
          value={d.bid.contractMonths}
          onChange={(n) => edit((x) => void (x.bid.contractMonths = n))}
        />
        <NumberField
          label="Meses con personal en campo"
          value={d.bid.fieldMonths}
          onChange={(n) => edit((x) => void (x.bid.fieldMonths = n))}
        />
      </div>
      <div className="hint" style={{ marginTop: 6 }}>
        La TRM es la de la sección Ítems ({d.exchangeRate.toLocaleString('es-CO')} COP/USD).
      </div>

      <SuppliesTable />

      <div className="section-title">Revisión del subcontratista</div>
      <Field label="Subcontratista">
        <input
          value={d.bid.subcontractorName}
          placeholder="Nombre del subcontratista"
          onChange={(e) => edit((x) => void (x.bid.subcontractorName = e.target.value))}
        />
      </Field>
      <ReviewPanel />

      <AdminPanel />
      <CapsPanel />
      <LicifyPanel />
      <ClarificationsPanel />
    </section>
  );
}

function ImportSummary({ r }: { r: BidWorkbookImport }) {
  const s = r.summary;
  return (
    <>
      <div>
        {s.items} ítems ({s.itemsWithApu} con APU, {s.itemsWithSubcontractorPrice} con precio del
        subcontratista)
      </div>
      <div>
        {s.supplies} insumos{s.estimatedSupplies ? ` (${s.estimatedSupplies} estimados)` : ''} ·{' '}
        {s.clarifications} aclaraciones
      </div>
      {r.exchangeRate ? <div className="muted">TRM {r.exchangeRate.toLocaleString('es-CO')}</div> : null}
      {r.warnings.map((w) => (
        <div key={w} style={{ color: 'var(--warn)' }}>
          · {w}
        </div>
      ))}
    </>
  );
}
