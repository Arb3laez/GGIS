import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  LABOR_ACTIVITY_PRESETS,
  OTHER_COST_PRESETS,
  QUOTE_STATUS_LABELS,
  type QuoteStatus,
} from '@ggis/domain';
import { downloadFrom } from '../../api/http';
import { useQuote } from '../../api/queries';
import { useConfirm } from '../../shared/confirm';
import { errorMessage, useToast } from '../../shared/feedback';
import { STATUS_STYLE } from '../../shared/status';
import { FilePlus2, FileSpreadsheet, FileText, Save, Truck, Wrench } from 'lucide-react';
import { BidSection } from './bid/BidSection';
import { SummaryAside } from './SummaryAside';
import { useScrollSpy } from './useScrollSpy';
import { AttachmentsSection } from './sections/AttachmentsSection';
import { ClientSection } from './sections/ClientSection';
import { ClosureSection } from './sections/ClosureSection';
import { CostLinesSection } from './sections/CostLinesSection';
import { ItemsSection } from './sections/ItemsSection';
import { PricingSection } from './sections/PricingSection';
import { SolutionPicker } from './sections/SolutionPicker';
import { StaffSection } from './sections/StaffSection';
import { TermsSection } from './sections/TermsSection';
import { clearLocalDraft, readLocalDraft, saveLocalDraft, useEditor } from './store';
import { useSaveQuote } from './useSaveQuote';

function draftSummary(client: string, project: string, savedAt: string) {
  const when = new Date(savedAt).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <>
      <div>{client || '(sin cliente)'}</div>
      {project ? <div className="muted">{project}</div> : null}
      <div className="muted">Guardado en este navegador: {when}</div>
    </>
  );
}

const SECTIONS = [
  { id: 'solucion', label: 'Solución' },
  { id: 'cliente', label: 'Cliente' },
  { id: 'items', label: 'Ítems' },
  { id: 'personal', label: 'Personal' },
  { id: 'actividades', label: 'M.O. por actividad' },
  { id: 'otros', label: 'Otros costos' },
  { id: 'condiciones', label: 'Condiciones' },
  { id: 'licitacion', label: 'Licitación / APU' },
  { id: 'precio', label: 'Precio' },
  { id: 'cierre', label: 'Cierre real' },
];

