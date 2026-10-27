import {
  addDaysIso,
  BUSINESS_UNIT_LABELS,
  computeQuote,
  formatCop,
  formatLongDate,
  PAYMENT_MODE_LABELS,
  SERVICE_TYPE_LABELS,
  type CompanyProfile,
  type Quote,
  type QuoteItem,
} from '@ggis/domain';
import proposalCss from './proposal.css?raw';
import { describeItem, effectiveBusinessUnit, fillTerms, proposalContent } from './proposal-content';
import { attachmentUrl, LibraryImage, offerImages, photoCredit } from '../../shared/LibraryImage';

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

function SectionHead({ number, title }: { number: string; title: string }) {
  return (
    <div className="pp-sec-head">
      <div className="pp-sec-num">{number}</div>
      <h1 className="pp-h1">{title}</h1>
    </div>
  );
}

export function ProposalDocument({ quote: q, company }: { quote: Quote; company: CompanyProfile }) {
  const { totals: t, items } = computeQuote(q);
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
  const serviceLabel = q.serviceType ? SERVICE_TYPE_LABELS[q.serviceType] : '';
  const unitLine = [unitLabel, serviceLabel].filter(Boolean).join(' · ') || 'Solución integral';
  const validUntil = formatLongDate(addDaysIso(q.issueDate, q.validDays));
  const itemPages = billable.length ? chunk(billable, ITEMS_PER_PAGE) : [[]];
  const totalPages = 5 + itemPages.length;
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
  const paymentValue = paymentParts.length
    ? paymentParts.map((x) => `${x.pct}%`).join(' / ')
    : PAYMENT_MODE_LABELS[q.terms.paymentMode];
  const paymentSub = paymentParts.length
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
          <h1 className="pp-cover-title">{content.tagline}</h1>
          <div className="pp-cover-client">
            <div className="nm">{q.client.name || 'Cliente'}</div>
            <div className="pr">
              {q.client.project || 'Proyecto'}
              <br />
              {q.client.city || 'Colombia'}
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
          <SectionHead number="01" title={content.needTitle} />
          <p className="pp-intro">{content.needIntro}</p>

          <div className="pp-client">
            <div>
              <div className="k">Cliente</div>
              <div className="v">{q.client.name || '—'}</div>
            </div>
            <div>
              <div className="k">Proyecto</div>
              <div className="v">{q.client.project || '—'}</div>
            </div>
            <div>
              <div className="k">Ciudad</div>
              <div className="v">{q.client.city || '—'}</div>
            </div>
            <div>
              <div className="k">Unidad</div>
              <div className="v">{unitLine}</div>
            </div>
            {clientAddress ? (
              <div>
                <div className="k">Dirección</div>
                <div className="v">{clientAddress}</div>
              </div>
            ) : null}
            {projectSite ? (
              <div>
                <div className="k">Sitio del proyecto</div>
                <div className="v">{projectSite}</div>
              </div>
            ) : null}
          </div>

          <div className="pp-opportunity">
            <div className="k">La oportunidad</div>
            <p>{opportunity}</p>
          </div>

          {/* La foto (y el mapa) ocupan el espacio que quede en la página, sin tapar el pie. */}
          <div className={mapImage ? 'pp-photo-row with-map' : 'pp-photo-row'}>
            <div className="pp-photo">
              <LibraryImage candidates={needImages} alt="Instalaciones del cliente" />
              {needCredit ? <div className="pp-credit">Foto: {needCredit}</div> : null}
              <div className="ov">
                <b>{content.needCaption}</b>
                <span>{content.needSubcaption}</span>
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
          <SectionHead number="02" title={content.architectureTitle} />
          <p className="pp-intro">{content.architectureIntro}</p>

          <div className="pp-media-grid">
            <div className="pp-media">
              <LibraryImage candidates={architectureImages} alt="Operación y monitoreo" />
              {solutionCredit ? <div className="pp-credit">Foto: {solutionCredit}</div> : null}
              <div className="label">{content.architectureCaption}</div>
            </div>
            <div className="pp-diagram">
              <div className="dt">Cadena de respuesta</div>
              <div className="flow">
                <div className="step">
                  <em>01</em>
                  {content.flow[0]}
                </div>
                <div className="arrow">→</div>
                <div className="step">
                  <em>02</em>
                  {content.flow[1]}
                </div>
                <div className="arrow">→</div>
                <div className="step">
                  <em>03</em>
                  {content.flow[2]}
                </div>
              </div>
              <div className="note">Equipos, configuración y pruebas integrados para responder a tiempo.</div>
            </div>
          </div>

          <div className="pp-lists">
            <div className="pp-dark-list">
              <h3>Lo que integra G&amp;G</h3>
              <ul>
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
                            <b>{meta.title}</b>
                            <span>{meta.detail}</span>
                          </td>
                          <td className="cant">
                            {quantityText(it.quantity)}
                            <small>{it.unit || 'UN'}</small>
                          </td>
                          <td className="money mut">{formatCop(b.saleUnitPrice)}</td>
                          <td className="money">{formatCop(b.saleTotal)}</td>
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
                  <div className="pp-tot-wrap">
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
                            <td>{formatCop(t.total)}</td>
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
          <SectionHead number="04" title={content.implementationTitle} />
          <p className="pp-intro">{content.implementationIntro}</p>

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
            <p>{fillTerms(content.delivery, q)}</p>
          </div>

          <div className="pp-check-title">Antes de aprobar la orden</div>
          <div className="pp-check">
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
            <p>{content.commitment}</p>
          </div>
          <PageFooter page={4 + itemPages.length} total={totalPages} number={q.number} />
        </div>
      </section>

      {/* 06 · CIERRE */}
      <section className="pp-page pp-last">
        <div className="pp-pad">
          <PageHead left="Condiciones" right="05 / Cierre" />
          <SectionHead number="05" title={content.closingTitle} />
          <p className="pp-intro">{content.closingIntro}</p>

          <div className="pp-cards3">
            <div className="pp-card-dark">
              <div className="k">Pago</div>
              <div className={`v${paymentValue.length > 12 ? ' long' : ''}`}>{paymentValue}</div>
              <div className="s">{paymentSub}</div>
            </div>
            <div className="pp-card-dark">
              <div className="k">Garantía</div>
              <div className="v">{warrantyLabel(q.terms.warranty)}</div>
              <div className="s">Por defectos de fabricación, según condiciones.</div>
            </div>
            <div className="pp-card-dark">
              <div className="k">Instalación</div>
              <div className={`v${installation.length > 18 ? ' long' : ''}`}>{installation}</div>
              <div className="s">Sujeto a disponibilidad y condiciones del sitio.</div>
            </div>
          </div>

          <div className="pp-two-col">
            <div>
              <h3>Incluye</h3>
              <ul>
                {content.includes.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>No incluye</h3>
              <ul>
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
          <PageFooter page={5 + itemPages.length} total={totalPages} number={q.number} />
        </div>
      </section>
    </div>
  );
}
