import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  BUSINESS_UNIT_LABELS,
  computeQuote,
  formatCop,
  PAYMENT_MODE_LABELS,
  safeFileName,
  type CompanyProfile,
  type Quote,
} from '@ggis/domain';
import { downloadFrom, saveBlob } from '../../api/http';
import { keys, quotesApi, useCompanyProfile, useQuote } from '../../api/queries';
import { useConfirm } from '../../shared/confirm';
import { quoteToDraft } from '../editor/store';
import {
  ArrowLeft,
  ChevronDown,
  Copy,
  Download,
  FileCode,
  FileDown,
  FileSpreadsheet,
  FolderSync,
  Image,
  Mail,
  Pencil,
  Printer,
  RotateCcw,
  Save,
  X,
} from 'lucide-react';
import { errorMessage, useToast } from '../../shared/feedback';
import { attachImageFallback, attachmentUrl } from '../../shared/LibraryImage';
import { applyEdits, cleanHtml, diffEdits, parseFragment, unwrapDoc, type OfferEdit } from './offer-edits';
import { ProposalDocument } from './ProposalDocument';
import proposalCss from './proposal.css?raw';

/** Texto de la condición de pago, con los días de financiación cuando aplican. */
function paymentText(q: Quote): string {
  const days = q.terms.financingDays;
  let text = PAYMENT_MODE_LABELS[q.terms.paymentMode];
  if (days > 0) {
    text = text.includes('X días')
      ? text.replace('X días', `${days} días`)
      : `${text} — saldo a ${days} días`;
  }
  return text;
}

/** Convierte las imágenes del documento a data URL para que el HTML descargado sea autónomo. */
async function inlineImages(root: HTMLElement): Promise<string> {
  const clone = root.cloneNode(true) as HTMLElement;
  await Promise.all(
    [...clone.querySelectorAll('img')].map(async (img) => {
      const src = img.getAttribute('src');
      if (!src || src.startsWith('data:')) return;
      const blob = await fetch(src).then((r) => r.blob());
      img.src = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      });
    }),
  );
  return clone.outerHTML;
}

function emailDraft(q: Quote, company: CompanyProfile) {
  const t = computeQuote(q).totals;
  const pagos = [
    q.terms.advancePct > 0 ? `Anticipo: ${q.terms.advancePct}%` : '',
    q.terms.progressPct > 0 ? `Avance por ejecución: ${q.terms.progressPct}%` : '',
    q.terms.onDeliveryPct > 0 ? `Contra entrega: ${q.terms.onDeliveryPct}%` : '',
  ].filter(Boolean);
  const body = [
    q.client.contact ? `Estimado(a) ${q.client.contact},` : 'Cordial saludo,',
    '',
    `Adjunto encontrará la propuesta comercial ${q.number} correspondiente a: ${q.client.project || 'el proyecto solicitado'}.`,
    '',
    `Valor total de la oferta: ${formatCop(t.total)}`,
    `Validez: ${q.validDays} días a partir de la fecha de emisión.`,
    pagos.length ? `Forma de pago: ${pagos.join(' · ')} (${paymentText(q)})` : '',
    '',
    'Tiempos de entrega:',
    `- Equipos nacionales: ${q.terms.deliveryNational}`,
    `- Importación: ${q.terms.deliveryImport}`,
    `- Instalación: ${q.terms.installationTime}`,
    '',
    'Quedo atento a sus comentarios.',
    '',
    company.signatoryName,
    company.signatoryTitle,
    company.legalName,
    company.signatoryContact,
    company.slogan,
  ]
    .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
    .join('\n');
  return {
    to: q.client.email,
    subject: `Propuesta comercial ${q.number} — ${q.client.project} — ${company.tradeName}`,
    body,
  };
}

