import {
  addDaysIso,
  BUSINESS_UNIT_LABELS,
  computeQuote,
  formatCop,
  formatLongDate,
  PAYMENT_KIND_LABELS,
  PAYMENT_MODE_LABELS,
  paymentSchedule,
  SERVICE_TYPE_LABELS,
  type CompanyProfile,
  type Quote,
  type QuoteItem,
} from '@ggis/domain';
import proposalCss from './proposal.css?raw';
import { describeItem, effectiveBusinessUnit, fillTerms, proposalContent } from './proposal-content';
import { attachmentUrl, LibraryImage, offerImages, photoCredit } from '../../shared/LibraryImage';
import { field } from './offer-fields';

const ITEMS_PER_PAGE = 9;

function chunk<T>(xs: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

const matches = (item: QuoteItem, patterns: string[]) => {
  const text = item.description.toLowerCase();
  return patterns.some((p) => text.includes(p));
};

const quantityText = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(n);

/** Título corto y especificación para la tabla; en CCTV sigue el lenguaje de la propuesta base. */
function proposalItem(item: QuoteItem, unit: string | null): { title: string; detail: string } {
  if (unit === 'cctv') {
    const d = item.description.toLowerCase();
    const rules: Array<[RegExp, string, string]> = [
      [/c[aá]mara bala/, 'Cámaras bala IP', '2 MP · audio · LED 40 m · IP67'],
      [/c[aá]mara domo/, 'Cámaras domo IP', '2 MP · audio · Full Color · IP67'],
      [/nvr|grabador/, 'NVR 16 canales', 'Smart H.265+ · HDMI 4K / VGA · SATA'],
      [/switch|poe/, 'Switch PoE administrable', 'Red y alimentación de equipos'],
      [/cable.*utp|utp.*cat/, 'Cable UTP Cat 6', 'Máximo 305 m'],
      [/disco|s300/, 'Disco de videovigilancia 4 TB', 'SATA · 5.400 RPM · caché 256 MB'],
      [/rack|gabinete/, 'Rack y organización', 'Organización física del sistema'],
      [/tuber[ií]a|pvc|cajas|soportes/, 'Tubería, cajas y soportes', 'Canalización y protección'],
      [/mano de obra|instalaci|configuraci/, 'Instalación y configuración', 'Montaje y puesta en marcha'],
    ];
    const found = rules.find(([re]) => re.test(d));
    if (found) return { title: found[1], detail: found[2] };
  }
  return { title: item.description, detail: describeItem(item) };
}

function warrantyLabel(text: string): string {
  const match = text.match(/(\d+)\s*años?|un\s*\(?1\)?\s*año/i);
  if (!match) return 'Según condiciones';
  const years = match[1] ?? '1';
  return `${years} año${years === '1' ? '' : 's'}`;
}

/** Bloque de texto de las condiciones de la oferta (lo que se escribe en "Condiciones de la oferta"). */
interface TermsBlock {
  title: string;
  text: string;
  /** Campo del cotizador de donde sale (para guardar lo editado sobre la oferta). */
  field?: string;
}

/**
 * Reparte los textos de condiciones en páginas A4 según su largo (la página no crece: lo que no
 * cabe se cortaría). Un texto muy largo se parte por párrafos o frases y sigue en la página siguiente.
 */
export function paginateTerms(blocks: TermsBlock[], firstBudget = 2_600, nextBudget = 4_200): TermsBlock[][] {
  const pages: TermsBlock[][] = [[]];
  let left = firstBudget;
  const HEADING = 120; // lo que "ocupa" el título de cada bloque
  for (const block of blocks) {
    const pieces = block.text.split(/(?<=\n)|(?<=\.\s)/);
    let current = '';
    let title = block.title;
    const flush = () => {
      if (!current.trim()) return;
      pages[pages.length - 1]!.push({ title, text: current.trim(), field: block.field });
      left -= current.length + HEADING;
      current = '';
      title = `${block.title} (continuación)`;
    };
    for (const piece of pieces) {
      if (current.length + piece.length + HEADING > left && (current || pages[pages.length - 1]!.length)) {
        flush();
        pages.push([]);
        left = nextBudget;
      }
      current += piece;
    }
    flush();
  }
  return pages.filter((pg) => pg.length > 0);
}

function PageHead({ left, right }: { left: string; right: string }) {
  return (
    <div className="pp-ph">
      <span>{left}</span>
      <span>
        <b>{right}</b>
      </span>
    </div>
  );
}

function PageFooter({ page, total, number }: { page: number; total: number; number: string }) {
  return (
    <div className="pp-pf">
      <span>G&amp;G Innova Solutions · La respuesta a tu necesidad</span>
      <span>
        <b>{number}</b> · {page} / {total}
      </span>
    </div>
  );
}

function SectionHead({ number, title, fieldKey }: { number: string; title: string; fieldKey?: string }) {
  return (
    <div className="pp-sec-head">
      <div className="pp-sec-num">{number}</div>
      <h1 className="pp-h1" {...(fieldKey ? field(fieldKey) : {})}>
        {title}
      </h1>
    </div>
  );
}

export function ProposalDocument({ quote: q, company }: { quote: Quote; company: CompanyProfile }) {
  const breakdown = computeQuote(q);
  const { totals: t, items } = breakdown;
  const billable = q.items.map((it, i) => ({ it, b: items[i]! })).filter(({ b }) => b.isBillable);
  const content = proposalContent(q);
  const unit = effectiveBusinessUnit(q);
  const unitLabel = unit ? BUSINESS_UNIT_LABELS[unit] : '';
  // Imágenes alusivas: las generadas con IA en la investigación o, si no hay, la biblioteca G&G.
  const needImages = offerImages(q.research, unit, 'need');
  const architectureImages = offerImages(q.research, unit, 'solution');
  const clientAddress = q.research?.address || '';
  const projectSite = q.research?.projectSite || '';
  const mapImage = q.research?.mapImage ?? null;
  const needCredit = photoCredit(q.research, 'need');
  const solutionCredit = photoCredit(q.research, 'solution');
  const opportunity = q.research?.proposalText.trim() || content.opportunity;
  const opportunityField = q.research?.proposalText.trim() ? 'research:proposalText' : 'text:opportunity';
  // "No incluye" sale de las Exclusiones del cotizador salvo que se haya escrito una lista propia.
  const excludesFromTerms = !q.offerTexts?.excludes?.trim() && !!q.terms.exclusions.trim();
  const serviceLabel = q.serviceType ? SERVICE_TYPE_LABELS[q.serviceType] : '';
  const unitLine = [unitLabel, serviceLabel].filter(Boolean).join(' · ') || 'Solución integral';
  const validUntil = formatLongDate(addDaysIso(q.issueDate, q.validDays));
  const itemPages = billable.length ? chunk(billable, ITEMS_PER_PAGE) : [[]];
  // Plan de pagos por cortes (anticipos, cortes de obra, pago final) con su valor en pesos.
  const schedule = paymentSchedule(q, breakdown);
  const customPlan = (q.terms.paymentPlan?.length ?? 0) > 0;
  const paymentNote = q.terms.paymentNote?.trim() ?? '';
  const showPlan = customPlan || !!paymentNote;
  const itemName = (id: string) => q.items.find((i) => i.id === id)?.description ?? 'ítem';
  const baseText = (r: (typeof schedule.rows)[number]) =>
    r.base === 'items'
      ? `de ${r.itemIds.map(itemName).join(', ').slice(0, 70) || 'los ítems elegidos'}`
      : r.base === 'rest'
        ? 'del resto del contrato'
        : 'del contrato';
  // Textos de "Condiciones de la oferta" del editor: van en su propia página antes del cierre.
  const termsPages = paginateTerms(
    [
      { title: 'Alcance del suministro', text: q.terms.scope, field: 'terms:scope' },
      { title: 'Garantía', text: q.terms.warranty, field: 'terms:warranty' },
      // Si las exclusiones ya salen como "No incluye" en el cierre, no se repiten aquí.
      ...(excludesFromTerms
        ? []
        : [{ title: 'Exclusiones y comentarios', text: q.terms.exclusions, field: 'terms:exclusions' }]),
      { title: 'Condiciones generales', text: q.terms.generalConditions, field: 'terms:generalConditions' },
    ].filter((b) => b.text.trim()),
    // La tabla del plan de pagos ocupa parte de la primera página.
    showPlan ? Math.max(600, 2_600 - schedule.rows.length * 140 - paymentNote.length - 200) : 2_600,
  );
  if (showPlan && !termsPages.length) termsPages.push([]);
  const totalPages = 5 + itemPages.length + termsPages.length;
  const closingNo = termsPages.length ? '06' : '05';
  const p = q.pricing;

  const signerName = company.signatoryName || company.legalName || company.tradeName;
  const signerTitle = company.signatoryTitle || 'Gerencia comercial';
  const signerContact = company.signatoryContact || company.phones || 'comercial1@ggis.com.co';

  const components = content.components
    .map((c) => ({ ...c, items: billable.filter(({ it }) => matches(it, c.patterns)) }))
    .filter((c) => c.items.length > 0)
    .slice(0, 4);
  const componentList = components.length
    ? components
    : billable.slice(0, 4).map(({ it }) => ({
        title: it.description,
        text: describeItem(it),
        patterns: [],
        items: [],
      }));

  const stats = content.stats
    .map((s) => ({
      label: s.label,
      value: billable
        .filter(({ it }) => matches(it, s.patterns))
        .reduce((sum, { it }) => sum + it.quantity, 0),
    }))
    .filter((s) => s.value > 0)
    .slice(0, 4);
  const statList = stats.length
    ? stats
    : [
        { label: 'Ítems cotizados', value: billable.length },
        { label: 'Unidades', value: billable.reduce((sum, { it }) => sum + it.quantity, 0) },
      ];

  const paymentParts = [
    { label: 'Anticipo', pct: q.terms.advancePct },
    { label: 'Avance', pct: q.terms.progressPct },
    { label: 'Contra entrega', pct: q.terms.onDeliveryPct },
  ].filter((x) => x.pct > 0);
  const kindsSummary = [...new Set(schedule.rows.map((r) => r.kind))]
    .map((k) => {
      const n = schedule.rows.filter((r) => r.kind === k).length;
      return n > 1
        ? `${n} ${k === 'progress' ? 'cortes de obra' : `${PAYMENT_KIND_LABELS[k].toLowerCase()}s`}`
        : PAYMENT_KIND_LABELS[k];
    })
    .join(' + ');
  const paymentValue = customPlan
    ? schedule.rows.length <= 3
      ? schedule.rows.map((r) => `${Math.round(r.shareOfTotal)}%`).join(' / ')
      : `${schedule.rows.length} pagos`
    : paymentParts.length
      ? paymentParts.map((x) => `${x.pct}%`).join(' / ')
      : PAYMENT_MODE_LABELS[q.terms.paymentMode];
  const paymentSub = customPlan
    ? kindsSummary
    : paymentParts.length
      ? paymentParts.map((x) => x.label).join(' + ')
      : PAYMENT_MODE_LABELS[q.terms.paymentMode];
  const installation = q.terms.installationTime || 'Según alcance';

  return (
    <div className="proposal-doc">
      <style>{proposalCss}</style>

      {/* 01 · PORTADA */}
      <section className="pp-page pp-first pp-cover">
        <img className="pp-cover-img" src="/offer/cover.jpg" alt="Bodega industrial" />
        <div className="pp-cover-line" />
        <div className="pp-cover-vertical">Seguridad que responde</div>
        <div className="pp-cover-left">
          <div className="pp-cover-logo">
            <img src="/brand/gyg.png" alt={company.tradeName} />
          </div>
          <div className="pp-cover-kicker">Propuesta comercial</div>
          <div className="pp-cover-rule" />
          <h1 className="pp-cover-title" {...field('text:tagline')}>
            {content.tagline}
          </h1>
          <div className="pp-cover-client">
            <div className="nm" {...field('client:name')}>
              {q.client.name || 'Cliente'}
            </div>
            <div className="pr">
              <span {...field('client:project')}>{q.client.project || 'Proyecto'}</span>
              <br />
              <span {...field('client:city')}>{q.client.city || 'Colombia'}</span>
            </div>
            <div className="by">
              Una propuesta de {company.tradeName}
              <br />
              {unitLine}
            </div>
          </div>
        </div>
        <div className="pp-cover-offer">
          <div className="k">Oferta</div>
          <div className="n">{q.number}</div>
          <div className="s">
            {billable.length} ítems · {unitLabel || 'Solución integral'}
          </div>
        </div>
      </section>

      {/* 02 · NECESIDAD */}
      <section className="pp-page">
        <div className="pp-pad pp-fill">
          <PageHead left="G&G Innova Solutions" right="01 / La necesidad" />
          <SectionHead number="01" title={content.needTitle} fieldKey="text:needTitle" />
          <p className="pp-intro" {...field('text:needIntro')}>
            {content.needIntro}
          </p>

          <div className="pp-client">
            <div>
              <div className="k">Cliente</div>
              <div className="v" {...field('client:name')}>
                {q.client.name || '—'}
              </div>
            </div>
            <div>
              <div className="k">Proyecto</div>
              <div className="v" {...field('client:project')}>
                {q.client.project || '—'}
              </div>
            </div>
            <div>
              <div className="k">Ciudad</div>
              <div className="v" {...field('client:city')}>
                {q.client.city || '—'}
              </div>
            </div>
            <div>
              <div className="k">Unidad</div>
              <div className="v">{unitLine}</div>
            </div>
            {clientAddress ? (
              <div>
                <div className="k">Dirección</div>
                <div className="v" {...field('research:address')}>
                  {clientAddress}
                </div>
              </div>
            ) : null}
            {projectSite ? (
              <div>
                <div className="k">Sitio del proyecto</div>
                <div className="v" {...field('research:projectSite')}>
                  {projectSite}
                </div>
              </div>
            ) : null}
          </div>

          <div className="pp-opportunity">
            <div className="k">La oportunidad</div>
            <p {...field(opportunityField)}>{opportunity}</p>
          </div>

          {/* La foto (y el mapa) ocupan el espacio que quede en la página, sin tapar el pie. */}
          <div className={mapImage ? 'pp-photo-row with-map' : 'pp-photo-row'}>
            <div className="pp-photo">
              <LibraryImage candidates={needImages} alt="Instalaciones del cliente" />
              {needCredit ? <div className="pp-credit">Foto: {needCredit}</div> : null}
              <div className="ov">
                <b {...field('text:needCaption')}>{content.needCaption}</b>
                <span {...field('text:needSubcaption')}>{content.needSubcaption}</span>
              </div>
            </div>
            {mapImage ? (
              <div className="pp-map">
                <img src={attachmentUrl(mapImage)} alt="Ubicación en Google Maps" />
                <div className="pp-credit">Google Maps</div>
                <div className="lbl">
                  <b>Ubicación</b>
                  <span>{clientAddress || q.research?.location || q.client.city}</span>
                </div>
              </div>
            ) : null}
          </div>
          <PageFooter page={2} total={totalPages} number={q.number} />
        </div>
      </section>

      {/* 03 · ARQUITECTURA */}
      <section className="pp-page">
        <div className="pp-pad">
          <PageHead left="La solución" right="02 / Arquitectura" />
          <SectionHead number="02" title={content.architectureTitle} fieldKey="text:architectureTitle" />
          <p className="pp-intro" {...field('text:architectureIntro')}>
            {content.architectureIntro}
          </p>

          <div className="pp-media-grid">
            <div className="pp-media">
              <LibraryImage candidates={architectureImages} alt="Operación y monitoreo" />
              {solutionCredit ? <div className="pp-credit">Foto: {solutionCredit}</div> : null}
              <div className="label" {...field('text:architectureCaption')}>
                {content.architectureCaption}
              </div>
            </div>
            <div className="pp-diagram">
              <div className="dt">Cadena de respuesta</div>
              <div className="flow">
                <div className="step">
                  <em>01</em>
                  <span {...field('text:flow')}>{content.flow[0]}</span>
                </div>
                <div className="arrow">→</div>
                <div className="step">
                  <em>02</em>
                  <span {...field('text:flow')}>{content.flow[1]}</span>
                </div>
                <div className="arrow">→</div>
                <div className="step">
                  <em>03</em>
                  <span {...field('text:flow')}>{content.flow[2]}</span>
                </div>
              </div>
              <div className="note">Equipos, configuración y pruebas integrados para responder a tiempo.</div>
            </div>
          </div>

          <div className="pp-lists">
            <div className="pp-dark-list">
              <h3>Lo que integra G&amp;G</h3>
              <ul {...field('text:integration')}>
                {content.integration.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
            <div className="pp-light-list">
              <h3>Componentes clave</h3>
              {componentList.map((c) => (
                <div className="pp-comp" key={c.title}>
                  <b>{c.title}</b>
                  <span>{c.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pp-stats">
            {statList.map((s) => (
              <div key={s.label}>
                <b>{quantityText(s.value)}</b>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
          <PageFooter page={3} total={totalPages} number={q.number} />
        </div>
      </section>

      {/* 04 · INVERSIÓN (una o varias páginas) */}
      {itemPages.map((pageItems, index) => {
        const first = index === 0;
        const last = index === itemPages.length - 1;
        const pageNo = 4 + index;
        const start = itemPages.slice(0, index).reduce((sum, xs) => sum + xs.length, 0);
        return (
          <section className="pp-page" key={`items-${index}`}>
            <div className="pp-pad">
              <PageHead left="Inversión" right="03 / Detalle económico" />
              {first ? (
                <>
                  <SectionHead number="03" title={'Una inversión clara,\nínea por línea'} />
                  <p className="pp-intro">
                    La propuesta separa equipos, infraestructura y mantenimiento para que el alcance se pueda
                    revisar con transparencia.
                  </p>
                </>
              ) : (
                <SectionHead number="03" title={'Detalle económico\n(continuación)'} />
              )}

              <table className="pp-table">
                <thead>
                  <tr>
                    <th />
                    <th>Componente</th>
                    <th style={{ textAlign: 'center' }}>Cant.</th>
                    <th style={{ textAlign: 'right' }}>Unitario</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.length ? (
                    pageItems.map(({ it, b }, i) => {
                      const meta = proposalItem(it, unit);
                      return (
                        <tr key={it.id}>
                          <td className="n">{String(start + i + 1).padStart(2, '0')}</td>
                          <td className="comp">
                            <b {...field(`item:${it.id}:description`)}>{meta.title}</b>
                            <span {...field(`item:${it.id}:notes`)}>
                              {(it.notes ?? '').trim() || meta.detail}
                            </span>
                          </td>
                          <td className="cant">
                            <span {...field(`item:${it.id}:quantity`)}>{quantityText(it.quantity)}</span>
                            <small {...field(`item:${it.id}:unit`)}>{it.unit || 'UN'}</small>
                          </td>
                          <td className="money mut" {...field(`item:${it.id}:salePrice`)}>
                            {formatCop(b.saleUnitPrice)}
                          </td>
                          <td
                            className="money"
                            contentEditable={false}
                            title="Se calcula: cantidad × unitario"
                          >
                            {formatCop(b.saleTotal)}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="comp">
                        <b>No hay ítems facturables en esta cotización.</b>
                        <span>Revisa las descripciones y cantidades antes de enviar la propuesta.</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {last ? (
                <>
                  <div className="pp-tot-wrap" contentEditable={false} title="Los totales se calculan solos">
                    <div className="pp-tot">
                      <table>
                        <tbody>
                          <tr>
                            <td>Subtotal</td>
                            <td>{formatCop(t.subtotal)}</td>
                          </tr>
                          {t.aiu ? (
                            <>
                              <tr>
                                <td>Administración ({p.aiu.adminPct}%)</td>
                                <td>{formatCop(t.aiu.admin)}</td>
                              </tr>
                              <tr>
                                <td>Imprevistos ({p.aiu.contingencyPct}%)</td>
                                <td>{formatCop(t.aiu.contingency)}</td>
                              </tr>
                              <tr>
                                <td>Utilidad ({p.aiu.profitPct}%)</td>
                                <td>{formatCop(t.aiu.profit)}</td>
                              </tr>
                              <tr>
                                <td>IVA sobre utilidad ({p.aiu.vatOnProfitPct}%)</td>
                                <td>{formatCop(t.aiu.vatOnProfit)}</td>
                              </tr>
                            </>
                          ) : (
                            <tr>
                              <td>IVA ({p.vatPct}%)</td>
                              <td>{formatCop(t.vat)}</td>
                            </tr>
                          )}
                          <tr className="total">
                            <td>Total oferta</td>
                            {/* Único valor editable de los totales: el cotizador ajusta el margen para llegar a él. */}
                            <td
                              contentEditable
                              suppressContentEditableWarning
                              title="Escribe el total que quieres: el margen se ajusta solo"
                              {...field('pricing:total')}
                            >
                              {formatCop(t.total)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <p className="pp-note">
                    Valores en pesos colombianos. Oferta válida hasta el {validUntil}. Los precios están
                    sujetos a cambios si cambian las especificaciones o el alcance.
                  </p>
                </>
              ) : null}
              <PageFooter page={pageNo} total={totalPages} number={q.number} />
            </div>
          </section>
        );
      })}

      {/* 05 · IMPLEMENTACIÓN */}
      <section className="pp-page">
        <div className="pp-pad">
          <PageHead left="Implementación" right="04 / Cómo avanzamos" />
          <SectionHead number="04" title={content.implementationTitle} fieldKey="text:implementationTitle" />
          <p className="pp-intro" {...field('text:implementationIntro')}>
            {content.implementationIntro}
          </p>

          <div className="pp-stages">
            {content.stages.map((stage) => (
              <div className="pp-stage" key={stage.label}>
                <div className="sk">{stage.label}</div>
                <h3>{stage.title}</h3>
                <p>{fillTerms(stage.text, q)}</p>
              </div>
            ))}
          </div>

          <div className="pp-delivery">
            <div className="k">Entrega recomendada</div>
            <p {...field('text:delivery')}>{fillTerms(content.delivery, q)}</p>
          </div>

          <div className="pp-check-title">Antes de aprobar la orden</div>
          <div className="pp-check" {...field('text:checklist')}>
            {content.checklist.map((x) => (
              <div key={x}>{x}</div>
            ))}
          </div>

          <div className="pp-check-title">Qué revisamos en sitio</div>
          <div className="pp-visit">
            {content.visit.map((x) => (
              <div key={x.title}>
                <b>{x.title}</b>
                <span>{x.text}</span>
              </div>
            ))}
          </div>

          <div className="pp-commitment">
            <div className="k">Nuestro compromiso</div>
            <p {...field('text:commitment')}>{content.commitment}</p>
          </div>
          <PageFooter page={4 + itemPages.length} total={totalPages} number={q.number} />
        </div>
      </section>

      {/* 06 · ALCANCE Y CONDICIONES (una o varias páginas, solo si hay textos) */}
      {termsPages.map((blocks, i) => (
        <section className="pp-page" key={`terms-${i}`}>
          <div className="pp-pad">
            <PageHead left="Condiciones" right="05 / Alcance y condiciones" />
            {i === 0 ? (
              <>
                <SectionHead number="05" title="Alcance y condiciones de la oferta" />
                <div className="pp-terms-facts">
                  <div>
                    <div className="k">Equipos nacionales</div>
                    <div className="v" {...field('terms:deliveryNational')}>
                      {q.terms.deliveryNational || 'Según disponibilidad'}
                    </div>
                  </div>
                  <div>
                    <div className="k">Importación</div>
                    <div className="v" {...field('terms:deliveryImport')}>
                      {q.terms.deliveryImport || 'Según disponibilidad'}
                    </div>
                  </div>
                  <div>
                    <div className="k">Instalación</div>
                    <div className="v" {...field('terms:installationTime')}>
                      {installation}
                    </div>
                  </div>
                  <div
                    contentEditable={false}
                    title="Se cambia en Condiciones de la oferta (porcentajes de pago)"
                  >
                    <div className="k">Forma de pago</div>
                    <div className="v">
                      {customPlan
                        ? kindsSummary
                        : paymentParts.length
                          ? paymentParts.map((x) => `${x.label} ${x.pct}%`).join(' · ')
                          : PAYMENT_MODE_LABELS[q.terms.paymentMode]}
                      {q.terms.financingDays > 0 ? ` · ${q.terms.financingDays} días` : ''}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
            {i === 0 && showPlan ? (
              <div className="pp-payplan">
                <h3>Forma de pago</h3>
                {customPlan ? (
                  <table contentEditable={false} title="Se cambia en el plan de pagos del cotizador">
                    <thead>
                      <tr>
                        <th>Pago</th>
                        <th>Cuándo</th>
                        <th>Cálculo</th>
                        <th style={{ textAlign: 'right' }}>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.rows.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <b>{r.concept || PAYMENT_KIND_LABELS[r.kind]}</b>
                          </td>
                          <td>{r.when}</td>
                          <td>
                            {Math.round(r.pct * 100) / 100}% {baseText(r)}
                          </td>
                          <td style={{ textAlign: 'right' }}>{formatCop(r.amount)}</td>
                        </tr>
                      ))}
                      <tr className="tot">
                        <td colSpan={3}>Total del contrato</td>
                        <td style={{ textAlign: 'right' }}>{formatCop(schedule.scheduled)}</td>
                      </tr>
                    </tbody>
                  </table>
                ) : null}
                {paymentNote ? <p {...field('terms:paymentNote')}>{paymentNote}</p> : null}
              </div>
            ) : null}
            <div className="pp-terms">
              {blocks.map((b) => (
                <div key={b.title}>
                  <h3>{b.title}</h3>
                  <p {...(b.field ? field(b.field) : {})}>{b.text}</p>
                </div>
              ))}
            </div>
            <PageFooter page={5 + itemPages.length + i} total={totalPages} number={q.number} />
          </div>
        </section>
      ))}

      {/* 07 · CIERRE */}
      <section className="pp-page pp-last">
        <div className="pp-pad">
          <PageHead left="Condiciones" right={`${closingNo} / Cierre`} />
          <SectionHead number={closingNo} title={content.closingTitle} fieldKey="text:closingTitle" />
          <p className="pp-intro" {...field('text:closingIntro')}>
            {content.closingIntro}
          </p>

          <div className="pp-cards3">
            <div
              className="pp-card-dark"
              contentEditable={false}
              title="Se calcula con los porcentajes de pago"
            >
              <div className="k">Pago</div>
              <div className={`v${paymentValue.length > 12 ? ' long' : ''}`}>{paymentValue}</div>
              <div className="s">{paymentSub}</div>
            </div>
            <div className="pp-card-dark" contentEditable={false} title="Sale del texto de Garantía">
              <div className="k">Garantía</div>
              <div className="v">{warrantyLabel(q.terms.warranty)}</div>
              <div className="s">Por defectos de fabricación, según condiciones.</div>
            </div>
            <div className="pp-card-dark">
              <div className="k">Instalación</div>
              <div
                className={`v${installation.length > 18 ? ' long' : ''}`}
                {...field('terms:installationTime')}
              >
                {installation}
              </div>
              <div className="s">Sujeto a disponibilidad y condiciones del sitio.</div>
            </div>
          </div>

          <div className="pp-two-col">
            <div>
              <h3>Incluye</h3>
              <ul {...field('text:includes')}>
                {content.includes.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>No incluye</h3>
              <ul {...field(excludesFromTerms ? 'terms:exclusions' : 'text:excludes')}>
                {content.excludes.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="pp-approval">
            <img className="logo" src="/brand/gyg.png" alt={company.tradeName} />
            <h3>Aprobación de la propuesta</h3>
            <p>
              Con la aprobación de esta oferta, el cliente confirma el interés en avanzar con el alcance
              descrito y acepta que cualquier adicional deberá cotizarse y aprobarse por escrito antes de
              ejecutarse.
            </p>
            <div className="pp-signs">
              <div className="pp-sign">
                <b>{signerName}</b>
                <span>{signerTitle}</span>
                <span>{signerContact}</span>
              </div>
              <div className="pp-sign">
                <b>{q.client.name || 'Cliente'}</b>
                <span>Nombre, cargo y firma</span>
                <span>Fecha de aprobación</span>
              </div>
            </div>
          </div>

          <div className="pp-thanks">Proteger la operación empieza por una decisión clara.</div>
          <PageFooter page={5 + itemPages.length + termsPages.length} total={totalPages} number={q.number} />
        </div>
      </section>
    </div>
  );
}