export function QuoteEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useToast();
  const { data: quote, error, isLoading } = useQuote(id);
  const { quoteId, number, draft, dirty, load, reset, edit } = useEditor();
  const { save, saving } = useSaveQuote();
  const confirm = useConfirm();
  const navItems = SECTIONS.filter((x) => x.id !== 'cierre' || draft.status === 'won');
  const active = useScrollSpy(navItems.map((x) => x.id));
  const loadedKey = useRef<string | null>(null);

  // Cargar la cotización del servidor (o empezar una nueva).
  useEffect(() => {
    if (!id) {
      if (loadedKey.current === 'new') return;
      loadedKey.current = 'new';
      reset();
      const local = readLocalDraft();
      if (local && !local.quoteId) {
        void confirm({
          title: '¿Recuperar el borrador?',
          message: 'Hay una cotización nueva que no se alcanzó a guardar en este navegador.',
          details: draftSummary(local.draft.client.name, local.draft.client.project, local.savedAt),
          confirmLabel: 'Recuperar borrador',
          cancelLabel: 'Empezar en blanco',
        }).then((ok) => {
          if (loadedKey.current !== 'new') return;
          if (ok) reset(local.draft);
          else clearLocalDraft();
        });
      }
      return;
    }
    if (quote && loadedKey.current !== quote.id) {
      loadedKey.current = quote.id;
      const local = readLocalDraft();
      load(quote);
      if (local?.quoteId === quote.id) {
        void confirm({
          title: '¿Recuperar los cambios sin guardar?',
          message: `Hay cambios de la ${quote.number} que no se alcanzaron a guardar en este navegador.`,
          details: draftSummary(local.draft.client.name, local.draft.client.project, local.savedAt),
          confirmLabel: 'Recuperar cambios',
          cancelLabel: 'Descartarlos',
        }).then((ok) => {
          if (loadedKey.current !== quote.id) return;
          if (ok) edit((x) => Object.assign(x, local.draft));
          else clearLocalDraft();
        });
      }
    }
  }, [id, quote, load, reset, edit, confirm]);

  // Borrador local de respaldo mientras hay cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => saveLocalDraft(quoteId, draft), 800);
    return () => clearTimeout(t);
  }, [dirty, draft, quoteId]);

  // Aviso al salir con cambios sin guardar y atajo Ctrl+S.
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().dirty) e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('keydown', onKey);
    };
  }, [save]);

  if (id && isLoading) return <div className="empty">Cargando cotización…</div>;
  if (id && error)
    return <div className="alert danger">No se pudo abrir la cotización: {errorMessage(error)}</div>;

  const statusStyle = STATUS_STYLE[draft.status];

  async function goToOffer() {
    const savedId = dirty || !quoteId ? await save() : quoteId;
    if (savedId) navigate(`/quotes/${savedId}/offer`);
  }

  async function startNew() {
    if (
      dirty &&
      !(await confirm({
        title: '¿Descartar los cambios sin guardar?',
        message: 'Si creas una cotización nueva ahora, se pierden los cambios que no has guardado.',
        confirmLabel: 'Descartar y crear nueva',
        cancelLabel: 'Seguir editando',
        tone: 'danger',
      }))
    )
      return;
    clearLocalDraft();
    loadedKey.current = null;
    navigate('/quotes/new');
    if (!id) {
      loadedKey.current = 'new';
      reset();
    }
  }

  return (
    <>
      <div className="editor-head no-print">
        <div>
          <div className="kicker">
            {number ? `Cotización ${number}` : 'Nueva cotización · se numera al guardar'}
          </div>
          <h1>{draft.client.name || draft.client.project || 'Sin cliente todavía'}</h1>
          <div className="meta">
            <select
              aria-label="Estado de la cotización"
              className="status-select"
              value={draft.status}
              style={{
                background: statusStyle.bg,
                color: statusStyle.fg,
                padding: '6px 12px',
                fontSize: 12.5,
              }}
              onChange={(e) => edit((x) => void (x.status = e.target.value as QuoteStatus))}
            >
              {Object.entries(QUOTE_STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <span className={`save-state ${dirty ? 'dirty' : quoteId ? 'saved' : ''}`}>
              <span className="dot" />
              {dirty ? 'Cambios sin guardar' : quoteId ? 'Todo guardado' : 'Sin guardar'}
            </span>
          </div>
        </div>
        <div className="toolbar">
          <button
            type="button"
            className="icon-btn"
            title="Nueva cotización"
            aria-label="Nueva cotización"
            onClick={startNew}
          >
            <FilePlus2 size={17} />
          </button>
          <button
            type="button"
            disabled={!quoteId}
            title={quoteId ? 'Hoja interna de análisis de costos' : 'Guarda la cotización primero'}
            onClick={() =>
              quoteId &&
              downloadFrom(`/api/quotes/${quoteId}/cost-analysis.xlsx`, 'analisis.xlsx').catch((e) =>
                notify(errorMessage(e), true),
              )
            }
          >
            <FileSpreadsheet size={16} /> Análisis Excel
          </button>
          <button type="button" onClick={() => void goToOffer()}>
            <FileText size={16} /> Oferta para el cliente
          </button>
          <button
            type="button"
            className="primary"
            disabled={saving}
            onClick={() => void save()}
            title="Ctrl+S"
          >
            <Save size={16} /> {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

      <nav className="section-nav no-print" aria-label="Secciones de la cotización">
        {navItems.map((x) => (
          <a
            key={x.id}
            href={`#${x.id}`}
            className={active === x.id ? 'active' : undefined}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(x.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            {x.label}
          </a>
        ))}
      </nav>

      <div className="editor-layout">
        <div>
          <SolutionPicker />
          <ClientSection />
          <ItemsSection />
          <AttachmentsSection />
          <StaffSection />
          <CostLinesSection
            id="actividades"
            icon={<Wrench size={16} />}
            field="laborActivities"
            title="Mano de obra por actividad"
            description="Mano de obra que no es un % del material sino un valor por actividad. Entra al costo total; no sale como línea en la oferta: se reparte dentro del precio de los ítems."
            conceptLabel="Actividad"
            presets={LABOR_ACTIVITY_PRESETS}
            addLabel="+ Agregar actividad"
          />
          <CostLinesSection
            id="otros"
            icon={<Truck size={16} />}
            field="otherCosts"
            title="Otros costos del proyecto"
            description="Herramientas, andamios, transporte, viáticos, licencias, diseños… No salen en la oferta: se reparten dentro del precio de los ítems."
            conceptLabel="Concepto"
            presets={OTHER_COST_PRESETS}
            addLabel="+ Agregar costo"
          />
          <TermsSection />
          <BidSection />
          <PricingSection />
          {draft.status === 'won' ? <ClosureSection /> : null}
        </div>
        <SummaryAside />
      </div>
    </>
  );
}