export function OfferPage() {
  const { id } = useParams();
  const { data: quote, error } = useQuote(id);
  const { data: company } = useCompanyProfile();
  const notify = useToast();
  const docRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState<ReturnType<typeof emailDraft> | null>(null);
  const [dropboxPath, setDropboxPath] = useState<string | null>(null);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const downloadsRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const confirm = useConfirm();
  /** HTML con el que arranca la edición (null = no se está editando). */
  const [editHtml, setEditHtml] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const editRef = useRef<HTMLDivElement | null>(null);
  /** Oferta generada desde la cotización (oculta): base sobre la que se aplican los textos editados. */
  const baseRef = useRef<HTMLDivElement>(null);
  const [baseHtml, setBaseHtml] = useState('');
  const shownRef = useRef<HTMLDivElement | null>(null);

  // Cada vez que se arma la oferta desde la cotización, se toma su HTML como base.
  useLayoutEffect(() => {
    const doc = baseRef.current?.querySelector('.proposal-doc')?.cloneNode(true) as HTMLElement | undefined;
    if (!doc) return;
    doc.querySelector('style')?.remove();
    setBaseHtml(doc.innerHTML);
  }, [quote, company]);

  // Cambios guardados; las ofertas editadas con el formato antiguo (foto fija) se convierten aquí.
  const stored = useMemo((): { edits: OfferEdit[]; editedAt: string; legacy: boolean } | null => {
    if (!quote || !baseHtml) return null;
    if (quote.offerEdits) return { ...quote.offerEdits, legacy: false };
    if (!quote.offerOverride) return null;
    const edits = diffEdits(
      parseFragment(baseHtml),
      unwrapDoc(parseFragment(cleanHtml(quote.offerOverride.html))),
      {
        ignoreNumberChanges: true,
      },
    );
    return { edits, editedAt: quote.offerOverride.editedAt, legacy: true };
  }, [quote, baseHtml]);

  /** Oferta final = la generada + los textos editados que todavía encuentran su lugar. */
  const shown = useMemo(() => {
    if (!stored || !baseHtml) return null;
    const root = parseFragment(baseHtml);
    const missed = applyEdits(root, stored.edits);
    return { html: root.innerHTML, missed };
  }, [stored, baseHtml]);

  useEffect(() => (shownRef.current ? attachImageFallback(shownRef.current) : undefined), [shown, editHtml]);

  // El menú de descargas se cierra al hacer clic fuera o con Escape.
  useEffect(() => {
    if (!downloadsOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!downloadsRef.current?.contains(e.target as Node)) setDownloadsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDownloadsOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [downloadsOpen]);

  if (error) return <div className="alert danger">{errorMessage(error)}</div>;
  if (!quote || !company) return <div className="empty">Cargando oferta…</div>;

  const baseName = `Propuesta ${quote.number} - ${safeFileName(quote.client.name)}`;
  const editing = editHtml !== null;
  const hasEdits = !!stored && (stored.edits.length > 0 || stored.legacy);

  /** Guarda los cambios de texto (o los quita, con null) en la cotización. */
  async function saveEdits(edits: OfferEdit[] | null) {
    if (!quote) return;
    setSavingEdit(true);
    try {
      const draft = quoteToDraft(quote);
      draft.offerEdits = edits?.length ? { edits, editedAt: new Date().toISOString() } : null;
      draft.offerOverride = null;
      const saved = await quotesApi.update(quote.id, quote.version, draft);
      qc.setQueryData(keys.quote(saved.id), saved);
      void qc.invalidateQueries({ queryKey: keys.quotes, refetchType: 'inactive' });
      setEditHtml(null);
      notify(
        edits?.length ? '✓ Cambios de la oferta guardados' : '✓ Oferta restablecida desde la cotización',
      );
    } catch (err) {
      notify(`No se pudo guardar: ${errorMessage(err)}`, true);
    } finally {
      setSavingEdit(false);
    }
  }

  /** Compara lo editado con la oferta generada y guarda solo los bloques que cambiaron. */
  function saveEditing() {
    if (!editRef.current) return;
    const edits = diffEdits(parseFragment(baseHtml), parseFragment(editRef.current.innerHTML));
    void saveEdits(edits);
  }

  async function restoreOriginal() {
    const ok = await confirm({
      title: '¿Quitar los textos editados?',
      message: 'Se pierden los textos que cambiaste a mano y la oferta queda tal como sale de la cotización.',
      confirmLabel: 'Quitar textos editados',
      cancelLabel: 'Cancelar',
    });
    if (ok) await saveEdits(null);
  }

  /**
   * Imprime únicamente el documento de la propuesta en una ventana limpia.
   * Evita que el shell de la app agregue una página en blanco al final.
   */
  function printProposal() {
    if (!docRef.current) return;
    const proposal = docRef.current.querySelector('.proposal-doc');
    if (!proposal) return;
    const clone = proposal.cloneNode(true) as HTMLElement;
    clone.querySelector('style')?.remove();
    const win = window.open('', '_blank', 'width=900,height=1000');
    if (!win) {
      notify('Permite ventanas emergentes para imprimir la propuesta.', true);
      return;
    }
    win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${baseName.replace(/</g, '')}</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap" rel="stylesheet">
<style>${proposalCss}</style>
<style>@page{size:A4;margin:0}html,body{margin:0;background:#fff}.proposal-doc{padding:0;background:#fff}</style>
</head><body>${clone.outerHTML}</body></html>`);
    win.document.close();
    let printed = false;
    const trigger = () => {
      if (printed) return;
      printed = true;
      win.focus();
      win.print();
    };
    win.setTimeout(trigger, 1200);
    win.onload = () => win.setTimeout(trigger, 300);
  }

  /**
   * Descarga la oferta como archivo PDF: cada página A4 se convierte en imagen (con la fuente
   * incrustada) y se arma el PDF en el navegador, sin pasar por el diálogo de impresión.
   */
  async function downloadPdf() {
    const pages = [...(docRef.current?.querySelectorAll<HTMLElement>('.pp-page') ?? [])];
    if (!pages.length) return;
    setPdfBusy(true);
    try {
      const [{ toJpeg, getFontEmbedCSS }, { jsPDF }] = await Promise.all([
        import('html-to-image'),
        import('jspdf'),
      ]);
      await document.fonts.ready;
      const fontEmbedCSS = await getFontEmbedCSS(pages[0]!);
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      for (const [i, page] of pages.entries()) {
        const image = await toJpeg(page, {
          quality: 0.9,
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          fontEmbedCSS,
          // Sin la sombra ni el margen de la vista en pantalla.
          style: { margin: '0', boxShadow: 'none' },
        });
        if (i > 0) pdf.addPage();
        pdf.addImage(image, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      }
      pdf.save(`${baseName}.pdf`);
    } finally {
      setPdfBusy(false);
    }
  }

  async function downloadHtml() {
    if (!docRef.current) return;
    const content = await inlineImages(docRef.current);
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${baseName.replace(/</g, '')}</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap" rel="stylesheet">
<style>body{margin:0;background:#fff;font-family:'Manrope',Arial,sans-serif}.barra{position:sticky;top:0;background:#0F2233;padding:10px;text-align:center}
.barra button{font-size:14px;padding:8px 18px;border:none;border-radius:6px;background:#0094F8;color:#fff;cursor:pointer;font-weight:600}@media print{.barra{display:none}}</style>
</head><body><div class="barra"><button onclick="window.print()">Imprimir / Guardar como PDF</button></div>${content}</body></html>`;
    saveBlob(new Blob([html], { type: 'text/html' }), `${baseName}.html`);
  }

  async function dropboxPackage() {
    if (!quote || !company) return;
    if (!quote.businessUnit) {
      notify('Primero elige la unidad de negocio de la cotización: define la carpeta de Dropbox.', true);
      return;
    }
    try {
      await downloadHtml();
      await downloadFrom(`/api/quotes/${quote.id}/cost-analysis.xlsx`, 'analisis.xlsx');
      setDropboxPath(`${company.dropboxBasePath}\\${BUSINESS_UNIT_LABELS[quote.businessUnit]}`);
    } catch (err) {
      notify(errorMessage(err), true);
    }
  }

  /** Ejecuta una descarga del menú y lo cierra; los errores se avisan. */
  async function download(action: () => Promise<void> | void) {
    setDownloadsOpen(false);
    try {
      await action();
    } catch (err) {
      notify(errorMessage(err), true);
    }
  }

  const aiImages = [
    { id: quote.research?.images.need ?? null, label: 'Imagen IA · La necesidad', name: 'necesidad' },
    { id: quote.research?.images.solution ?? null, label: 'Imagen IA · La solución', name: 'solucion' },
  ].filter((x): x is { id: string; label: string; name: string } => !!x.id);

  return (
    <div className="offer-page" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div className="editor-head no-print">
        <div>
          <Link
            to={`/quotes/${quote.id}`}
            className="kicker"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
          >
            <ArrowLeft size={14} /> Volver a editar {quote.number}
          </Link>
          <h1>Propuesta comercial</h1>
        </div>
        {editing ? (
          <div className="toolbar">
            <button type="button" disabled={savingEdit} onClick={() => setEditHtml(null)}>
              <X size={16} /> Cancelar
            </button>
            <button type="button" className="primary" disabled={savingEdit} onClick={saveEditing}>
              <Save size={16} /> {savingEdit ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        ) : (
          <div className="toolbar">
            <button
              type="button"
              title="Cambia palabras o frases de la oferta directamente sobre el documento"
              disabled={!baseHtml}
              onClick={() => setEditHtml(shown?.html ?? baseHtml)}
            >
              <Pencil size={16} /> Editar textos
            </button>
            <button type="button" onClick={() => setEmail(emailDraft(quote, company))}>
              <Mail size={16} /> Preparar correo
            </button>
            <button type="button" onClick={() => void dropboxPackage()}>
              <FolderSync size={16} /> Paquete Dropbox
            </button>
            <div className="menu-wrap" ref={downloadsRef}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={downloadsOpen}
                disabled={pdfBusy}
                onClick={() => setDownloadsOpen((o) => !o)}
              >
                <Download size={16} /> {pdfBusy ? 'Generando PDF…' : 'Descargas'} <ChevronDown size={14} />
              </button>
              {downloadsOpen ? (
                <div className="menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => void download(downloadPdf)}>
                    <FileDown size={15} /> Oferta en PDF
                  </button>
                  <button type="button" role="menuitem" onClick={() => void download(downloadHtml)}>
                    <FileCode size={15} /> Oferta en HTML
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() =>
                      void download(() =>
                        downloadFrom(
                          `/api/quotes/${quote.id}/cost-analysis.xlsx`,
                          `${baseName} - análisis.xlsx`,
                        ),
                      )
                    }
                  >
                    <FileSpreadsheet size={15} /> Análisis de costos (Excel)
                  </button>
                  {aiImages.map((img) => (
                    <button
                      key={img.id}
                      type="button"
                      role="menuitem"
                      onClick={() =>
                        void download(() =>
                          downloadFrom(attachmentUrl(img.id), `${baseName} - ${img.name}.jpg`),
                        )
                      }
                    >
                      <Image size={15} /> {img.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="primary"
              onClick={printProposal}
              title="Se abre una ventana solo con la propuesta; elige 'Guardar como PDF'"
            >
              <Printer size={16} /> Imprimir / PDF
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="alert info no-print">
          Modo edición: haz clic sobre cualquier texto de la oferta y escríbelo como en un documento. Al
          terminar pulsa <b>Guardar cambios</b>. Se guardan solo los textos que cambies: si después cambias el
          precio o los ítems en la cotización, la oferta se actualiza y tus textos se conservan.
        </div>
      ) : hasEdits && stored ? (
        <div className={shown?.missed.length ? 'alert warning no-print' : 'alert info no-print'}>
          Esta oferta tiene {stored.edits.length} texto{stored.edits.length === 1 ? '' : 's'} editado
          {stored.edits.length === 1 ? '' : 's'} a mano ({new Date(stored.editedAt).toLocaleString('es-CO')}).
          Los precios y datos salen siempre de la cotización actualizada.{' '}
          {stored.legacy ? 'Pulsa «Editar textos» y guarda para dejar esta oferta en el formato nuevo. ' : ''}
          <button
            type="button"
            className="small"
            disabled={savingEdit}
            onClick={() => void restoreOriginal()}
          >
            <RotateCcw size={13} /> Quitar textos editados
          </button>
          {shown?.missed.length ? (
            <details style={{ marginTop: 6 }}>
              <summary>
                {shown.missed.length} texto{shown.missed.length === 1 ? '' : 's'} ya no se pudo aplicar porque
                ese texto cambió en la cotización. Míralos aquí y vuelve a escribirlos con «Editar textos».
              </summary>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {shown.missed.map((m, i) => (
                  <li key={i}>
                    <i>{m.from.slice(0, 120)}</i> → {parseFragment(m.html).textContent?.slice(0, 300)}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {dropboxPath ? (
        <div className="alert info no-print">
          Se descargaron la oferta (HTML) y el análisis de costos (Excel). Guarda el PDF (Imprimir → Guardar
          como PDF) y los archivos en:
          <br />
          <code
            style={{
              background: 'var(--panel-2)',
              color: 'var(--text)',
              padding: '2px 8px',
              borderRadius: 6,
            }}
          >
            {dropboxPath}
          </code>{' '}
          <button
            type="button"
            className="small"
            onClick={() =>
              void navigator.clipboard.writeText(dropboxPath).then(() => notify('✓ Ruta copiada'))
            }
          >
            <Copy size={13} /> Copiar ruta
          </button>
        </div>
      ) : null}

      {email ? (
        <div className="card no-print email-card">
          <div className="sub">
            Para: <b>{email.to || '(sin correo — complétalo en los datos del cliente)'}</b>
            <br />
            Asunto: <b>{email.subject}</b>
          </div>
          <textarea
            className="input"
            rows={14}
            value={email.body}
            onChange={(e) => setEmail({ ...email, body: e.target.value })}
          />
          <div className="filters" style={{ marginTop: 8 }}>
            <a
              className="btn small primary"
              href={`mailto:${encodeURIComponent(email.to)}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`}
            >
              Abrir en mi correo
            </a>
            <button
              type="button"
              className="small"
              onClick={() =>
                void navigator.clipboard.writeText(email.body).then(() => notify('✓ Texto copiado'))
              }
            >
              Copiar texto
            </button>
            <span className="hint">Recuerda adjuntar el PDF de la oferta.</span>
          </div>
        </div>
      ) : null}

      {!company.signatoryName ? (
        <div className="alert warning no-print">
          Faltan los datos de la firma y contacto de la empresa. Complétalos en{' '}
          <Link to="/settings">Configuración</Link>.
        </div>
      ) : null}

      {/* Oferta generada desde la cotización (oculta): base para editar y aplicar los textos. */}
      <div ref={baseRef} hidden aria-hidden>
        <ProposalDocument quote={quote} company={company} />
      </div>
      <div ref={docRef} className="offer-frame">
        {editing ? (
          <>
            <style>{proposalCss}</style>
            <div
              ref={(el) => {
                editRef.current = el;
                shownRef.current = el;
              }}
              className="proposal-doc offer-editing"
              contentEditable
              suppressContentEditableWarning
              spellCheck
              dangerouslySetInnerHTML={{ __html: editHtml }}
            />
          </>
        ) : shown ? (
          <div className="proposal-doc" ref={shownRef}>
            <style>{proposalCss}</style>
            <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: shown.html }} />
          </div>
        ) : (
          <ProposalDocument quote={quote} company={company} />
        )}
      </div>
    </div>
  );
}
