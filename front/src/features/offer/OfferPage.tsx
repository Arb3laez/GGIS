import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  BUSINESS_UNIT_LABELS,
  computeQuote,
  formatCop,
  safeFileName,
  type CompanyProfile,
  type Quote,
} from '@ggis/domain';
import { downloadFrom, saveBlob } from '../../api/http';
import { useCompanyProfile, useQuote } from '../../api/queries';
import { ArrowLeft, Copy, Download, FolderSync, Mail, Printer } from 'lucide-react';
import { errorMessage, useToast } from '../../shared/feedback';
import { OfferDocument, paymentText } from './OfferDocument';

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
    `Adjunto encontrará la oferta comercial ${q.number} correspondiente a: ${q.client.project || 'el proyecto solicitado'}.`,
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
    subject: `Oferta comercial ${q.number} — ${q.client.project} — ${company.tradeName}`,
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

  if (error) return <div className="alert danger">{errorMessage(error)}</div>;
  if (!quote || !company) return <div className="empty">Cargando oferta…</div>;

  const baseName = `Oferta ${quote.number} - ${safeFileName(quote.client.name)}`;

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

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div className="editor-head no-print">
        <div>
          <Link
            to={`/quotes/${quote.id}`}
            className="kicker"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
          >
            <ArrowLeft size={14} /> Volver a editar {quote.number}
          </Link>
          <h1>Oferta para el cliente</h1>
        </div>
        <div className="toolbar">
          <button type="button" onClick={() => setEmail(emailDraft(quote, company))}>
            <Mail size={16} /> Preparar correo
          </button>
          <button type="button" onClick={() => void dropboxPackage()}>
            <FolderSync size={16} /> Paquete Dropbox
          </button>
          <button type="button" onClick={() => void downloadHtml()}>
            <Download size={16} /> HTML
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => window.print()}
            title="En el diálogo elige 'Guardar como PDF'"
          >
            <Printer size={16} /> Imprimir / PDF
          </button>
        </div>
      </div>

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

      <div ref={docRef} className="offer-frame">
        <OfferDocument quote={quote} company={company} />
      </div>
    </div>
  );
}
